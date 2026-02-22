import { NextRequest } from 'next/server';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
});

const LLM_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

// Zod validation schemas
const createLabelSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  icon: z.string().optional(),
  isSmart: z.boolean().optional().default(false),
  smartFilter: z.record(z.any()).optional(),
  chatIds: z.array(z.string()).optional().default([]),
});

const updateLabelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  chatIds: z.array(z.string()).optional(),
});

const deleteLabelSchema = z.object({
  id: z.string().uuid(),
});

const assignChatsSchema = z.object({
  labelId: z.string().uuid(),
  chatIds: z.array(z.string()).min(1),
  action: z.enum(['add', 'remove']),
});

type CreateLabelInput = z.infer<typeof createLabelSchema>;
type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
type AssignChatsInput = z.infer<typeof assignChatsSchema>;

// GET /api/labels - List all labels for the user with chat counts
export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const { data: labels, error } = await supabaseAdmin
      .from('labels')
      .select('id, user_id, name, color, icon, is_smart, smart_filter, chat_ids, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return apiError('Failed to fetch labels', 500);
    }

    const labelsWithCounts = labels.map((label) => ({
      ...label,
      chatCount: label.chat_ids?.length || 0,
    }));

    return apiSuccess(labelsWithCounts);
  } catch (error) {
    console.error('GET /api/labels error:', error);
    return apiError('Internal server error', 500);
  }
});

// POST /api/labels - Create a new label
export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
    const parsed = await parseBody(request, createLabelSchema);
    if (!parsed.success) return parsed.response;
    const validatedData = parsed.data;

    // Check for duplicate label names
    const { data: existingLabel } = await supabaseAdmin
      .from('labels')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', validatedData.name)
      .single();

    if (existingLabel) {
      return apiError('Label with this name already exists', 400);
    }

    const { data: newLabel, error } = await supabaseAdmin
      .from('labels')
      .insert([
        {
          user_id: user.id,
          name: validatedData.name,
          color: validatedData.color,
          icon: validatedData.icon || null,
          is_smart: validatedData.isSmart,
          smart_filter: validatedData.smartFilter || null,
          chat_ids: validatedData.chatIds || [],
        },
      ])
      .select();

    if (error) {
      console.error('Insert error:', error);
      return apiError('Failed to create label', 500);
    }

    const label = newLabel[0];
    return apiSuccess({
      ...label,
      chatCount: label.chat_ids?.length || 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError('Validation error', 400);
    }
    console.error('POST /api/labels error:', error);
    return apiError('Internal server error', 500);
  }
});

// PATCH /api/labels - Update a label
export const PATCH = withAuth(async (request: NextRequest, { user }) => {
  try {
    const parsed = await parseBody(request, updateLabelSchema);
    if (!parsed.success) return parsed.response;
    const validatedData = parsed.data;

    // Verify label belongs to user
    const { data: existingLabel, error: fetchError } = await supabaseAdmin
      .from('labels')
      .select('id, user_id')
      .eq('id', validatedData.id)
      .single();

    if (fetchError || !existingLabel) {
      return apiError('Label not found', 404);
    }

    if (existingLabel.user_id !== user.id) {
      return apiError('Unauthorized', 403);
    }

    // Check for duplicate name if updating name
    if (validatedData.name) {
      const { data: duplicateLabel } = await supabaseAdmin
        .from('labels')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', validatedData.name)
        .neq('id', validatedData.id)
        .single();

      if (duplicateLabel) {
        return apiError('Label with this name already exists', 400);
      }
    }

    const updatePayload: Record<string, any> = {};
    if (validatedData.name !== undefined) updatePayload.name = validatedData.name;
    if (validatedData.color !== undefined) updatePayload.color = validatedData.color;
    if (validatedData.chatIds !== undefined) updatePayload.chat_ids = validatedData.chatIds;
    updatePayload.updated_at = new Date().toISOString();

    const { data: updatedLabel, error: updateError } = await supabaseAdmin
      .from('labels')
      .update(updatePayload)
      .eq('id', validatedData.id)
      .select();

    if (updateError) {
      console.error('Update error:', updateError);
      return apiError('Failed to update label', 500);
    }

    const label = updatedLabel[0];
    return apiSuccess({
      ...label,
      chatCount: label.chat_ids?.length || 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError('Validation error', 400);
    }
    console.error('PATCH /api/labels error:', error);
    return apiError('Internal server error', 500);
  }
});

// DELETE /api/labels - Delete a label
export const DELETE = withAuth(async (request: NextRequest, { user }) => {
  try {
    const parsed = await parseBody(request, deleteLabelSchema);
    if (!parsed.success) return parsed.response;
    const validatedData = parsed.data;

    // Verify label belongs to user
    const { data: existingLabel, error: fetchError } = await supabaseAdmin
      .from('labels')
      .select('id, user_id')
      .eq('id', validatedData.id)
      .single();

    if (fetchError || !existingLabel) {
      return apiError('Label not found', 404);
    }

    if (existingLabel.user_id !== user.id) {
      return apiError('Unauthorized', 403);
    }

    const { error: deleteError } = await supabaseAdmin
      .from('labels')
      .delete()
      .eq('id', validatedData.id);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return apiError('Failed to delete label', 500);
    }

    return apiSuccess({ id: validatedData.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError('Validation error', 400);
    }
    console.error('DELETE /api/labels error:', error);
    return apiError('Internal server error', 500);
  }
});

// POST /api/labels/assign - Assign/remove chats to/from a label
export const assignChats = withAuth(
  async (request: NextRequest, { user }) => {
    try {
      const parsed = await parseBody(request, assignChatsSchema);
      if (!parsed.success) return parsed.response;
      const validatedData = parsed.data;

      // Verify label belongs to user
      const { data: label, error: fetchError } = await supabaseAdmin
        .from('labels')
        .select('id, user_id, chat_ids')
        .eq('id', validatedData.labelId)
        .single();

      if (fetchError || !label) {
        return apiError('Label not found', 404);
      }

      if (label.user_id !== user.id) {
        return apiError('Unauthorized', 403);
      }

      // Verify all chats belong to user
      const { data: userChats, error: chatsError } = await supabaseAdmin
        .from('chats')
        .select('id')
        .eq('user_id', user.id)
        .in('id', validatedData.chatIds);

      if (chatsError) {
        return apiError('Failed to verify chats', 500);
      }

      const validChatIds = new Set(userChats.map((c) => c.id));
      const invalidChats = validatedData.chatIds.filter((id) => !validChatIds.has(id));

      if (invalidChats.length > 0) {
        return apiError('Some chats not found or do not belong to user', 400);
      }

      // Update chat_ids array
      let updatedChatIds = label.chat_ids || [];

      if (validatedData.action === 'add') {
        updatedChatIds = Array.from(
          new Set([...updatedChatIds, ...validatedData.chatIds])
        );
      } else if (validatedData.action === 'remove') {
        updatedChatIds = updatedChatIds.filter(
          (id: string) => !validatedData.chatIds.includes(id)
        );
      }

      const { data: updatedLabel, error: updateError } = await supabaseAdmin
        .from('labels')
        .update({
          chat_ids: updatedChatIds,
          updated_at: new Date().toISOString(),
        })
        .eq('id', validatedData.labelId)
        .select();

      if (updateError) {
        console.error('Update error:', updateError);
        return apiError('Failed to update label', 500);
      }

      const updatedLabelData = updatedLabel[0];
      return apiSuccess({
        ...updatedLabelData,
        chatCount: updatedLabelData.chat_ids?.length || 0,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return apiError('Validation error', 400);
      }
      console.error('POST /api/labels/assign error:', error);
      return apiError('Internal server error', 500);
    }
  }
);

// POST /api/labels/auto-categorize - Use LLM to auto-categorize all chats
export const autoCategorize = withAuth(
  async (request: NextRequest, { user }) => {
    try {
      // Fetch all chats for user with recent messages
      const { data: chats, error: chatsError } = await supabaseAdmin
        .from('chats')
        .select('id, title, phone_number')
        .eq('user_id', user.id);

      if (chatsError || !chats) {
        return apiError('Failed to fetch chats', 500);
      }

      if (chats.length === 0) {
        return apiSuccess({ suggestions: [] });
      }

      // Fetch recent messages for each chat to provide context
      const chatContexts = await Promise.all(
        chats.map(async (chat) => {
          const { data: messages } = await supabaseAdmin
            .from('messages')
            .select('body')
            .eq('chat_id', chat.id)
            .order('created_at', { ascending: false })
            .limit(10);

          const recentMessagesText = messages?.map((m) => m.body).join(' ') || '';

          return {
            chatId: chat.id,
            chatTitle: chat.title || chat.phone_number,
            recentMessages: recentMessagesText.substring(0, 500), // Limit context size
          };
        })
      );

      // Prepare context for LLM
      const contextText = chatContexts
        .map(
          (ctx) =>
            `Chat: ${ctx.chatTitle}\nMessages: ${ctx.recentMessages || '(no messages)'}`
        )
        .join('\n\n---\n\n');

      // Call LLM to categorize
      const prompt = `You are a chat categorization assistant. Analyze the following WhatsApp chats and suggest appropriate labels/categories for each.

Common label categories: Work, Family, Friends, Shopping, Finance, Health, Travel, Personal, Entertainment, Support, Business, Community.

For each chat, provide 1-3 suggested labels that best match its content. Rate your confidence (0-1) for each suggestion.

Chat Data:
${contextText}

Return a JSON array with this structure:
[
  {
    "chatId": "chat-id",
    "chatTitle": "Chat Title",
    "suggestedLabels": ["Label1", "Label2"],
    "confidence": 0.85
  }
]

Only return valid JSON, no additional text.`;

      const response = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const responseText = response.choices[0]?.message?.content || '[]';

      // Parse LLM response
      let suggestions: Array<{
        chatId: string;
        chatTitle: string;
        suggestedLabels: string[];
        confidence: number;
      }> = [];

      try {
        // Extract JSON from response (in case there's surrounding text)
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        } else {
          suggestions = JSON.parse(responseText);
        }

        // Validate and filter suggestions
        suggestions = suggestions.filter(
          (s) =>
            s.chatId &&
            s.chatTitle &&
            Array.isArray(s.suggestedLabels) &&
            typeof s.confidence === 'number'
        );
      } catch (parseError) {
        console.error('Failed to parse LLM response:', responseText);
        return apiError('Failed to categorize chats', 500);
      }

      return apiSuccess({ suggestions });
    } catch (error) {
      console.error('POST /api/labels/auto-categorize error:', error);
      return apiError('Internal server error', 500);
    }
  }
);
