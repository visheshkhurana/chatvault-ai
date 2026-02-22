import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Saved Searches & Smart Collections API
// GET /api/saved-searches - List saved searches
// POST /api/saved-searches - Create/update saved search
// DELETE /api/saved-searches - Delete saved search
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
    const { data: searches, error } = await supabaseAdmin
        .from('saved_searches')
        .select('*')
        .eq('user_id', user.id)
        .order('last_used_at', { ascending: false, nullsFirst: false });

    if (error) {
        console.error('[Saved Searches] Error:', error);
        return apiError('Failed to fetch saved searches', 500);
    }

    return apiSuccess({ searches: searches || [] });
});

const createSearchSchema = z.object({
    name: z.string().min(1).max(100),
    query: z.string().min(1).max(500),
    chatId: z.string().uuid().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    filters: z.object({
        messageType: z.string().optional(),
        senderName: z.string().optional(),
        hasAttachment: z.boolean().optional(),
    }).optional(),
    isSmartCollection: z.boolean().optional().default(false),
    icon: z.string().max(10).optional(),
    color: z.string().max(20).optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, createSearchSchema);
    if (!parsed.success) return parsed.response;

    const { name, query, chatId, dateFrom, dateTo, filters, isSmartCollection, icon, color } = parsed.data as z.infer<typeof createSearchSchema>;

    const { data: search, error } = await supabaseAdmin
        .from('saved_searches')
        .insert({
            user_id: user.id,
            name,
            query,
            chat_id: chatId || null,
            date_from: dateFrom || null,
            date_to: dateTo || null,
            filters: filters || {},
            is_smart_collection: isSmartCollection,
            icon: icon || null,
            color: color || null,
            last_used_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (error) {
        console.error('[Saved Searches] Error creating:', error);
        return apiError('Failed to create saved search', 500);
    }

    return apiSuccess({ search });
});

const deleteSearchSchema = z.object({
    id: z.string().uuid(),
});

export const DELETE = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, deleteSearchSchema);
    if (!parsed.success) return parsed.response;

    const { error } = await supabaseAdmin
        .from('saved_searches')
        .delete()
        .eq('id', (parsed.data as z.infer<typeof deleteSearchSchema>).id)
        .eq('user_id', user.id);

    if (error) {
        console.error('[Saved Searches] Error deleting:', error);
        return apiError('Failed to delete saved search', 500);
    }

    return apiSuccess({ success: true });
});
