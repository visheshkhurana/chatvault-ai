/**
 * Unified Cron: Reminders + Commitment Alerts + Calendar Pre-Meeting Alerts
 * Runs every 5 minutes.
 * Handles:
 *  1. Time-based reminders (due_at <= now)
 *  2. Conditional reminders (no-reply checks)
 *  3. Recurring reminders
 *  4. Pre-meeting calendar alerts (20 min)
 *  5. Overdue commitment notifications (NEW)
 *  6. Due-soon commitment alerts — 24h warning (NEW)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { addMinutes, format, parseISO } from 'date-fns';
import webpush from 'web-push';

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

// Configure web-push VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:support@rememora.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Send a WhatsApp message via the Baileys bridge /send endpoint.
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

/**
 * Send a web push notification to all subscriptions for a user.
 */
async function sendPushNotification(
  supabase: any,
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  try {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (!subs?.length) return;

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: url || '/dashboard',
    });

    for (const sub of subs as any[]) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch {
        // Remove invalid subscription
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  } catch (err) {
    console.warn('[Cron/Reminders] Push send failed:', err);
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

export const runtime = 'nodejs';
export const maxDuration = 60;

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
    overdueAlerts: 0,
    dueSoonAlerts: 0,
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
        const userId = reminder.user_id;

        let msg = `⏰ *Reminder*\n\n${reminder.text}`;
        if (reminder.context_summary) {
          msg += `\n\n_Context: ${reminder.context_summary.substring(0, 200)}_`;
        }

        if (phone) {
          await sendViaBridge(phone, msg);
        }

        // Also send push notification
        await sendPushNotification(
          supabaseAdmin,
          userId,
          '⏰ Reminder',
          reminder.text.substring(0, 150)
        );

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
        if (!condition) continue;

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

          if (phone) {
            await sendViaBridge(phone, msg);
          }

          await sendPushNotification(
            supabaseAdmin,
            reminder.user_id,
            '🔔 Follow-up Needed',
            `${contactName} hasn't replied in ${condition.waitHours}+ hours`
          );

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

        const msg = `🔁 *Recurring Reminder*\n\n${reminder.text}`;
        if (phone) {
          await sendViaBridge(phone, msg);
        }

        await sendPushNotification(
          supabaseAdmin,
          reminder.user_id,
          '🔁 Recurring Reminder',
          reminder.text.substring(0, 150)
        );

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
      to: addMinutes(new Date(), 25).toISOString(),
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
                { role: 'user', content: meeting.conversation_context },
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
        if (meeting.end_time) alertMsg += ` - ${formatTime(meeting.end_time)}`;
        alertMsg += '\n';

        if (meeting.participants?.length > 0) {
          const names = meeting.participants.map((p: any) => p.name).filter(Boolean).join(', ');
          if (names) alertMsg += `👥 ${names}\n`;
        }
        if (meeting.meeting_link) alertMsg += `🔗 ${meeting.meeting_link}\n`;
        if (meeting.location) alertMsg += `📍 ${meeting.location}\n`;
        if (briefing) alertMsg += `\n📝 *Context:*\n${briefing}`;
        if (meeting.key_topics?.length > 0) alertMsg += `\n\n🏷️ Topics: ${meeting.key_topics.join(', ')}`;

        if (phone) {
          await sendViaBridge(phone, alertMsg);
        }

        await sendPushNotification(
          supabaseAdmin,
          meeting.user_id,
          `📅 Meeting in 20 min: ${meeting.title}`,
          meeting.participants?.map((p: any) => p.name).filter(Boolean).join(', ') || 'Starting soon'
        );

        await supabaseAdmin
          .from('calendar_events')
          .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
          .eq('id', meeting.id);

        stats.meetingAlerts++;
      } catch (err: any) {
        stats.errors.push(`meeting-alert ${meeting.id}: ${err.message}`);
      }
    }

    // ============================================================
    // 5. Overdue Commitment Notifications (NEW)
    //    Find commitments that are past due_date but NOT yet notified
    //    Respects notification_preferences.overdue_alerts
    // ============================================================
    const { data: overdueCommitments } = await supabaseAdmin
      .from('commitments')
      .select('id, text, committed_by, due_date, priority, user_id, contact_id, users!inner(phone, display_name)')
      .eq('status', 'pending')
      .lt('due_date', new Date().toISOString())
      .not('due_date', 'is', null)
      .or('overdue_notified.is.null,overdue_notified.eq.false')
      .limit(50);

    for (const commitment of overdueCommitments || []) {
      try {
        // Check user notification preferences
        const { data: userPrefs } = await supabaseAdmin
          .from('notification_preferences')
          .select('overdue_alerts, push_enabled, proactive_reminders')
          .eq('user_id', commitment.user_id)
          .single();

        // Skip if overdue alerts or proactive reminders explicitly disabled
        if (userPrefs?.overdue_alerts === false || userPrefs?.proactive_reminders === false) {
          // Still mark as notified to prevent buildup
          await supabaseAdmin
            .from('commitments')
            .update({ overdue_notified: true })
            .eq('id', commitment.id);
          continue;
        }

        const userInfo = commitment.users as any;
        const phone = userInfo?.phone;
        const dueDate = new Date(commitment.due_date);
        const hoursOverdue = Math.round((Date.now() - dueDate.getTime()) / (1000 * 60 * 60));

        // Get contact name if available
        let contactName = '';
        if (commitment.contact_id) {
          const { data: contact } = await supabaseAdmin
            .from('contacts')
            .select('display_name, name')
            .eq('id', commitment.contact_id)
            .single();
          contactName = contact?.display_name || contact?.name || '';
        }

        const priorityEmoji = commitment.priority === 'high' ? '🔴' : commitment.priority === 'medium' ? '🟡' : '🟢';
        const whoOwes = commitment.committed_by === 'me'
          ? 'You committed to'
          : commitment.committed_by === 'them'
            ? `${contactName || 'They'} committed to`
            : 'Mutual commitment';

        let msg = `⚠️ *Overdue Commitment*\n\n`;
        msg += `${priorityEmoji} ${commitment.text}\n\n`;
        msg += `${whoOwes}\n`;
        msg += `📅 Was due: ${dueDate.toLocaleDateString()} (${hoursOverdue}h ago)\n`;
        msg += `\n_Reply "done" or open Rememora to update._`;

        if (phone) {
          await sendViaBridge(phone, msg);
        }

        if (userPrefs?.push_enabled !== false) {
          await sendPushNotification(
            supabaseAdmin,
            commitment.user_id,
            '⚠️ Overdue Commitment',
            `${commitment.text.substring(0, 100)} — was due ${hoursOverdue}h ago`
          );
        }

        // Mark as overdue_notified to prevent repeated alerts
        await supabaseAdmin
          .from('commitments')
          .update({
            overdue_notified: true,
            reminder_sent: true,
            reminder_sent_at: new Date().toISOString(),
          })
          .eq('id', commitment.id);

        stats.overdueAlerts++;
      } catch (err: any) {
        stats.errors.push(`overdue-commitment ${commitment.id}: ${err.message}`);
      }
    }

    // ============================================================
    // 6. Due-Soon Commitment Alerts — 24h warning (NEW)
    //    Commitments due within the next 24 hours, not yet reminded
    // ============================================================
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: dueSoonCommitments } = await supabaseAdmin
      .from('commitments')
      .select('id, text, committed_by, due_date, priority, user_id, contact_id, users!inner(phone, display_name)')
      .eq('status', 'pending')
      .gte('due_date', now.toISOString())
      .lte('due_date', in24h.toISOString())
      .or('reminder_sent.is.null,reminder_sent.eq.false')
      .limit(50);

    for (const commitment of dueSoonCommitments || []) {
      try {
        // Check user notification preferences
        const { data: userPrefs } = await supabaseAdmin
          .from('notification_preferences')
          .select('due_soon_alerts, push_enabled, proactive_reminders')
          .eq('user_id', commitment.user_id)
          .single();

        // Skip if due-soon alerts or proactive reminders explicitly disabled
        if (userPrefs?.due_soon_alerts === false || userPrefs?.proactive_reminders === false) {
          await supabaseAdmin
            .from('commitments')
            .update({ reminder_sent: true })
            .eq('id', commitment.id);
          continue;
        }

        const userInfo = commitment.users as any;
        const phone = userInfo?.phone;
        const dueDate = new Date(commitment.due_date);
        const hoursLeft = Math.round((dueDate.getTime() - Date.now()) / (1000 * 60 * 60));

        // Get contact name if available
        let contactName = '';
        if (commitment.contact_id) {
          const { data: contact } = await supabaseAdmin
            .from('contacts')
            .select('display_name, name')
            .eq('id', commitment.contact_id)
            .single();
          contactName = contact?.display_name || contact?.name || '';
        }

        const priorityEmoji = commitment.priority === 'high' ? '🔴' : commitment.priority === 'medium' ? '🟡' : '🟢';
        const timeLabel = hoursLeft <= 1 ? 'less than 1 hour' : `${hoursLeft} hours`;

        let msg = `🔔 *Commitment Due Soon*\n\n`;
        msg += `${priorityEmoji} ${commitment.text}\n\n`;
        msg += `⏳ Due in ${timeLabel} (${dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})\n`;
        if (contactName) {
          msg += `👤 ${commitment.committed_by === 'me' ? 'To' : 'From'}: ${contactName}\n`;
        }
        msg += `\n_Open Rememora to mark as done._`;

        if (phone) {
          await sendViaBridge(phone, msg);
        }

        if (userPrefs?.push_enabled !== false) {
          await sendPushNotification(
            supabaseAdmin,
            commitment.user_id,
            '🔔 Commitment Due Soon',
            `${commitment.text.substring(0, 100)} — due in ${timeLabel}`
          );
        }

        // Mark reminder_sent so we don't alert again
        await supabaseAdmin
          .from('commitments')
          .update({
            reminder_sent: true,
            reminder_sent_at: new Date().toISOString(),
          })
          .eq('id', commitment.id);

        stats.dueSoonAlerts++;
      } catch (err: any) {
        stats.errors.push(`due-soon-commitment ${commitment.id}: ${err.message}`);
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
  if (!rrule) return addMinutes(new Date(), 60 * 24).toISOString();

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
