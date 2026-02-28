import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import OpenAI from 'openai';
import { z } from 'zod';

// ============================================================
// Response Suggestions API
// GET /api/response-suggestions — Get recent suggestions for chat
// POST /api/response-suggestions — Generate new suggestions
// PATCH /api/response-suggestions — Rate or dismiss suggestion
// ============================================================

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
});

const MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return apiError('chatId query parameter is required', 400);
    }

    const { data: suggestions, error } = await supabaseAdmin
      .from('response_suggestions')
      .select('*')
      .eq('user_id', user.id)
      .eq('chat_id', chatId)
      .eq('status', 'unused')
      .not('dismissed_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[Response Suggestions] Query error:', error);
      return apiError('Failed to fetch suggestions', 500);
    }

    return apiSuccess(suggestions || []);
  } catch (err) {
    console.error('[Response Suggestions] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const generateSuggestionsSchema = z.object({
  chatId: z.string().uuid(),
  messageId: z.string().uuid(),
  messageText: z.string().min(1),
  contactName: z.string().min(1),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, generateSuggestionsSchema);
  if (!parsed.success) return parsed.response;

  const { chatId, messageId, messageText, contactName } =
    parsed.data as z.infer<typeof generateSuggestionsSchema>;

  try {
    // Generate suggestions using LLM
    const prompt = `You are a helpful WhatsApp assistant. A contact named "${contactName}" just sent: "${messageText}"

Generate 2-3 brief, contextual response suggestions for this message. Each suggestion should be a natural reply (1-2 sentences). Format as a JSON array of objects with "text" and "tone" fields.

Example format:
[
  { "text": "That sounds great!", "tone": "positive" },
  { "text": "Let me get back to you on that.", "tone": "neutral" }
]`;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
    });

    let suggestions: Array<{ text: string; tone: string }> = [];
    try {
      const content = response.choices[0]?.message?.content || '';
      // Extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback generic suggestions
      suggestions = [
        { text: 'Thanks for letting me know!', tone: 'positive' },
        { text: 'I appreciate that.', tone: 'neutral' },
      ];
    }

    // Store suggestions in database
    const storedSuggestions = [];
    for (const suggestion of suggestions.slice(0, 3)) {
      const { data: stored } = await supabaseAdmin
        .from('response_suggestions')
        .insert({
          user_id: user.id,
          chat_id: chatId,
          message_id: messageId,
          suggestion_text: suggestion.text,
          tone: suggestion.tone,
          status: 'unused',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (stored) {
        storedSuggestions.push(stored);
      }
    }

    return apiSuccess(storedSuggestions);
  } catch (err) {
    console.error('[Response Suggestions] Generation error:', err);
    return apiError('Failed to generate suggestions', 500);
  }
});

const rateSchema = z.object({
  suggestionId: z.string().uuid(),
  action: z.enum(['use', 'dismiss']),
  rating: z.number().min(1).max(5).optional(),
});

export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, rateSchema);
  if (!parsed.success) return parsed.response;

  const { suggestionId, action, rating } = parsed.data as z.infer<typeof rateSchema>;

  try {
    const updateData: Record<string, any> = {
      status: action === 'use' ? 'used' : 'dismissed',
      updated_at: new Date().toISOString(),
    };

    if (action === 'dismiss') {
      updateData.dismissed_at = new Date().toISOString();
    }

    if (rating !== undefined) {
      updateData.rating = rating;
    }

    const { error } = await supabaseAdmin
      .from('response_suggestions')
      .update(updateData)
      .eq('id', suggestionId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Response Suggestions] Update error:', error);
      return apiError('Failed to update suggestion', 500);
    }

    return apiSuccess({ success: true });
  } catch (err) {
    console.error('[Response Suggestions] Error:', err);
    return apiError('Internal server error', 500);
  }
});
