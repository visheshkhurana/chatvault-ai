/**
 * Smart Reminder Engine
 * Supports time-based, conditional ("if no reply"), and recurring reminders.
 * Uses LLM for natural language parsing.
 */

import OpenAI from 'openai';
import { sendTextMessage } from './whatsapp';
import { addHours, addDays, addWeeks, format, parseISO } from 'date-fns';
import type { ClassifiedIntent } from './intent-classifier';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
});

// ============================================================
// Types
// ============================================================

export interface ParsedReminder {
  type: 'time' | 'conditional' | 'recurring';
  text: string; // What to remind about
  dueAt?: string; // ISO for time-based
  conditionJson?: {
    type: 'no_reply' | 'no_action';
    contactName?: string;
    contactWaId?: string;
    chatId?: string;
    waitHours: number;
    checkAfter: string; // ISO
  };
  recurrenceRule?: string; // iCal-style
  contextSummary: string;
  confidence: number;
}

// ============================================================
// LLM Reminder Parser
// ============================================================

const REMINDER_PARSE_PROMPT = `You parse WhatsApp messages into structured reminder data.

TYPES:
1. time — Simple future reminder: "Remind me to call Imran tomorrow at 3pm"
2. conditional — Trigger on condition: "If Tanmay doesn't reply in 48 hours, remind me"
3. recurring — Repeating: "Remind me every Monday to review reports"

RESPONSE FORMAT (strict JSON):
{
  "type": "time|conditional|recurring",
  "text": "What to remind about (clean, imperative)",
  "dueAt": "ISO 8601 datetime (for time-based)",
  "conditionJson": {
    "type": "no_reply|no_action",
    "contactName": "person to monitor",
    "waitHours": 48,
    "checkAfter": "ISO 8601 (when to start checking)"
  },
  "recurrenceRule": "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9 (iCal format, for recurring)",
  "confidence": 0.0-1.0
}

RULES:
- For "tomorrow" use the next day at 9:00 AM in user's timezone
- For "next week" use next Monday at 9:00 AM
- For "in X hours/days" add to current time
- For conditional, default waitHours to 24 if not specified
- For recurring, use iCal RRULE format
- Clean the reminder text: remove filler words, make it actionable
- If you can't parse, set confidence < 0.5`;

export async function parseSmartReminder(
  message: string,
  userTimezone: string,
  senderName?: string
): Promise<ParsedReminder> {
  try {
    const now = new Date();
    const response = await openai.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct',
      messages: [
        { role: 'system', content: REMINDER_PARSE_PROMPT },
        {
          role: 'user',
          content: `Current: ${now.toISOString()}\nTimezone: ${userTimezone || 'UTC'}\nSender: ${senderName || 'unknown'}\nMessage: "${message}"`,
        },
      ],
      temperature: 0.1,
      max_tokens: 256,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return fallbackParse(message);

    const parsed = JSON.parse(content);

    return {
      type: parsed.type || 'time',
      text: parsed.text || message,
      dueAt: parsed.dueAt,
      conditionJson: parsed.conditionJson || undefined,
      recurrenceRule: parsed.recurrenceRule || undefined,
      contextSummary: message,
      confidence: parsed.confidence || 0.5,
    };
  } catch (error) {
    console.error('[SmartReminder] Parse error:', error);
    return fallbackParse(message);
  }
}

function fallbackParse(message: string): ParsedReminder {
  // Simple fallback: time-based, tomorrow 9am
  const tomorrow = addDays(new Date(), 1);
  tomorrow.setHours(9, 0, 0, 0);

  return {
    type: 'time',
    text: message.replace(/^remind\s*(me\s*)?(to\s*)?/i, '').trim() || message,
    dueAt: tomorrow.toISOString(),
    contextSummary: message,
    confidence: 0.3,
  };
}

// ============================================================
// Handle Reminder Creation
// ============================================================

export async function handleReminderCreation(
  supabaseAdmin: any,
  userId: string,
  senderPhone: string,
  message: string,
  chatId: string,
  messageId: string,
  userTimezone: string,
  senderName?: string
): Promise<void> {
  const parsed = await parseSmartReminder(message, userTimezone, senderName);

  if (parsed.confidence < 0.4) {
    await sendTextMessage(
      senderPhone,
      `🤔 I wasn't sure how to set that reminder. Could you try something like:\n\n• "Remind me to call Imran tomorrow at 3pm"\n• "If Tanmay doesn't reply in 48 hours, remind me"\n• "Remind me every Monday to review reports"`
    );
    return;
  }

  // Resolve conditional contact if needed
  if (parsed.type === 'conditional' && parsed.conditionJson?.contactName) {
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('wa_id')
      .eq('user_id', userId)
      .ilike('display_name', `%${parsed.conditionJson.contactName}%`)
      .limit(1);

    if (contacts && contacts.length > 0) {
      parsed.conditionJson.contactWaId = contacts[0].wa_id;
      parsed.conditionJson.chatId = chatId;
    }
    if (!parsed.conditionJson.checkAfter) {
      parsed.conditionJson.checkAfter = new Date().toISOString();
    }
  }

  // Insert reminder
  const insertData: any = {
    user_id: userId,
    chat_id: chatId,
    text: parsed.text,
    trigger_type: parsed.type,
    status: 'pending',
    source_message_id: messageId,
    context_summary: parsed.contextSummary,
    created_at: new Date().toISOString(),
  };

  if (parsed.type === 'time' && parsed.dueAt) {
    insertData.due_at = parsed.dueAt;
  } else if (parsed.type === 'conditional' && parsed.conditionJson) {
    insertData.condition_json = parsed.conditionJson;
    insertData.contact_wa_id = parsed.conditionJson.contactWaId;
    // Set a check-by deadline (default: wait_hours + 1 hour buffer)
    insertData.due_at = addHours(
      new Date(),
      (parsed.conditionJson.waitHours || 24) + 1
    ).toISOString();
  } else if (parsed.type === 'recurring' && parsed.recurrenceRule) {
    insertData.recurrence_rule = parsed.recurrenceRule;
    insertData.due_at = getNextRecurrenceTime(parsed.recurrenceRule);
  }

  const { error } = await supabaseAdmin
    .from('reminders')
    .insert(insertData);

  if (error) {
    console.error('[SmartReminder] Insert failed:', error);
    await sendTextMessage(senderPhone, '❌ Failed to create reminder. Please try again.');
    return;
  }

  // Confirm to user
  let confirmMsg = '';
  if (parsed.type === 'time') {
    confirmMsg = `⏰ *Reminder set!*\n\n"${parsed.text}"\n📅 ${formatDueDate(parsed.dueAt!)}`;
  } else if (parsed.type === 'conditional') {
    const contact = parsed.conditionJson?.contactName || 'them';
    const hours = parsed.conditionJson?.waitHours || 24;
    confirmMsg = `🔔 *Conditional reminder set!*\n\n"${parsed.text}"\n⏳ I'll remind you if ${contact} doesn't reply within ${hours} hours.`;
  } else if (parsed.type === 'recurring') {
    confirmMsg = `🔁 *Recurring reminder set!*\n\n"${parsed.text}"\n📅 ${describeRecurrence(parsed.recurrenceRule!)}`;
  }

  await sendTextMessage(senderPhone, confirmMsg);
}

// ============================================================
// Recurrence Helpers
// ============================================================

function getNextRecurrenceTime(rrule: string): string {
  // Simple parser for common patterns
  const now = new Date();
  const parts = rrule.split(';').reduce((acc, part) => {
    const [key, val] = part.split('=');
    acc[key] = val;
    return acc;
  }, {} as Record<string, string>);

  const freq = parts['FREQ'];
  const hour = parseInt(parts['BYHOUR'] || '9');

  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  if (freq === 'DAILY') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (freq === 'WEEKLY') {
    const dayMap: Record<string, number> = {
      SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
    };
    const targetDay = dayMap[parts['BYDAY']] ?? 1;
    const currentDay = next.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0 || (daysUntil === 0 && next <= now)) {
      daysUntil += 7;
    }
    next.setDate(next.getDate() + daysUntil);
  } else if (freq === 'MONTHLY') {
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
  }

  return next.toISOString();
}

function describeRecurrence(rrule: string): string {
  const parts = rrule.split(';').reduce((acc, part) => {
    const [key, val] = part.split('=');
    acc[key] = val;
    return acc;
  }, {} as Record<string, string>);

  const freq = parts['FREQ'];
  const day = parts['BYDAY'];
  const hour = parts['BYHOUR'] || '9';

  const dayNames: Record<string, string> = {
    MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday',
    TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday',
  };

  if (freq === 'DAILY') return `Every day at ${hour}:00`;
  if (freq === 'WEEKLY' && day) return `Every ${dayNames[day] || day} at ${hour}:00`;
  if (freq === 'MONTHLY') return `Every month on the 1st at ${hour}:00`;
  return `Recurring (${rrule})`;
}

function formatDueDate(iso: string): string {
  try {
    return format(parseISO(iso), 'EEE, MMM d · h:mm a');
  } catch {
    return iso;
  }
}
