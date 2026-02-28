import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';

// POST: Subscribe to push notifications
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = await req.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return apiError('Missing push subscription data', 400);
  }

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert({
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: req.headers.get('user-agent') || '',
      created_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });

  if (error) {
    return apiError('Failed to save push subscription', 500);
  }

  await supabaseAdmin
    .from('notification_preferences')
    .upsert({
      user_id: user.id,
      push_enabled: true,
    }, { onConflict: 'user_id' });

  return apiSuccess({ subscribed: true });
});

// DELETE: Unsubscribe from push notifications
export const DELETE = withAuth(async (req: NextRequest, { user }) => {
  const body = await req.json();
  const { endpoint } = body;

  if (!endpoint) {
    return apiError('Missing endpoint', 400);
  }

  await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  const { data: remaining } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);

  if (!remaining || remaining.length === 0) {
    await supabaseAdmin
      .from('notification_preferences')
      .update({ push_enabled: false })
      .eq('user_id', user.id);
  }

  return apiSuccess({ unsubscribed: true });
});
