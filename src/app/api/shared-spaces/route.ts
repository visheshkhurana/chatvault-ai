import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';
import { randomBytes } from 'crypto';

// ============================================================
// Shared Spaces API
// GET /api/shared-spaces — List user's shared spaces
// POST /api/shared-spaces — Create a new shared space
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    // Get spaces where user is owner or member
    const { data: spaces, error } = await supabaseAdmin
      .from('shared_spaces')
      .select('id, name, description, space_type, created_by, created_at')
      .or(`created_by.eq.${user.id},members.not.is.null`)
      .order('created_at', { ascending: false });

    if (error && error.code !== 'PGRST116') {
      console.error('[Shared Spaces] Query error:', error);
      return apiError('Failed to fetch shared spaces', 500);
    }

    // Get member count for each space
    const result = [];
    if (spaces) {
      for (const space of spaces) {
        const { count } = await supabaseAdmin
          .from('space_members')
          .select('*', { count: 'exact', head: true })
          .eq('space_id', space.id);

        result.push({
          ...space,
          memberCount: count || 0,
          isOwner: space.created_by === user.id,
        });
      }
    }

    return apiSuccess(result);
  } catch (err) {
    console.error('[Shared Spaces] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const createSpaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  spaceType: z.enum(['memories', 'notes', 'todos']).optional().default('notes'),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, createSpaceSchema);
  if (!parsed.success) return parsed.response;

  const { name, description, spaceType } = parsed.data as z.infer<typeof createSpaceSchema>;

  try {
    // Create space
    const { data: space, error: spaceError } = await supabaseAdmin
      .from('shared_spaces')
      .insert({
        name,
        description,
        space_type: spaceType,
        created_by: user.id,
        invite_code: randomBytes(8).toString('hex'),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (spaceError) {
      console.error('[Shared Spaces] Create error:', spaceError);
      return apiError('Failed to create space', 500);
    }

    // Add creator as owner member
    await supabaseAdmin.from('space_members').insert({
      space_id: space.id,
      user_id: user.id,
      role: 'owner',
      joined_at: new Date().toISOString(),
    });

    return apiSuccess(space, 201);
  } catch (err) {
    console.error('[Shared Spaces] Error:', err);
    return apiError('Internal server error', 500);
  }
});
