import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Platforms API — User's platform connections
// GET /api/platforms — List user's platform connections
// POST /api/platforms — Add a new platform connection
// DELETE /api/platforms — Remove a platform connection
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { data: platforms, error } = await supabaseAdmin
      .from('platform_connections')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Platforms] Query error:', error);
      return apiError('Failed to fetch platform connections', 500);
    }

    return apiSuccess(platforms || []);
  } catch (err) {
    console.error('[Platforms] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const addPlatformSchema = z.object({
  platform: z.string().min(1).max(50),
  platformUserId: z.string().optional(),
  phoneNumber: z.string().optional(),
  config: z.record(z.any()).optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, addPlatformSchema);
  if (!parsed.success) return parsed.response;

  const { platform, platformUserId, phoneNumber, config } =
    parsed.data as z.infer<typeof addPlatformSchema>;

  try {
    const { data: newConnection, error } = await supabaseAdmin
      .from('platform_connections')
      .insert({
        user_id: user.id,
        platform,
        platform_user_id: platformUserId,
        phone_number: phoneNumber,
        config: config || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Platforms] Insert error:', error);
      return apiError('Failed to add platform connection', 500);
    }

    return apiSuccess(newConnection, 201);
  } catch (err) {
    console.error('[Platforms] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const removePlatformSchema = z.object({
  platformId: z.string().uuid(),
});

export const DELETE = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, removePlatformSchema);
  if (!parsed.success) return parsed.response;

  const { platformId } = parsed.data as z.infer<typeof removePlatformSchema>;

  try {
    const { error } = await supabaseAdmin
      .from('platform_connections')
      .delete()
      .eq('id', platformId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Platforms] Delete error:', error);
      return apiError('Failed to remove platform connection', 500);
    }

    return apiSuccess({ success: true });
  } catch (err) {
    console.error('[Platforms] Error:', err);
    return apiError('Internal server error', 500);
  }
});
