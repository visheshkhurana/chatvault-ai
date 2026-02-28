/**
 * Daily Digest Cron — Morning commitment summary
 * Runs once daily (e.g., 7:00 AM UTC via Vercel Cron).
 * Sends each user a summary of:
 *  - Pending commitments (up to 5)
 *  - Commitments due today
 *  - Yesterday's unread chat activity
 * Delivery: WhatsApp bridge + Web Push
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import webpush from 'web-push';

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

// Configure web-push VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:support@rememora.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export const runtime = 'nodejs';
export const maxDuration = 60;

async function sendViaBridge(phone: string, message: string): Promise<void> {
  try {
    await fetch(BRIDGE_URL + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message, secret: process.env.CRON_SECRET }),
    });
  } catch (err) {
    console.warn('[Daily Digest] Bridge send failed:', err);
  }
}

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
      url: '/dashboard',
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
    console.warn('[Daily Digest] Push send failed:', err);
  }
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

  try {
    // Get all users with digest preferences enabled (or default to all active users)
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email, phone, display_name')
      .eq('onboarding_completed', true);

    if (!users?.length) {
      return NextResponse.json({ processed: 0 });
    }

    let processed = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Check if user wants digests (notification_preferences)
        const { data: prefs } = await supabaseAdmin
          .from('notification_preferences')
          .select('digest_enabled, push_enabled')
          .eq('user_id', user.id)
          .single();

        // Skip if explicitly disabled
        if (prefs && prefs.digest_enabled === false) continue;

        // Check if digest already sent today
        const { data: existing } = await supabaseAdmin
          .from('daily_digests')
          .select('id')
          .eq('user_id', user.id)
          .eq('digest_date', today)
          .single();

        if (existing) continue; // Already sent today

        // Fetch pending commitments
        const { data: commitments } = await supabaseAdmin
          .from('commitments')
          .select('description, committed_by, due_date, status')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(5);

        // Fetch due-today commitments
        const { data: dueToday } = await supabaseAdmin
          .from('commitments')
          .select('description, committed_by')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .gte('due_date', today + 'T00:00:00')
          .lte('due_date', today + 'T23:59:59');

        // Fetch yesterday's new messages count
        const { count: newMsgCount } = await supabaseAdmin
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('timestamp', yesterday + 'T00:00:00')
          .lt('timestamp', today + 'T00:00:00');

        // Build digest content
        const parts: string[] = [];
        parts.push(`☀️ *Good morning${user.display_name ? ', ' + user.display_name : ''}!*\n`);
        parts.push(`Here's your Rememora daily digest:\n`);

        if (dueToday?.length) {
          parts.push(`⚡ *Due Today (${dueToday.length}):*`);
          dueToday.forEach((c, i) => {
            parts.push(`  ${i + 1}. ${c.description} (by ${c.committed_by || 'you'})`);
          });
          parts.push('');
        }

        if (commitments?.length) {
          parts.push(`📋 *Pending Commitments (${commitments.length}):*`);
          commitments.forEach((c, i) => {
            const due = c.due_date ? ` — due ${new Date(c.due_date).toLocaleDateString()}` : '';
            parts.push(`  ${i + 1}. ${c.description}${due}`);
          });
          parts.push('');
        } else {
          parts.push(`✅ No pending commitments — you're all caught up!\n`);
        }

        if (newMsgCount && newMsgCount > 0) {
          parts.push(`💬 ${newMsgCount} new messages synced yesterday.`);
        }

        parts.push(`\n_Reply "search [topic]" to find anything in your chats._`);

        const digestText = parts.join('\n');

        // Send via WhatsApp bridge if phone available
        if (user.phone) {
          await sendViaBridge(user.phone, digestText);
        }

        // Send push notification (short summary)
        if (prefs?.push_enabled !== false) {
          const pushBody = dueToday?.length
            ? `${dueToday.length} commitment(s) due today. ${commitments?.length || 0} pending total.`
            : `${commitments?.length || 0} pending commitments. ${newMsgCount || 0} new messages synced.`;

          await sendPushNotification(user.id, '☀️ Your Morning Digest', pushBody);
        }

        // Record digest as sent
        await supabaseAdmin.from('daily_digests').insert({
          user_id: user.id,
          digest_date: today,
          content: digestText,
          delivered_via: user.phone ? 'whatsapp' : 'push',
        });

        processed++;
      } catch (err) {
        console.error(`[Daily Digest] Error for user ${user.id}:`, err);
        errors++;
      }
    }

    return NextResponse.json({ processed, errors, total: users.length });
  } catch (err) {
    console.error('[Daily Digest] Fatal error:', err);
    return NextResponse.json({ error: 'Failed to run daily digest' }, { status: 500 });
  }
}
