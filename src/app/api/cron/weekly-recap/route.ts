/**
 * Weekly Recap Cron — Sunday evening weekly summary
 * Runs once weekly (e.g., Sunday 6:00 PM UTC via Vercel Cron).
 * Generates weekly recap for each active user.
 * Delivery: WhatsApp bridge + Web Push
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import OpenAI from 'openai';
import webpush from 'web-push';

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
});
const MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

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

async function sendViaBridge(phone: string, message: string): Promise<void> {
  try {
    await fetch(BRIDGE_URL + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message, secret: process.env.CRON_SECRET }),
    });
  } catch (err) {
    console.warn('[Weekly Recap Cron] Bridge send failed:', err);
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
    console.warn('[Weekly Recap Cron] Push send failed:', err);
  }
}

async function generateRecapForUser(userId: string): Promise<string> {
  const weekEnd = new Date();
  const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const weekStartStr = weekStart.toISOString();
  const weekEndStr = weekEnd.toISOString();

  // Get stats
  const { count: messageCount } = await supabaseAdmin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('timestamp', weekStartStr)
    .lt('timestamp', weekEndStr);

  const { data: activeChats } = await supabaseAdmin
    .from('messages')
    .select('chat_id')
    .eq('user_id', userId)
    .gte('timestamp', weekStartStr)
    .lt('timestamp', weekEndStr);

  const uniqueChats = new Set((activeChats || []).map((m) => m.chat_id)).size;

  const { count: commitmentsMade } = await supabaseAdmin
    .from('commitments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', weekStartStr)
    .lt('created_at', weekEndStr);

  const { count: commitmentsCompleted } = await supabaseAdmin
    .from('commitments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', weekStartStr)
    .lt('completed_at', weekEndStr);

  const { data: topContacts } = await supabaseAdmin
    .from('contact_insights')
    .select('contact_name, total_messages')
    .eq('user_id', userId)
    .order('total_messages', { ascending: false })
    .limit(3);

  // Generate summary via LLM
  const prompt = `Create a warm, encouraging weekly recap for a personal CRM app. Statistics:
- Messages: ${messageCount || 0}
- Active chats: ${uniqueChats}
- Commitments made: ${commitmentsMade || 0}
- Commitments completed: ${commitmentsCompleted || 0}
- Top contacts: ${topContacts?.map((c) => c.contact_name).join(', ') || 'none'}

Format as WhatsApp message (max 200 chars). Be warm and motivational.`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
    });

    return response.choices[0]?.message?.content || 'Great week! Keep up the amazing work!';
  } catch (err) {
    console.error('[Weekly Recap Cron] LLM error:', err);
    return `📊 Your weekly recap: ${messageCount || 0} messages, ${uniqueChats} active chats, ${commitmentsCompleted || 0}/${commitmentsMade || 0} commitments completed!`;
  }
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all active users
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
        // Generate recap
        const recapContent = await generateRecapForUser(user.id);

        // Send via WhatsApp bridge if phone available
        if (user.phone) {
          const whatsappMessage = `📊 *Weekly Recap*\n\n${recapContent}\n\n_Reply to dive deeper into specific conversations._`;
          await sendViaBridge(user.phone, whatsappMessage);
        }

        // Send push notification
        await sendPushNotification(
          user.id,
          '📊 Your Weekly Recap',
          recapContent
        );

        // Store recap
        await supabaseAdmin.from('weekly_recaps').insert({
          user_id: user.id,
          week_start: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          week_end: new Date().toISOString(),
          summary_text: recapContent,
          generated_at: new Date().toISOString(),
        });

        processed++;
      } catch (err) {
        console.error(`[Weekly Recap Cron] Error for user ${user.id}:`, err);
        errors++;
      }
    }

    return NextResponse.json({ processed, errors, total: users.length });
  } catch (err) {
    console.error('[Weekly Recap Cron] Fatal error:', err);
    return NextResponse.json({ error: 'Failed to run weekly recap' }, { status: 500 });
  }
}
