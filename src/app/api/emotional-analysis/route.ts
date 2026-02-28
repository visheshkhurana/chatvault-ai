import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Emotional Analysis API
// GET /api/emotional-analysis — Get emotional analysis for contact/chat
// POST /api/emotional-analysis — Trigger analysis
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const contactPhone = searchParams.get('contactPhone');
    const period = searchParams.get('period') || 'daily';

    let query = supabaseAdmin
      .from('emotional_analysis')
      .select('*')
      .eq('user_id', user.id);

    if (contactPhone) {
      query = query.eq('contact_phone', contactPhone);
    }

    if (['daily', 'weekly', 'monthly'].includes(period)) {
      query = query.eq('period', period);
    }

    const { data: analysis, error } = await query.order('analyzed_at', { ascending: false });

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (expected)
      console.error('[Emotional Analysis] Query error:', error);
      return apiError('Failed to fetch analysis', 500);
    }

    return apiSuccess(analysis || []);
  } catch (err) {
    console.error('[Emotional Analysis] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const triggerAnalysisSchema = z.object({
  chatId: z.string().uuid().optional(),
  contactPhone: z.string().optional(),
  periodType: z.enum(['daily', 'weekly', 'monthly']).optional().default('daily'),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, triggerAnalysisSchema);
  if (!parsed.success) return parsed.response;

  const { chatId, contactPhone, periodType } =
    parsed.data as z.infer<typeof triggerAnalysisSchema>;

  try {
    if (!chatId && !contactPhone) {
      return apiError('Either chatId or contactPhone is required', 400);
    }

    let analysisData: Record<string, any> = {
      user_id: user.id,
      period: periodType,
      analyzed_at: new Date().toISOString(),
    };

    if (contactPhone) {
      analysisData.contact_phone = contactPhone;

      // Get chat for contact
      const { data: contacts } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('user_id', user.id)
        .eq('wa_id', contactPhone)
        .limit(1);

      if (contacts?.length) {
        const { data: chats } = await supabaseAdmin
          .from('chats')
          .select('id')
          .eq('user_id', user.id)
          .eq('contact_id', contacts[0].id)
          .limit(1);

        if (chats?.length) {
          analysisData.chat_id = chats[0].id;
        }
      }
    } else if (chatId) {
      analysisData.chat_id = chatId;
    }

    // Simple sentiment analysis: fetch recent messages and calculate basic sentiment
    let messages: any[] = [];
    if (analysisData.chat_id) {
      const dateFrom = new Date();
      if (periodType === 'daily') {
        dateFrom.setDate(dateFrom.getDate() - 1);
      } else if (periodType === 'weekly') {
        dateFrom.setDate(dateFrom.getDate() - 7);
      } else {
        dateFrom.setMonth(dateFrom.getMonth() - 1);
      }

      const { data: msgs } = await supabaseAdmin
        .from('messages')
        .select('text_content, is_from_me')
        .eq('user_id', user.id)
        .eq('chat_id', analysisData.chat_id)
        .gte('timestamp', dateFrom.toISOString());

      messages = msgs || [];
    }

    // Calculate sentiment (very basic)
    let sentimentScore = 0;
    const positiveWords = ['good', 'great', 'amazing', 'happy', 'love', 'wonderful', 'excellent'];
    const negativeWords = ['bad', 'terrible', 'awful', 'sad', 'hate', 'angry', 'horrible'];

    for (const msg of messages) {
      if (msg.text_content) {
        const lower = msg.text_content.toLowerCase();
        for (const word of positiveWords) {
          if (lower.includes(word)) sentimentScore += 0.2;
        }
        for (const word of negativeWords) {
          if (lower.includes(word)) sentimentScore -= 0.2;
        }
      }
    }

    // Normalize to -1 to 1
    sentimentScore = Math.max(-1, Math.min(1, sentimentScore / Math.max(messages.length, 1)));

    analysisData.sentiment_score = sentimentScore;
    analysisData.message_count = messages.length;
    analysisData.dominant_emotions = sentimentScore > 0.3 ? ['positive'] : sentimentScore < -0.3 ? ['negative'] : ['neutral'];
    analysisData.trends = { direction: sentimentScore > 0 ? 'positive' : 'negative', strength: Math.abs(sentimentScore) };

    // Insert analysis
    const { data: analysis, error } = await supabaseAdmin
      .from('emotional_analysis')
      .insert(analysisData)
      .select()
      .single();

    if (error) {
      console.error('[Emotional Analysis] Insert error:', error);
      return apiError('Failed to create analysis', 500);
    }

    return apiSuccess(analysis, 201);
  } catch (err) {
    console.error('[Emotional Analysis] Error:', err);
    return apiError('Internal server error', 500);
  }
});
