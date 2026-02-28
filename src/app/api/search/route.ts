import { NextRequest } from 'next/server';
import { queryRAG } from '@/lib/rag';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { searchSchema } from '@/lib/validation';
import { checkUsageLimit, incrementUsage } from '@/lib/billing';
import { z } from 'zod';

// ============================================================
// Search API - Dashboard search endpoint
// POST /api/search
// ============================================================

export const POST = withAuth(async (req: NextRequest, { user }) => {
    // Check usage limits
    const usage = await checkUsageLimit(user.id, 'search_count');
    if (!usage.allowed) {
        return apiError(
            `Daily search limit reached (${usage.current}/${usage.limit}). Upgrade to Pro for unlimited searches.`,
            429
        );
    }

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

    // Increment usage counter on success
    await incrementUsage(user.id, 'search_count');

    return apiSuccess(result);
});
