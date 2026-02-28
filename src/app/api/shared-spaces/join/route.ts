import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Join Shared Space API
// POST /api/shared-spaces/join — Join a space by invite code
// ============================================================

const joinSpaceSchema = z.object({
  inviteCode: z.string().min(1),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, joinSpaceSchema);
  if (!parsed.success) return parsed.response;

  const { inviteCode } = parsed.data as z.infer<typeof joinSpaceSchema>;

  try {
    // Find space by invite code
    const { data: space, error: spaceError } = await supabaseAdmin
      .from('shared_spaces')
      .select('id')
      .eq('invite_code', inviteCode)
      .single();

    if (spaceError || !space) {
      return apiError('Invalid invite code', 404);
    }

    // Check if user already member
    const { data: existing } = await supabaseAdmin
      .from('space_members')
      .select('id')
      .eq('space_id', space.id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      return apiError('Already member of this space', 400);
    }

    // Add user as member
    const { data: member, error: memberError } = await supabaseAdmin
      .from('space_members')
      .insert({
        space_id: space.id,
        user_id: user.id,
        role: 'member',
        joined_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (memberError) {
      console.error('[Join Space] Insert error:', memberError);
      return apiError('Failed to join space', 500);
    }

    return apiSuccess(member, 201);
  } catch (err) {
    console.error('[Join Space] Error:', err);
    return apiError('Internal server error', 500);
  }
});
