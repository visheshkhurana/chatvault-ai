import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';
import OpenAI from 'openai';

// ============================================================
// Commitment Scan Endpoint
// POST /api/commitments/scan - Scan messages for commitments using LLM
// ============================================================

const scanSchema = z.object({
    chatId: z.string().uuid(),
    scanDays: z.number().int().min(1).max(30).default(7),
});

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: 'https://openrouter.ai/api/v1',
});

const LLM_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

interface ExtractedCommitment {
    text: string;
    committed_by: 'me' | 'them' | 'mutual';
    due_date: string | null;
    priority: 'low' | 'medium' | 'high';
}

export const POST = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, scanSchema);
    if (!parsed.success) return parsed.response;

    const { chatId, scanDays } = parsed.data as z.infer<typeof scanSchema>;

    // Verify chat ownership
    const { data: chat } = await supabaseAdmin
        .from('chats')
        .select('id, title')
        .eq('id', chatId)
        .eq('user_id', user.id)
        .single();

    if (!chat) {
        return apiError('Chat not found', 404);
    }

    // Calculate date range
    const now = new Date();
    const fromDate = new Date(now.getTime() - scanDays * 24 * 60 * 60 * 1000);

    // Fetch messages from the chat
    const { data: messages, error: messagesError } = await supabaseAdmin
        .from('messages')
        .select('id, text_content, sender_name, sender_phone, is_from_me, timestamp')
        .eq('chat_id', chatId)
        .gte('timestamp', fromDate.toISOString())
        .order('timestamp', { ascending: true })
        .limit(500); // Reasonable limit for LLM context

    if (messagesError) {
        console.error('[Commitments Scan] Error fetching messages:', messagesError);
        return apiError('Failed to fetch messages', 500);
    }

    if (!messages || messages.length === 0) {
        return apiSuccess({
            commitments: [],
            scanned: 0,
            created: 0,
            message: 'No messages found in the specified period',
        });
    }

    // Format messages for LLM
    const formattedMessages = messages
        .filter((m: any) => m.text_content) // Only text messages
        .map((m: any) => ({
            sender: m.is_from_me ? 'You' : m.sender_name || 'Contact',
            text: m.text_content,
            timestamp: new Date(m.timestamp).toLocaleString(),
        }));

    const conversationText = formattedMessages
        .map((m: any) => `${m.sender} (${m.timestamp}): ${m.text}`)
        .join('\n\n');

    // Create LLM prompt
    const systemPrompt = `You are a conversation analyzer. Your task is to identify commitments, promises, deadlines, and action items from a conversation.

A commitment is something someone promised to do or agreed to do by a certain date or in general.
Examples: "I'll send you the report by Friday", "Can you pick up milk?", "We agreed to meet on Monday", "I committed to helping with the project".

For each commitment you find, extract:
- text: The exact commitment/promise (1-500 characters)
- committed_by: Who made the commitment - 'me' (user made it), 'them' (contact made it), or 'mutual' (both agreed)
- due_date: ISO datetime string if a specific date/time is mentioned, otherwise null
- priority: 'low', 'medium', or 'high' based on urgency/importance clues

Return your response as a JSON array with no markdown formatting, just the raw JSON array.
If no commitments are found, return an empty array [].`;

    const userPrompt = `Analyze this conversation and extract all commitments, promises, and deadlines:

${conversationText}

Return only a JSON array of commitments found. Example format:
[
  {
    "text": "Send the quarterly report",
    "committed_by": "me",
    "due_date": "2026-02-28T17:00:00Z",
    "priority": "high"
  },
  {
    "text": "Pick up groceries",
    "committed_by": "me",
    "due_date": null,
    "priority": "medium"
  }
]`;

    try {
        // Call LLM
        const response = await openai.chat.completions.create({
            model: LLM_MODEL,
            max_tokens: 2000,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        });

        // Parse LLM response
        const responseText = response.choices?.[0]?.message?.content || '';

        let extractedCommitments: ExtractedCommitment[] = [];
        try {
            // Try to extract JSON from response
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed)) {
                    extractedCommitments = parsed.map((c: any) => ({
                        text: String(c.text || '').slice(0, 500),
                        committed_by: ['me', 'them', 'mutual'].includes(c.committed_by)
                            ? c.committed_by
                            : 'mutual',
                        due_date:
                            c.due_date && typeof c.due_date === 'string'
                                ? c.due_date
                                : null,
                        priority: ['low', 'medium', 'high'].includes(c.priority)
                            ? c.priority
                            : 'medium',
                    }));
                }
            }
        } catch (parseError) {
            console.error('[Commitments Scan] Error parsing LLM response:', parseError);
            // Continue with empty array if parsing fails
        }

        // Filter out empty or invalid commitments
        extractedCommitments = extractedCommitments.filter((c) => c.text && c.text.trim());

        // Insert commitments to database
        let createdCount = 0;
        const createdCommitments: any[] = [];

        for (const commitment of extractedCommitments) {
            // Check if similar commitment already exists (to avoid duplicates)
            const { data: existing } = await supabaseAdmin
                .from('commitments')
                .select('id')
                .eq('user_id', user.id)
                .eq('chat_id', chatId)
                .ilike('text', commitment.text)
                .single();

            if (!existing) {
                const { data: created, error: insertError } = await supabaseAdmin
                    .from('commitments')
                    .insert({
                        user_id: user.id,
                        chat_id: chatId,
                        text: commitment.text,
                        committed_by: commitment.committed_by,
                        due_date: commitment.due_date,
                        priority: commitment.priority,
                        status: 'pending',
                    })
                    .select()
                    .single();

                if (!insertError && created) {
                    createdCount++;
                    createdCommitments.push(created);
                } else if (insertError) {
                    console.error('[Commitments Scan] Error inserting commitment:', insertError);
                }
            }
        }

        return apiSuccess({
            commitments: createdCommitments,
            scanned: messages.length,
            created: createdCount,
            total_extracted: extractedCommitments.length,
            message: `Scanned ${messages.length} messages and created ${createdCount} new commitments`,
        });
    } catch (error) {
        console.error('[Commitments Scan] LLM error:', error);
        return apiError('Failed to analyze messages with LLM', 500);
    }
});
