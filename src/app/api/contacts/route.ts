import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Contact Profiles API
// GET /api/contacts - List contacts with stats
// POST /api/contacts - Update contact tags/notes
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const tag = searchParams.get('tag') || '';
    const sortBy = searchParams.get('sort') || 'recent';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build contacts query with message stats
    let query = supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('user_id', user.id);

    if (search) {
        query = query.ilike('display_name', `%${search}%`);
    }

    if (tag) {
        query = query.contains('tags', [tag]);
    }

    if (sortBy === 'recent') {
        query = query.order('updated_at', { ascending: false, nullsFirst: false });
    } else if (sortBy === 'name') {
        query = query.order('display_name', { ascending: true });
    } else if (sortBy === 'messages') {
        query = query.order('message_count', { ascending: false, nullsFirst: false });
    }

    const { data: contacts, error } = await query.range(offset, offset + limit - 1);

    if (error) {
        console.error('[Contacts API] Error fetching contacts:', error);
        return apiError('Failed to fetch contacts', 500);
    }

    // Enrich contacts with message stats in batch
    const contactIds = (contacts || []).map((c: any) => c.id);

    let messageStats: any[] = [];
    if (contactIds.length > 0) {
        const { data: stats } = await supabaseAdmin.rpc('get_contact_message_stats', {
            p_user_id: user.id,
            p_contact_ids: contactIds,
        });
        messageStats = stats || [];
    }

    const statsMap = new Map(messageStats.map((s: any) => [s.contact_id, s]));

    const enrichedContacts = (contacts || []).map((contact: any) => {
        const stats = statsMap.get(contact.id);
        return {
            ...contact,
            messageCount: stats?.message_count || 0,
            lastMessageAt: stats?.last_message_at || null,
            firstMessageAt: stats?.first_message_at || null,
            commonTopics: stats?.common_topics || [],
        };
    });

    return apiSuccess({
        contacts: enrichedContacts,
        total: enrichedContacts.length,
        offset,
        limit,
    });
});

const updateContactSchema = z.object({
    contactId: z.string().uuid(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    notes: z.string().max(2000).optional(),
    displayName: z.string().max(100).optional(),
    nickname: z.string().max(50).optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, updateContactSchema);
    if (!parsed.success) return parsed.response;

    const { contactId, tags, notes, displayName, nickname } = parsed.data as z.infer<typeof updateContactSchema>;

    // Verify ownership
    const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('id', contactId)
        .eq('user_id', user.id)
        .single();

    if (!contact) {
        return apiError('Contact not found', 404);
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (tags !== undefined) updates.tags = tags;
    if (notes !== undefined) updates.notes = notes;
    if (displayName !== undefined) updates.display_name = displayName;
    if (nickname !== undefined) updates.nickname = nickname;

    const { error } = await supabaseAdmin
        .from('contacts')
        .update(updates)
        .eq('id', contactId);

    if (error) {
        console.error('[Contacts API] Error updating contact:', error);
        return apiError('Failed to update contact', 500);
    }

    return apiSuccess({ success: true });
});
