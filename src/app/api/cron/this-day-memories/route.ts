/**
 * This Day Memories Cron — Daily memory notifications
 * Runs once daily (e.g., 9:00 AM UTC via Vercel Cron).
 * For each user, fetches messages from same day in previous years.
 * Creates memory_highlights entries and sends notifications.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import webpush from 'web-push';

// Configure web-push VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:support@rememora.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export const runtime = 'nodejs';
export const maxDuration = 300;

async function sendPushNotification(userId: string, title: string, body: string): Promise<void> {
  try {
    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (!subs?.length) return;

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: '/memories',
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch {
        // Remove invalid subscription
        await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  } catch (err) {
    console.warn('[This Day Memories Cron] Push send failed:', err);
  }
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const currentYear = today.getFullYear();
  const todayStr = `${month}-${day}`;

  try {
    // Get all active users
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, display_name')
      .eq('onboarding_completed', true);

    if (!users?.length) {
      return NextResponse.json({ processed: 0 });
    }

    let processed = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Fetch messages from same month/day in previous 3 years
        const { data: messages, error: msgError } = await supabaseAdmin
          .from('messages')
          .select('id, text_content, timestamp, sender_name, chat_id, chats(title)')
          .eq('user_id', user.id)
          .gte('timestamp', `${currentYear - 3}-01-01T00:00:00`)
          .lt('timestamp', `${currentYear}T00:00:00`);

        if (msgError) {
          console.error(`[This Day Memories] Query error for user ${user.id}:`, msgError);
          errors++;
          continue;
        }

        // Filter to same month/day
        const todayMessages = (messages || []).filter((msg) => {
          const msgDate = new Date(msg.timestamp);
          const msgMonth = String(msgDate.getMonth() + 1).padStart(2, '0');
          const msgDay = String(msgDate.getDate()).padStart(2, '0');
          return msgMonth === month && msgDay === day && msgDate.getFullYear() < currentYear;
        });

        if (todayMessages.length === 0) {
          continue; // No memories for this user
        }

        // Create memory_highlights entries
        for (const msg of todayMessages) {
          const yearsAgo = currentYear - new Date(msg.timestamp).getFullYear();
          await supabaseAdmin.from('memory_highlights').upsert(
            {
              user_id: user.id,
              message_id: msg.id,
              status: 'pending',
              years_ago: yearsAgo,
              created_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,message_id' }
          );
        }

        // Send push notification
        const notificationTitle = `✨ This Day ${todayMessages.length > 1 ? `(${todayMessages.length} memories)` : '(1 memory)'}`;
        const notificationBody = todayMessages
          .slice(0, 2)
          .map((m) => m.text_content?.substring(0, 50) + '...' || 'A message')
          .join(' • ');

        await sendPushNotification(user.id, notificationTitle, notificationBody);

        processed++;
      } catch (err) {
        console.error(`[This Day Memories] Error for user ${user.id}:`, err);
        errors++;
      }
    }

    return NextResponse.json({ processed, errors, total: users.length });
  } catch (err) {
    console.error('[This Day Memories Cron] Fatal error:', err);
    return NextResponse.json({ error: 'Failed to run this day memories' }, { status: 500 });
  }
}
