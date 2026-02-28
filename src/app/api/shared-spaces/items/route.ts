import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Shared Space Items API
// GET /api/shared-spaces/items — List items in a space
// POST /api/shared-spaces/items — Share an item to a space
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const spaceId = searchParams.get('spaceId');

    if (!spaceId) {
      return apiError('spaceId query parameter is required', 400);
    }

    // Verify user is member of space
    const { data: membership } = await supabaseAdmin
      .from('space_members')
      .select('id')
      .eq('space_id', spaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return apiError('Not a member of this space', 403);
    }

    // Fetch items
    const { data: items, error } = await supabaseAdmin
      .from('space_items')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Space Items] Query error:', error);
      return apiError('Failed to fetch items', 500);
    }

    return apiSuccess(items || []);
  } catch (err) {
    console.error('[Space Items] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const shareItemSchema = z.object({
  spaceId: z.string().uuid(),
  itemType: z.string().min(1).max(50),
  content: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, shareItemSchema);
  if (!parsed.success) return parsed.response;

  const { spaceId, itemType, content, metadata } = parsed.data as z.infer<typeof shareItemSchema>;

  try {
    // Verify user is member of space
    const { data: membership } = await supabaseAdmin
      .from('space_members')
      .select('id')
      .eq('space_id', spaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return apiError('Not a member of this space', 403);
    }

    // Create item
    const { data: item, error } = await supabaseAdmin
      .from('space_items')
      .insert({
        space_id: spaceId,
        shared_by: user.id,
        item_type: itemType,
        content,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Space Items] Insert error:', error);
      return apiError('Failed to share item', 500);
    }

    return apiSuccess(item, 201);
  } catch (err) {
    console.error('[Space Items] Error:', err);
    return apiError('Internal server error', 500);
  }
});
