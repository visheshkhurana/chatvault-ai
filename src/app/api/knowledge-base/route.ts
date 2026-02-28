import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Knowledge Base API
// GET /api/knowledge-base — Browse knowledge base
// POST /api/knowledge-base — Add entry manually
// PATCH /api/knowledge-base — Update entry
// DELETE /api/knowledge-base — Remove entry
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const pinned = searchParams.get('pinned');

    let query = supabaseAdmin
      .from('knowledge_base_entries')
      .select('*')
      .eq('user_id', user.id);

    if (pinned === 'true') {
      query = query.eq('pinned', true);
    } else if (!category && !search) {
      query = query.eq('archived', false);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data: entries, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      console.error('[Knowledge Base] Query error:', error);
      return apiError('Failed to fetch entries', 500);
    }

    let filtered = entries || [];

    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.title.toLowerCase().includes(lowerSearch) ||
          e.content.toLowerCase().includes(lowerSearch)
      );
    }

    return apiSuccess(filtered);
  } catch (err) {
    console.error('[Knowledge Base] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const addEntrySchema = z.object({
  category: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, addEntrySchema);
  if (!parsed.success) return parsed.response;

  const { category, title, content, tags } = parsed.data as z.infer<typeof addEntrySchema>;

  try {
    const { data: entry, error } = await supabaseAdmin
      .from('knowledge_base_entries')
      .insert({
        user_id: user.id,
        category,
        title,
        content,
        tags: tags || [],
        verified: false,
        pinned: false,
        archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Knowledge Base] Insert error:', error);
      return apiError('Failed to add entry', 500);
    }

    return apiSuccess(entry, 201);
  } catch (err) {
    console.error('[Knowledge Base] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const updateEntrySchema = z.object({
  entryId: z.string().uuid(),
  verified: z.boolean().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, updateEntrySchema);
  if (!parsed.success) return parsed.response;

  const { entryId, verified, pinned, archived } =
    parsed.data as z.infer<typeof updateEntrySchema>;

  try {
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (verified !== undefined) updates.verified = verified;
    if (pinned !== undefined) updates.pinned = pinned;
    if (archived !== undefined) updates.archived = archived;

    const { error } = await supabaseAdmin
      .from('knowledge_base_entries')
      .update(updates)
      .eq('id', entryId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Knowledge Base] Update error:', error);
      return apiError('Failed to update entry', 500);
    }

    return apiSuccess({ success: true });
  } catch (err) {
    console.error('[Knowledge Base] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const deleteEntrySchema = z.object({
  entryId: z.string().uuid(),
});

export const DELETE = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, deleteEntrySchema);
  if (!parsed.success) return parsed.response;

  const { entryId } = parsed.data as z.infer<typeof deleteEntrySchema>;

  try {
    const { error } = await supabaseAdmin
      .from('knowledge_base_entries')
      .delete()
      .eq('id', entryId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Knowledge Base] Delete error:', error);
      return apiError('Failed to delete entry', 500);
    }

    return apiSuccess({ success: true });
  } catch (err) {
    console.error('[Knowledge Base] Error:', err);
    return apiError('Internal server error', 500);
  }
});
