/**
 * Unified Cron: Reminders + Calendar Pre-Meeting Alerts
 * Runs every 5 minutes.
 * Handles: time-based, conditional, recurring reminders + 20-min meeting alerts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { addMinutes, format, parseISO } from 'date-fns';

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

/**
 * Send a WhatsApp message via the Baileys bridge /send endpoint.
 * Falls back gracefully if bridge is unavailable.
 */
async function sendViaBridge(phone: string, message: string): Promise<void> {
  const res = await fetch(BRIDGE_URL + '/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone,
      message,
      secret: process.env.CRON_SECRET,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Bridge send failed (${res.status}): ${body.error || 'unknown'}`);
  }
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
});

export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret') ||
        request.headers.get('authorization')?.replace('Bearer ', '') ||
        request.nextUrl.searchParams.get('secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = {
    timeReminders: 0,
    conditionalReminders: 0,
    recurringReminders: 0,
    meetingAlerts: 0,
    errors: [] as string[],
  };

  try {
    // ============================================================
    // 1. Time-Based Reminders (due_at <= NOW, status = pending, type = time)
    // ============================================================
    const { data: dueReminders } = await supabaseAdmin
      .from('reminders')
      .select('*, users!inner(phone, display_name)')
      .eq('status', 'pending')
      .eq('trigger_type', 'time')
      .lte('due_at', new Date().toISOString())
      .limit(50);

    for (const reminder of dueReminders || []) {
      try {
        const phone = reminder.users?.phone;
        if (!phone) continue;

        let msg = `⏰ *Reminder*\n\n${reminder.text}`;
        if (reminder.context_summary) {
          msg += `\n\n_Context: ${reminder.context_summary.substring(0, 200)}_`;
        }

        await sendViaBridge(phone, msg);
        await supabaseAdmin
          .from('reminders')
          .update({ status: 'done', updated_at: new Date().toISOString() })
          .eq('id', reminder.id);

        stats.timeReminders++;
      } catch (err: any) {
        stats.errors.push(`time-reminder ${reminder.id}: ${err.message}`);
      }
    }

    // ============================================================
    // 2. Conditional Reminders (check if condition met)
    // ============================================================
    const { data: conditionalReminders } = await supabaseAdmin
      .from('reminders')
      .select('*, users!inner(phone, display_name)')
      .eq('status', 'pending')
      .eq('trigger_type', 'conditional')
      .limit(30);

    for (const reminder of conditionalReminders || []) {
      try {
        const phone = reminder.users?.phone;
        const condition = reminder.condition_json;
        if (!phone || !condition) continue;

        if (condition.type === 'no_reply') {
          const checkAfter = new Date(condition.checkAfter || reminder.created_at);
          const waitUntil = addMinutes(checkAfter, (condition.waitHours || 24) * 60);

          // Not time to check yet
          if (new Date() < waitUntil) continue;

          // Check if the contact has replied since checkAfter
          const contactWaId = condition.contactWaId || reminder.contact_wa_id;
          if (!contactWaId) continue;

          const { data: recentReplies } = await supabaseAdmin
            .from('messages')
            .select('id')
            .eq('user_id', reminder.user_id)
            .eq('sender_phone', contactWaId)
            .gt('timestamp', checkAfter.toISOString())
            .eq('is_from_me', false)
            .limit(1);

          if (recentReplies && recentReplies.length > 0) {
            // Contact replied → auto-mark as done
            await supabaseAdmin
              .from('reminders')
              .update({
                status: 'done',
                updated_at: new Date().toISOString(),
                context_summary: (reminder.context_summary || '') + ' [Auto-resolved: contact replied]',
              })
              .eq('id', reminder.id);
            continue;
          }

          // Contact hasn't replied → fire reminder
          const contactName = condition.contactName || 'the contact';
          let msg = `🔔 *Follow-up Needed*\n\n${reminder.text}`;
          msg += `\n\n⏳ ${contactName} hasn't replied in ${condition.waitHours}+ hours.`;

          await sendViaBridge(phone, msg);
          await supabaseAdmin
            .from('reminders')
            .update({ status: 'done', updated_at: new Date().toISOString() })
            .eq('id', reminder.id);

          stats.conditionalReminders++;
        }
      } catch (err: any) {
        stats.errors.push(`conditional-reminder ${reminder.id}: ${err.message}`);
      }
    }

    // ============================================================
    // 3. Recurring Reminders (check if next occurrence is due)
    // ============================================================
    const { data: recurringReminders } = await supabaseAdmin
      .from('reminders')
      .select('*, users!inner(phone, display_name)')
      .eq('status', 'pending')
      .eq('trigger_type', 'recurring')
      .lte('due_at', new Date().toISOString())
      .limit(30);

    for (const reminder of recurringReminders || []) {
      try {
        const phone = reminder.users?.phone;
        if (!phone) continue;

        await sendViaBridge(phone, `🔁 *Recurring Reminder*\n\n${reminder.text}`);

        // Calculate next occurrence and update due_at
        const nextDue = getNextOccurrence(reminder.recurrence_rule);
        await supabaseAdmin
          .from('reminders')
          .update({
            due_at: nextDue,
            last_triggered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', reminder.id);

        stats.recurringReminders++;
      } catch (err: any) {
        stats.errors.push(`recurring-reminder ${reminder.id}: ${err.message}`);
      }
    }

    // ============================================================
    // 4. Pre-Meeting Calendar Alerts (20 min before)
    // ============================================================
    const alertWindow = {
      from: new Date().toISOString(),
      to: addMinutes(new Date(), 25).toISOString(), // 25 min window for 5-min cron buffer
    };

    const { data: upcomingMeetings } = await supabaseAdmin
      .from('calendar_events')
      .select('*, users!inner(phone, display_name)')
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)
      .gte('start_time', alertWindow.from)
      .lte('start_time', alertWindow.to)
      .limit(20);

    for (const meeting of upcomingMeetings || []) {
      try {
        const phone = meeting.users?.phone;
        if (!phone) continue;

        // Generate context briefing via LLM
        let briefing = '';
        if (meeting.conversation_context) {
          try {
            const llmResponse = await openai.chat.completions.create({
              model: process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct',
              messages: [
                {
                  role: 'system',
                  content: 'Summarize this conversation context into a 3-line pre-meeting briefing for WhatsApp. Focus on: what was discussed, key decisions, open questions. Be concise.',
                },
                {
                  role: 'user',
                  content: meeting.conversation_context,
                },
              ],
              temperature: 0.3,
              max_tokens: 200,
            });
            briefing = llmResponse.choices[0]?.message?.content || '';
          } catch {
            briefing = meeting.conversation_context.substring(0, 200);
          }
        }

        // Build alert message
        let alertMsg = `📅 *Meeting in 20 minutes!*\n\n`;
        alertMsg += `*${meeting.title}*\n`;
        alertMsg += `🕐 ${formatTime(meeting.start_time)}`;
        if (meeting.end_time) {
          alertMsg += ` - ${formatTime(meeting.end_time)}`;
        }
        alertMsg += '\n';

        if (meeting.participants && meeting.participants.length > 0) {
          const names = meeting.participants
            .map((p: any) => p.name)
            .filter(Boolean)
            .join(', ');
          if (names) alertMsg += `👥 ${names}\n`;
        }

        if (meeting.meeting_link) {
          alertMsg += `🔗 ${meeting.meeting_link}\n`;
        }

        if (meeting.location) {
          alertMsg += `📍 ${meeting.location}\n`;
        }

        if (briefing) {
          alertMsg += `\n📝 *Context:*\n${briefing}`;
        }

        if (meeting.key_topics && meeting.key_topics.length > 0) {
          alertMsg += `\n\n🏷️ Topics: ${meeting.key_topics.join(', ')}`;
        }

        await sendViaBridge(phone, alertMsg);

        // Mark reminder as sent
        await supabaseAdmin
          .from('calendar_events')
          .update({
            reminder_sent: true,
            reminder_sent_at: new Date().toISOString(),
          })
          .eq('id', meeting.id);

        stats.meetingAlerts++;
      } catch (err: any) {
        stats.errors.push(`meeting-alert ${meeting.id}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Cron/Reminders] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stats,
    }, { status: 500 });
  }
}

// ============================================================
// Helpers
// ============================================================

function getNextOccurrence(rrule?: string): string {
  if (!rrule) return addMinutes(new Date(), 60 * 24).toISOString(); // Default: tomorrow

  const parts = rrule.split(';').reduce((acc, part) => {
    const [key, val] = part.split('=');
    acc[key] = val;
    return acc;
  }, {} as Record<string, string>);

  const freq = parts['FREQ'];
  const hour = parseInt(parts['BYHOUR'] || '9');
  const next = new Date();
  next.setHours(hour, 0, 0, 0);

  if (freq === 'DAILY') {
    next.setDate(next.getDate() + 1);
  } else if (freq === 'WEEKLY') {
    next.setDate(next.getDate() + 7);
  } else if (freq === 'MONTHLY') {
    next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString();
}

function formatTime(iso: string): string {
  try {
    return format(parseISO(iso), 'h:mm a');
  } catch {
    return iso;
  }
}
