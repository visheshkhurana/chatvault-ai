/**
 * Meeting Detection Engine
 * Detects meetings/calls from WhatsApp messages, extracts structured data,
 * creates calendar events, and handles confirmation flow.
 */

import OpenAI from 'openai';
import { sendTextMessage } from './whatsapp';
import { format, addMinutes, parseISO } from 'date-fns';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
});

// ============================================================
// Types
// ============================================================

export interface MeetingCandidate {
  detected: boolean;
  confidence: number;
  title: string;
  startTime: string; // ISO 8601
  endTime?: string;
  duration?: number; // minutes
  timezone: string;
  participants: Array<{ name: string; phone?: string }>;
  meetingLink?: string;
  location?: string;
  needsConfirmation: boolean;
  ambiguities: string[];
  conversationContext: string;
  keyTopics: string[];
}

// ============================================================
// Meeting Detection Prompt
// ============================================================

const MEETING_DETECTION_PROMPT = `You are analyzing a WhatsApp message for meeting/call/appointment scheduling.
Extract meeting details if present. Handle ambiguity carefully.

RULES:
- Only detect if there's a CLEAR meeting arrangement (not just "let's talk sometime")
- Convert relative dates: "tomorrow" = relative to current date provided
- If timezone is ambiguous, flag it
- If time is vague ("evening", "after lunch"), flag as ambiguous with best guess
- Extract meeting links (Zoom, Google Meet, Teams, etc.)
- Detect confirmations of previously discussed meetings
- Duration defaults to 30 minutes if not specified

TIMEZONE HANDLING:
- If message mentions a timezone (GST, IST, EST, etc.), use that
- If user has a default timezone, use that as fallback
- Flag if unclear

RESPONSE FORMAT (strict JSON):
{
  "detected": true/false,
  "confidence": 0.0-1.0,
  "title": "Meeting title inferred from context",
  "startTime": "ISO 8601 datetime",
  "endTime": "ISO 8601 datetime or null",
  "duration": 30,
  "timezone": "IANA timezone string",
  "participants": [{"name": "...", "phone": "..."}],
  "meetingLink": "URL or null",
  "location": "physical location or null",
  "needsConfirmation": true/false,
  "ambiguities": ["list of unclear elements"],
  "keyTopics": ["inferred discussion topics"]
}`;

// ============================================================
// Main Detection Function
// ============================================================

export async function detectMeeting(
  message: string,
  senderName: string,
  userTimezone: string,
  recentContext?: string // Last few messages for context
): Promise<MeetingCandidate> {
  try {
    const now = new Date();
    const contextBlock = recentContext
      ? `\nRecent conversation context:\n${recentContext}`
      : '';

    const response = await openai.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct',
      messages: [
        { role: 'system', content: MEETING_DETECTION_PROMPT },
        {
          role: 'user',
          content: `Current date/time: ${now.toISOString()}
User's default timezone: ${userTimezone || 'UTC'}
Message sender: ${senderName}
Message: "${message}"${contextBlock}

Analyze for meeting details.`,
        },
      ],
      temperature: 0.1,
      max_tokens: 512,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return createNoMeeting(message);
    }

    const parsed = JSON.parse(content);

    if (!parsed.detected) {
      return createNoMeeting(message);
    }

    return {
      detected: true,
      confidence: parsed.confidence || 0.7,
      title: parsed.title || `Meeting with ${senderName}`,
      startTime: parsed.startTime,
      endTime: parsed.endTime || (parsed.startTime
        ? addMinutes(parseISO(parsed.startTime), parsed.duration || 30).toISOString()
        : ''),
      duration: parsed.duration || 30,
      timezone: parsed.timezone || userTimezone || 'UTC',
      participants: parsed.participants || [{ name: senderName }],
      meetingLink: parsed.meetingLink || undefined,
      location: parsed.location || undefined,
      needsConfirmation: parsed.needsConfirmation ?? true,
      ambiguities: parsed.ambiguities || [],
      conversationContext: message,
      keyTopics: parsed.keyTopics || [],
    };
  } catch (error) {
    console.error('[MeetingDetector] Error:', error);
    return createNoMeeting(message);
  }
}

function createNoMeeting(message: string): MeetingCandidate {
  return {
    detected: false,
    confidence: 0,
    title: '',
    startTime: '',
    timezone: 'UTC',
    participants: [],
    needsConfirmation: false,
    ambiguities: [],
    conversationContext: message,
    keyTopics: [],
  };
}

// ============================================================
// Handle Meeting Flow — Confirm & Create
// ============================================================

export async function handleMeetingDetection(
  supabaseAdmin: any,
  userId: string,
  senderPhone: string,
  senderName: string,
  message: string,
  messageId: string,
  chatId: string,
  userTimezone: string
): Promise<void> {
  // Get recent context (last 5 messages in this chat)
  const { data: recentMessages } = await supabaseAdmin
    .from('messages')
    .select('sender_name, text_content, timestamp')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .not('text_content', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(5);

  const recentContext = recentMessages
    ?.reverse()
    .map((m: any) => `${m.sender_name}: ${m.text_content}`)
    .join('\n') || '';

  const meeting = await detectMeeting(message, senderName, userTimezone, recentContext);

  if (!meeting.detected) return;

  // Check for conflicts
  const conflicts = await checkTimeConflicts(supabaseAdmin, userId, meeting.startTime, meeting.endTime);

  // Build confirmation message
  let confirmMsg = `📅 *Meeting Detected*\n\n`;
  confirmMsg += `*${meeting.title}*\n`;
  confirmMsg += `🕐 ${formatMeetingTime(meeting.startTime, meeting.timezone)}`;
  if (meeting.endTime) {
    confirmMsg += ` - ${formatMeetingTime(meeting.endTime, meeting.timezone)}`;
  }
  confirmMsg += `\n`;

  if (meeting.participants.length > 0) {
    confirmMsg += `👥 ${meeting.participants.map(p => p.name).join(', ')}\n`;
  }
  if (meeting.meetingLink) {
    confirmMsg += `🔗 ${meeting.meetingLink}\n`;
  }
  if (meeting.location) {
    confirmMsg += `📍 ${meeting.location}\n`;
  }

  if (conflicts.length > 0) {
    confirmMsg += `\n⚠️ *Conflict detected:* You have "${conflicts[0].title}" at that time.\n`;
  }

  if (meeting.ambiguities.length > 0) {
    confirmMsg += `\n⚠️ ${meeting.ambiguities.join(', ')}\n`;
  }

  confirmMsg += `\nShould I add this to your calendar? Reply *yes* to confirm.`;

  // Store pending meeting for confirmation
  await supabaseAdmin.from('calendar_events').insert({
    user_id: userId,
    chat_id: chatId,
    source_message_id: messageId,
    title: meeting.title,
    description: `Detected from WhatsApp conversation with ${senderName}`,
    start_time: meeting.startTime,
    end_time: meeting.endTime,
    timezone: meeting.timezone,
    participants: meeting.participants,
    meeting_link: meeting.meetingLink,
    location: meeting.location,
    conversation_context: recentContext,
    key_topics: meeting.keyTopics,
    status: 'tentative', // Will become 'confirmed' on user approval
  });

  await sendTextMessage(senderPhone, confirmMsg);
}

// ============================================================
// Confirm Meeting — Called when user replies "yes"
// ============================================================

export async function confirmLatestMeeting(
  supabaseAdmin: any,
  userId: string,
  senderPhone: string
): Promise<boolean> {
  // Find most recent tentative meeting
  const { data: pendingMeeting } = await supabaseAdmin
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'tentative')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!pendingMeeting) return false;

  // Update to confirmed
  await supabaseAdmin
    .from('calendar_events')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', pendingMeeting.id);

  // Try to sync to Google Calendar if tokens exist
  let googleSynced = false;
  try {
    const { createCalendarEvent } = await import('./google-calendar');
    const eventId = await createCalendarEvent(supabaseAdmin, userId, {
      title: pendingMeeting.title,
      description: pendingMeeting.description,
      startTime: pendingMeeting.start_time,
      endTime: pendingMeeting.end_time,
      timezone: pendingMeeting.timezone,
      meetingLink: pendingMeeting.meeting_link,
      location: pendingMeeting.location,
      participants: pendingMeeting.participants,
    });

    if (eventId) {
      await supabaseAdmin
        .from('calendar_events')
        .update({ google_event_id: eventId })
        .eq('id', pendingMeeting.id);
      googleSynced = true;
    }
  } catch (err) {
    console.log('[Meeting] Google Calendar sync skipped (not configured):', err);
  }

  const syncStatus = googleSynced
    ? '✅ Also synced to your Google Calendar!'
    : '💡 Connect Google Calendar in settings for auto-sync.';

  await sendTextMessage(
    senderPhone,
    `✅ *Meeting confirmed!*\n\n*${pendingMeeting.title}*\n🕐 ${formatMeetingTime(pendingMeeting.start_time, pendingMeeting.timezone)}\n\n${syncStatus}\n\nI'll send you a reminder 20 minutes before with conversation context.`
  );

  return true;
}

// ============================================================
// Helpers
// ============================================================

async function checkTimeConflicts(
  supabaseAdmin: any,
  userId: string,
  startTime?: string,
  endTime?: string
): Promise<Array<{ title: string; start_time: string }>> {
  if (!startTime) return [];

  const end = endTime || addMinutes(parseISO(startTime), 30).toISOString();

  const { data } = await supabaseAdmin
    .from('calendar_events')
    .select('title, start_time')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .lt('start_time', end)
    .gt('end_time', startTime)
    .limit(3);

  return data || [];
}

function formatMeetingTime(isoTime: string, timezone?: string): string {
  try {
    const date = parseISO(isoTime);
    return format(date, 'EEE, MMM d · h:mm a') + (timezone ? ` ${timezone}` : '');
  } catch {
    return isoTime;
  }
}
