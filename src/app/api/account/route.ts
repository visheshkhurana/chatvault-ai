import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Export all user data (GDPR data portability)
export const GET = withAuth(async (_req: NextRequest, { user }) => {
  try {
    // Fetch all user data in parallel
    const [
      userData,
      chats,
      messages,
      commitments,
      reminders,
      summaries,
      searchHistory,
      preferences,
      onboarding,
      pushSubs,
      usage,
    ] = await Promise.all([
      supabaseAdmin.from('users').select('*').eq('id', user.id).single(),
      supabaseAdmin.from('chats').select('*').eq('user_id', user.id),
      supabaseAdmin.from('messages').select('id, chat_id, sender, content, timestamp, message_type, media_type, is_forwarded, is_starred, reply_to').eq('user_id', user.id),
      supabaseAdmin.from('commitments').select('*').eq('user_id', user.id),
      supabaseAdmin.from('reminders').select('*').eq('user_id', user.id),
      supabaseAdmin.from('chat_summaries').select('*').eq('user_id', user.id),
      supabaseAdmin.from('search_history').select('*').eq('user_id', user.id),
      supabaseAdmin.from('notification_preferences').select('*').eq('user_id', user.id).single(),
      supabaseAdmin.from('onboarding_progress').select('*').eq('user_id', user.id).single(),
      supabaseAdmin.from('push_subscriptions').select('endpoint, user_agent, created_at').eq('user_id', user.id),
      supabaseAdmin.from('usage_tracking').select('*').eq('user_id', user.id),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      user: userData.data,
      chats: chats.data || [],
      messages: messages.data || [],
      commitments: commitments.data || [],
      reminders: reminders.data || [],
      summaries: summaries.data || [],
      search_history: searchHistory.data || [],
      notification_preferences: preferences.data || null,
      onboarding_progress: onboarding.data || null,
      push_subscriptions: pushSubs.data || [],
      usage_tracking: usage.data || [],
    };

    return apiSuccess(exportData);
  } catch (err) {
    console.error('[Account Export] Error:', err);
    return apiError('Failed to export account data', 500);
  }
});

// DELETE: Delete all user data (GDPR right to erasure)
export const DELETE = withAuth(async (req: NextRequest, { user }) => {
  const body = await req.json().catch(() => ({}));
  const { confirm } = body;

  if (confirm !== 'DELETE_MY_ACCOUNT') {
    return apiError(
      'Please confirm deletion by sending { "confirm": "DELETE_MY_ACCOUNT" }',
      400
    );
  }

  try {
    // Delete in dependency order (children first)
    // 1. Message embeddings (depend on messages)
    await supabaseAdmin
      .from('message_embeddings')
      .delete()
      .eq('user_id', user.id);

    // 2. Messages (depend on chats)
    await supabaseAdmin
      .from('messages')
      .delete()
      .eq('user_id', user.id);

    // 3. Chat summaries (depend on chats)
    await supabaseAdmin
      .from('chat_summaries')
      .delete()
      .eq('user_id', user.id);

    // 4. Chats
    await supabaseAdmin
      .from('chats')
      .delete()
      .eq('user_id', user.id);

    // 5. Commitments
    await supabaseAdmin
      .from('commitments')
      .delete()
      .eq('user_id', user.id);

    // 6. Reminders
    await supabaseAdmin
      .from('reminders')
      .delete()
      .eq('user_id', user.id);

    // 7. Search history
    await supabaseAdmin
      .from('search_history')
      .delete()
      .eq('user_id', user.id);

    // 8. Push subscriptions
    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id);

    // 9. Notification preferences
    await supabaseAdmin
      .from('notification_preferences')
      .delete()
      .eq('user_id', user.id);

    // 10. Onboarding progress
    await supabaseAdmin
      .from('onboarding_progress')
      .delete()
      .eq('user_id', user.id);

    // 11. Usage tracking
    await supabaseAdmin
      .from('usage_tracking')
      .delete()
      .eq('user_id', user.id);

    // 12. Daily digests
    await supabaseAdmin
      .from('daily_digests')
      .delete()
      .eq('user_id', user.id);

    // 13. Referrals (as referrer or referred)
    await supabaseAdmin
      .from('referrals')
      .delete()
      .or(`referrer_id.eq.${user.id},referred_id.eq.${user.id}`);

    // 14. Subscriptions
    await supabaseAdmin
      .from('subscriptions')
      .delete()
      .eq('user_id', user.id);

    // 15. WhatsApp bridge connections
    await supabaseAdmin
      .from('whatsapp_connections')
      .delete()
      .eq('user_id', user.id);

    // 16. Finally, delete the user record
    await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', user.id);

    // 17. Delete auth user via Supabase Admin API
    if (user.authId) {
      await supabaseAdmin.auth.admin.deleteUser(user.authId);
    }

    return apiSuccess({ deleted: true, message: 'All account data has been permanently deleted.' });
  } catch (err) {
    console.error('[Account Delete] Error:', err);
    return apiError('Failed to delete account data. Please contact support.', 500);
  }
});
