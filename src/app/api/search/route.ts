import { NextRequest } from 'next/server';
import { queryRAG } from '@/lib/rag';
import { withAuth, parseBody, apiSuccess } from '@/lib/api-utils';
import { searchSchema } from '@/lib/validation';
import { z } from 'zod';

// ============================================================
// Search API - Dashboard search endpoint
// POST /api/search
// ============================================================

export const POST = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, searchSchema);
    if (!parsed.success) return parsed.response;

    const { query, chatId, dateFrom, dateTo, maxResults } = parsed.data as z.infer<typeof searchSchema>;

    const result = await queryRAG({
        userId: user.id,
        query,
        chatId,
        dateFrom,
        dateTo,
        maxResults,
        includeAttachments: true,
    });

    return apiSuccess(result);
});
