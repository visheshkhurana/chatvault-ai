import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateChatSummary } from '@/lib/rag';
import { withAuth, parseBody, apiSuccess } from '@/lib/api-utils';
import { summarizeSchema } from '@/lib/validation';
import { z } from 'zod';

// ============================================================
// Summarize API - Generate chat summaries
// POST /api/summarize
// ============================================================

export const POST = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, summarizeSchema);
    if (!parsed.success) return parsed.response;

    const { chatId, days } = parsed.data as z.infer<typeof summarizeSchema>;

    const dateTo = new Date().toISOString();
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const result = await generateChatSummary({
        userId: user.id,
        chatId,
        dateFrom,
        dateTo,
    });

    // Store the summary
    await supabaseAdmin.from('chat_summaries').insert({
        user_id: user.id,
        chat_id: chatId,
        summary_type: days <= 1 ? 'daily' : 'weekly',
        summary_text: result.summary,
        period_start: dateFrom,
        period_end: dateTo,
        key_topics: result.keyTopics,
        action_items: result.actionItems,
    });

    return apiSuccess(result);
});
