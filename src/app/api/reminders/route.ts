import { NextRequest } from 'next/server';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import OpenAI from 'openai';
import { z } from 'zod';

// ============================================================
// Reminders API
// GET /api/reminders - List reminders for the user
// POST /api/reminders - Create reminder
// PATCH /api/reminders - Update reminder
// DELETE /api/reminders - Delete reminder
// POST /api/reminders/extract - Extract reminders from chat using LLM
// ============================================================

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: 'https://openrouter.ai/api/v1',
});
const LLM_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

// --- Validation Schemas ---

const createReminderSchema = z.object({
    chatId: z.string().uuid().optional(),
    text: z.string().min(1).max(500),
    dueAt: z.string().datetime(),
});

const updateReminderSchema = z.object({
    id: z.string().uuid(),
    text: z.string().min(1).max(500).optional(),
    dueAt: z.string().datetime().optional(),
    status: z.enum(['pending', 'done', 'cancelled']).optional(),
});

const deleteReminderSchema = z.object({
    id: z.string().uuid(),
});

const extractRemindersSchema = z.object({
    chatId: z.string().uuid(),
});

// --- GET: List Reminders ---
export const GET = withAuth(async (req: NextRequest, { user }) => {
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') || '';
    const chatId = searchParams.get('chatId') || '';

    // Validate status filter
    const validStatuses = ['pending', 'done', 'overdue'];
    if (status && !validStatuses.includes(status)) {
        return apiError('Invalid status filter. Must be one of: pending, done, overdue', 400);
    }

    // Build base query
    let query = supabaseAdmin
        .from('reminders')
        .select(
            `
            id,
            user_id,
            chat_id,
            text,
            due_at,
            status,
            created_at,
            chats(title)
            `,
            { count: 'exact' }
        )
        .eq('user_id', user.id);

    // Apply status filter
    if (status === 'pending') {
        query = query.eq('status', 'pending');
    } else if (status === 'done') {
        query = query.eq('status', 'done');
    } else if (status === 'overdue') {
        // Overdue: status is pending AND due_at is in the past
        query = query
            .eq('status', 'pending')
            .lt('due_at', new Date().toISOString())
            .not('due_at', 'is', null);
    }

    // Apply chat filter if provided
    if (chatId) {
        query = query.eq('chat_id', chatId);
    }

    // Order by due_at ascending (soonest first), then created_at descending
    query = query
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

    const { data: reminders, error, count } = await query;

    if (error) {
        console.error('[Reminders API] Error fetching reminders:', error);
        return apiError('Failed to fetch reminders', 500);
    }

    // Enrich reminders with isOverdue flag
    const enrichedReminders = (reminders || []).map((r: any) => {
        const isOverdue = r.status === 'pending' && r.due_at && new Date(r.due_at) < new Date();
        return {
            ...r,
            isOverdue,
        };
    });

    return apiSuccess({
        reminders: enrichedReminders,
        total: count || 0,
    });
});

// --- POST: Create Reminder or Extract Reminders ---
export const POST = withAuth(async (req: NextRequest, { user }) => {
    // Check if this is an extract request
    const url = new URL(req.url);
    if (url.pathname.endsWith('/extract')) {
        return handleExtractReminders(req, user);
    }

    // Otherwise, create a new reminder
    const parsed = await parseBody(req, createReminderSchema);
    if (!parsed.success) return parsed.response;

    const data = parsed.data as z.infer<typeof createReminderSchema>;

    // Verify chat exists if provided
    if (data.chatId) {
        const { data: chat } = await supabaseAdmin
            .from('chats')
            .select('id')
            .eq('id', data.chatId)
            .eq('user_id', user.id)
            .single();

        if (!chat) {
            return apiError('Chat not found', 404);
        }
    }

    const { data: reminder, error } = await supabaseAdmin
        .from('reminders')
        .insert({
            user_id: user.id,
            chat_id: data.chatId || null,
            text: data.text,
            due_at: data.dueAt,
            status: 'pending',
        })
        .select()
        .single();

    if (error) {
        console.error('[Reminders API] Error creating reminder:', error);
        return apiError('Failed to create reminder', 500);
    }

    return apiSuccess(reminder, 201);
});

// --- PATCH: Update Reminder ---
export const PATCH = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, updateReminderSchema);
    if (!parsed.success) return parsed.response;

    const data = parsed.data as z.infer<typeof updateReminderSchema>;
    const { id, text, dueAt, status } = data;

    // Verify ownership
    const { data: reminder } = await supabaseAdmin
        .from('reminders')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    if (!reminder) {
        return apiError('Reminder not found', 404);
    }

    // Build update object
    const updates: Record<string, any> = {};
    if (text !== undefined) updates.text = text;
    if (dueAt !== undefined) updates.due_at = dueAt;
    if (status !== undefined) updates.status = status;

    const { error } = await supabaseAdmin
        .from('reminders')
        .update(updates)
        .eq('id', id);

    if (error) {
        console.error('[Reminders API] Error updating reminder:', error);
        return apiError('Failed to update reminder', 500);
    }

    return apiSuccess({ id, ...updates });
});

// --- DELETE: Delete Reminder ---
export const DELETE = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, deleteReminderSchema);
    if (!parsed.success) return parsed.response;

    const data = parsed.data as z.infer<typeof deleteReminderSchema>;
    const { id } = data;

    // Verify ownership
    const { data: reminder } = await supabaseAdmin
        .from('reminders')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    if (!reminder) {
        return apiError('Reminder not found', 404);
    }

    const { error } = await supabaseAdmin
        .from('reminders')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[Reminders API] Error deleting reminder:', error);
        return apiError('Failed to delete reminder', 500);
    }

    return apiSuccess({ id, deleted: true });
});

// --- Helper: Extract Reminders from Chat using LLM ---
async function handleExtractReminders(req: NextRequest, user: any) {
    const parsed = await parseBody(req, extractRemindersSchema);
    if (!parsed.success) return parsed.response;

    const { chatId } = parsed.data as z.infer<typeof extractRemindersSchema>;

    // Verify chat exists and belongs to user
    const { data: chat } = await supabaseAdmin
        .from('chats')
        .select('id, title')
        .eq('id', chatId)
        .eq('user_id', user.id)
        .single();

    if (!chat) {
        return apiError('Chat not found', 404);
    }

    // Fetch last 100 messages from the chat
    const { data: messages, error: messagesError } = await supabaseAdmin
        .from('messages')
        .select('id, sender, text, created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(100);

    if (messagesError) {
        console.error('[Reminders API] Error fetching messages:', messagesError);
        return apiError('Failed to fetch chat messages', 500);
    }

    if (!messages || messages.length === 0) {
        return apiSuccess({
            extracted: [],
            chatId,
            chatTitle: chat.title,
        });
    }

    // Reverse to get chronological order for the LLM
    const chronologicalMessages = [...messages].reverse();

    // Format messages for LLM
    const messageText = chronologicalMessages
        .map((m: any) => `${m.sender}: ${m.text}`)
        .join('\n');

    const prompt = `You are an AI assistant that identifies time-sensitive items, follow-ups, deadlines, and commitments from conversations.

Analyze the following conversation and extract potential reminders. Return ONLY a valid JSON array with no additional text.

For each reminder, provide:
- text: A clear, concise reminder text (max 100 words)
- suggestedDueAt: An ISO 8601 datetime string when this should be due. If no specific time is mentioned, suggest a reasonable default based on context.
- confidence: A number between 0 and 1 indicating how certain you are this is a genuine reminder

CONVERSATION:
${messageText}

Return ONLY valid JSON array like this example:
[
  {
    "text": "Follow up with John about the project proposal",
    "suggestedDueAt": "2025-02-28T17:00:00Z",
    "confidence": 0.95
  }
]

If no reminders are found, return an empty array: []`;

    try {
        const response = await openai.chat.completions.create({
            model: LLM_MODEL,
            max_tokens: 1024,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });

        // Extract the text content from the response
        const content = response.choices[0].message.content;
        if (!content) {
            return apiError('Unexpected response format from LLM', 500);
        }

        // Parse the JSON response
        let extracted: Array<{ text: string; suggestedDueAt: string; confidence: number }> = [];
        try {
            // Try to find JSON array in the response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                extracted = JSON.parse(jsonMatch[0]);
            }
        } catch (parseError) {
            console.error('[Reminders API] Error parsing LLM response:', parseError);
            // Return empty array if parsing fails
            extracted = [];
        }

        // Validate and filter the extracted reminders
        const validatedExtracted = extracted
            .filter((item: any) => {
                return (
                    item.text &&
                    typeof item.text === 'string' &&
                    item.suggestedDueAt &&
                    typeof item.suggestedDueAt === 'string' &&
                    item.confidence &&
                    typeof item.confidence === 'number'
                );
            })
            .map((item: any) => ({
                text: item.text.trim().substring(0, 500),
                suggestedDueAt: item.suggestedDueAt,
                confidence: Math.min(1, Math.max(0, item.confidence)),
            }));

        return apiSuccess({
            extracted: validatedExtracted,
            chatId,
            chatTitle: chat.title,
            messageCount: messages.length,
        });
    } catch (error) {
        console.error('[Reminders API] Error calling LLM:', error);
        return apiError('Failed to extract reminders from chat', 500);
    }
}
