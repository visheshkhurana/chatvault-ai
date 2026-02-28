import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Check onboarding status
export const GET = withAuth(async (_req: NextRequest, { user }) => {
  const { data, error } = await supabaseAdmin
    .from('onboarding_progress')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return apiError('Failed to fetch onboarding status', 500);
  }

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single();

  return apiSuccess({
    completed: data?.completed || userData?.onboarding_completed || false,
    progress: data || null,
  });
});

// POST: Update onboarding progress
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = await req.json();
  const {
    completed = false,
    current_step = 0,
    steps_completed = [],
    skipped = false,
    whatsapp_connected = false,
    first_search_done = false,
    first_commitment_viewed = false,
    first_summary_viewed = false,
  } = body;

  const { error } = await supabaseAdmin
    .from('onboarding_progress')
    .upsert({
      user_id: user.id,
      completed,
      current_step,
      steps_completed: JSON.stringify(steps_completed),
      whatsapp_connected,
      first_search_done,
      first_commitment_viewed,
      first_summary_viewed,
      skipped,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    return apiError('Failed to save onboarding progress', 500);
  }

  if (completed || skipped) {
    await supabaseAdmin
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', user.id);
  }

  return apiSuccess({ saved: true });
});
