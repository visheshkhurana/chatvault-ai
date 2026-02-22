/**
 * Commitment Auto-Detection Engine
 * Scans messages for promises, deadlines, deliverables.
 * Confirms with user before tracking.
 */

import OpenAI from 'openai';
import { sendTextMessage } from './whatsapp';
import type { ClassifiedIntent } from './intent-classifier';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
});

// ============================================================
// Types
// ============================================================

interface DetectedCommitment {
  detected: boolean;
  text: string;
  committedBy: 'me' | 'them' | 'mutual';
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  category: 'deliverable' | 'payment' | 'meeting' | 'decision' | 'follow_up' | 'other';
  confidence: number;
  suggestedReminder?: string;
}

// ============================================================
// Detection Prompt
// ============================================================

const COMMITMENT_PROMPT = `Analyze this WhatsApp message for commitments, promises, or deadlines.

DETECT:
- Promises: "I'll send the deck tomorrow", "Will share the report by EOD"
- Deadlines: "Need this by Friday", "Due date is March 15"
- Deliverables: "I'll prepare the proposal", "Let me draft the contract"
- Payment: "Will transfer the amount by EOD", "Payment will be processed Monday"
- Decisions: "Let's go with option A", "We've decided to proceed"
- Follow-ups: "Let me check and get back", "I'll confirm by tomorrow"

RULES:
- Only detect CLEAR commitments (not vague "let's see")
- "me" = the message sender is committing
- "them" = the sender is asking someone else to commit
- Priority: high (< 24h or money), medium (< 1 week), low (> 1 week)
- If no due date mentioned, infer from context or leave null

RESPONSE (strict JSON):
{
  "detected": true/false,
  "text": "Clean commitment statement",
  "committedBy": "me|them|mutual",
  "dueDate": "ISO 8601 or null",
  "priority": "low|medium|high",
  "category": "deliverable|payment|meeting|decision|follow_up|other",
  "confidence": 0.0-1.0,
  "suggestedReminder": "Natural language reminder suggestion"
}`;

// ============================================================
// Detect Commitment from Single Message
// ============================================================

export async function detectCommitment(
  message: string,
  senderName: string,
  isFromMe: boolean
): Promise<DetectedCommitment> {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct',
      messages: [
        { role: 'system', content: COMMITMENT_PROMPT },
        {
          role: 'user',
          content: `Sender: ${senderName} (${isFromMe ? 'this is me' : 'this is someone else'})\nCurrent time: ${new Date().toISOString()}\nMessage: "${message}"`,
        },
      ],
      temperature: 0.1,
      max_tokens: 256,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { detected: false } as DetectedCommitment;

    return JSON.parse(content);
  } catch (error) {
    console.error('[CommitmentDetector] Error:', error);
    return { detected: false } as DetectedCommitment;
  }
}

// ============================================================
// Handle Commitment Detection in Message Flow
// ============================================================

export async function handleCommitmentDetection(
  supabaseAdmin: any,
  userId: string,
  senderPhone: string,
  message: string,
  chatId: string,
  contactId: string | null,
  isFromMe: boolean,
  senderName: string
): Promise<void> {
  const commitment = await detectCommitment(message, senderName, isFromMe);

  if (!commitment.detected || commitment.confidence < 0.7) return;

  // Store as pending commitment
  const { data: stored, error } = await supabaseAdmin
    .from('commitments')
    .insert({
      user_id: userId,
      chat_id: chatId,
      contact_id: contactId,
      text: commitment.text,
      committed_by: commitment.committedBy,
      priority: commitment.priority,
      status: 'pending',
      due_date: commitment.dueDate,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[CommitmentDetector] Store failed:', error);
    return;
  }

  // Only notify about MY commitments (not others')
  if (commitment.committedBy === 'me' || commitment.committedBy === 'mutual') {
    let notifyMsg = `📌 *Commitment tracked*\n\n"${commitment.text}"`;

    if (commitment.dueDate) {
      const dueStr = new Date(commitment.dueDate).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      });
      notifyMsg += `\n📅 Due: ${dueStr}`;
    }

    if (commitment.priority === 'high') {
      notifyMsg += `\n🔴 High priority`;
    }

    if (commitment.suggestedReminder) {
      notifyMsg += `\n\n💡 Want me to remind you? Reply *yes* to set: "${commitment.suggestedReminder}"`;
    }

    await sendTextMessage(senderPhone, notifyMsg);
  }
}

// ============================================================
// Batch Scan — For cron job (scan recent unprocessed messages)
// ============================================================

export async function batchScanCommitments(
  supabaseAdmin: any,
  userId: string,
  senderPhone: string,
  hoursBack: number = 24
): Promise<number> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  // Get recent text messages that haven't been scanned
  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('id, text_content, sender_name, is_from_me, chat_id, contact_id, timestamp')
    .eq('user_id', userId)
    .eq('message_type', 'text')
    .gt('timestamp', since)
    .not('text_content', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(50);

  if (!messages || messages.length === 0) return 0;

  let detected = 0;

  for (const msg of messages) {
    if (!msg.text_content || msg.text_content.length < 10) continue;

    const commitment = await detectCommitment(
      msg.text_content,
      msg.sender_name || 'Unknown',
      msg.is_from_me || false
    );

    if (commitment.detected && commitment.confidence >= 0.75) {
      // Check if this commitment already exists (avoid duplicates)
      const { data: existing } = await supabaseAdmin
        .from('commitments')
        .select('id')
        .eq('user_id', userId)
        .eq('text', commitment.text)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabaseAdmin.from('commitments').insert({
          user_id: userId,
          chat_id: msg.chat_id,
          contact_id: msg.contact_id,
          text: commitment.text,
          committed_by: commitment.committedBy,
          priority: commitment.priority,
          status: 'pending',
          due_date: commitment.dueDate,
          created_at: new Date().toISOString(),
        });
        detected++;
      }
    }
  }

  return detected;
}
