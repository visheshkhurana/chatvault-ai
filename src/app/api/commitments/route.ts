import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Commitment Tracker API
// GET /api/commitments - List commitments for the user
// POST /api/commitments - Create or update a commitment
// ============================================================

// --- GET: List Commitments ---
export const GET = withAuth(async (req: NextRequest, { user }) => {
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') || '';
    const chatId = searchParams.get('chatId') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate status filter
    const validStatuses = ['pending', 'done', 'overdue'];
    if (status && !validStatuses.includes(status)) {
        return apiError('Invalid status filter', 400);
    }

    // Build base query
    let query = supabaseAdmin
        .from('commitments')
        .select(
            `
            id,
            text,
            committed_by,
            priority,
            status,
            due_date,
            created_at,
            updated_at,
            chat_id,
            contact_id,
            chats(title),
            contacts(display_name)
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
        query = query
            .eq('status', 'pending')
            .lt('due_date', new Date().toISOString())
            .not('due_date', 'is', null);
    }

    // Apply chat filter if provided
    if (chatId) {
        query = query.eq('chat_id', chatId);
    }

    // Order by due_date (nulls last), then created_at desc
    query = query
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

    // Apply pagination
    const { data: commitments, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
        console.error('[Commitments API] Error fetching commitments:', error);
        return apiError('Failed to fetch commitments', 500);
    }

    // Mark overdue commitments
    const enrichedCommitments = (commitments || []).map((c: any) => {
        const isOverdue =
            c.status === 'pending' && c.due_date && new Date(c.due_date) < new Date();
        return {
            ...c,
            isOverdue,
        };
    });

    return apiSuccess({
        commitments: enrichedCommitments,
        total: count || 0,
        offset,
        limit,
    });
});

// --- POST: Create or Update Commitment ---

const createCommitmentSchema = z.object({
    text: z.string().min(1).max(500),
    chatId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    dueDate: z.string().datetime().optional(),
    committedBy: z.enum(['me', 'them', 'mutual']),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

const updateCommitmentSchema = z.object({
    id: z.string().uuid(),
    status: z.enum(['pending', 'done', 'cancelled']).optional(),
    dueDate: z.string().datetime().optional().nullable(),
    text: z.string().min(1).max(500).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
});

const commitmentBodySchema = z.union([createCommitmentSchema, updateCommitmentSchema]);

type CommitmentInput = z.infer<typeof commitmentBodySchema>;

export const POST = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, commitmentBodySchema);
    if (!parsed.success) return parsed.response;

    const data = parsed.data as CommitmentInput;

    // Check if updating or creating
    if ('id' in data && data.id) {
        // Update existing commitment
        const { id, status, dueDate, text, priority } = data;

        // Verify ownership
        const { data: commitment } = await supabaseAdmin
            .from('commitments')
            .select('id')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (!commitment) {
            return apiError('Commitment not found', 404);
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (status !== undefined) updates.status = status;
        if (dueDate !== undefined) updates.due_date = dueDate;
        if (text !== undefined) updates.text = text;
        if (priority !== undefined) updates.priority = priority;

        const { error } = await supabaseAdmin
            .from('commitments')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error('[Commitments API] Error updating commitment:', error);
            return apiError('Failed to update commitment', 500);
        }

        return apiSuccess({ id, ...updates });
    } else {
        // Create new commitment
        const createData = data as z.infer<typeof createCommitmentSchema>;

        // Verify chat and contact exist (if provided)
        if (createData.chatId) {
            const { data: chat } = await supabaseAdmin
                .from('chats')
                .select('id')
                .eq('id', createData.chatId)
                .eq('user_id', user.id)
                .single();

            if (!chat) {
                return apiError('Chat not found', 404);
            }
        }

        if (createData.contactId) {
            const { data: contact } = await supabaseAdmin
                .from('contacts')
                .select('id')
                .eq('id', createData.contactId)
                .eq('user_id', user.id)
                .single();

            if (!contact) {
                return apiError('Contact not found', 404);
            }
        }

        const { data: commitment, error } = await supabaseAdmin
            .from('commitments')
            .insert({
                user_id: user.id,
                text: createData.text,
                chat_id: createData.chatId || null,
                contact_id: createData.contactId || null,
                due_date: createData.dueDate || null,
                committed_by: createData.committedBy,
                priority: createData.priority,
                status: 'pending',
            })
            .select()
            .single();

        if (error) {
            console.error('[Commitments API] Error creating commitment:', error);
            return apiError('Failed to create commitment', 500);
        }

        return apiSuccess(commitment, 201);
    }
});
