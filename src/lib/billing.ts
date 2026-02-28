/**
 * Billing utilities: tier limits, usage checking, Stripe helpers
 */

import { supabaseAdmin } from '@/lib/supabase';

// ── Tier Configuration ──────────────────────────────────────────────
export const TIERS = {
  free: {
    name: 'Free',
    price: 0,
    limits: {
      searches_per_day: 10,
      summaries_per_day: 3,
      assistant_per_day: 10,
      history_days: 30,
      max_chats: 5,
    },
  },
  pro: {
    name: 'Pro',
    price: 800, // $8.00 in cents
    priceId: process.env.STRIPE_PRO_PRICE_ID || '',
    limits: {
      searches_per_day: Infinity,
      summaries_per_day: Infinity,
      assistant_per_day: Infinity,
      history_days: Infinity,
      max_chats: Infinity,
    },
  },
} as const;

export type Plan = keyof typeof TIERS;

// ── Get user's current plan ─────────────────────────────────────────
export async function getUserPlan(userId: string): Promise<{
  plan: Plan;
  status: string;
  periodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}> {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .single();

  if (!data || data.status !== 'active') {
    return { plan: 'free', status: 'active' };
  }

  return {
    plan: data.plan as Plan,
    status: data.status,
    periodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
}

// ── Check usage against tier limits ─────────────────────────────────
export type UsageType = 'search_count' | 'summary_count' | 'assistant_count';

export async function checkUsageLimit(
  userId: string,
  usageType: UsageType
): Promise<{ allowed: boolean; current: number; limit: number; plan: Plan }> {
  const { plan } = await getUserPlan(userId);
  const tier = TIERS[plan];

  // Pro users have no limits
  if (plan === 'pro') {
    return { allowed: true, current: 0, limit: Infinity, plan };
  }

  // Get today's usage
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabaseAdmin
    .from('usage_tracking')
    .select(usageType)
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const current = (data as any)?.[usageType] ?? 0;

  const limitMap: Record<UsageType, number> = {
    search_count: tier.limits.searches_per_day,
    summary_count: tier.limits.summaries_per_day,
    assistant_count: tier.limits.assistant_per_day,
  };

  const limit = limitMap[usageType];

  return { allowed: current < limit, current, limit, plan };
}

// ── Increment usage counter ─────────────────────────────────────────
export async function incrementUsage(userId: string, usageType: UsageType): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Upsert with increment
  const { data: existing } = await supabaseAdmin
    .from('usage_tracking')
    .select('id, ' + usageType)
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (existing) {
    await supabaseAdmin
      .from('usage_tracking')
      .update({ [usageType]: ((existing as any)[usageType] ?? 0) + 1 })
      .eq('id', (existing as any).id);
  } else {
    await supabaseAdmin
      .from('usage_tracking')
      .insert({
        user_id: userId,
        date: today,
        [usageType]: 1,
      });
  }
}

// ── Get usage summary for display ───────────────────────────────────
export async function getUsageSummary(userId: string) {
  const { plan } = await getUserPlan(userId);
  const tier = TIERS[plan];
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabaseAdmin
    .from('usage_tracking')
    .select('search_count, summary_count, assistant_count')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  return {
    plan,
    tier: tier.name,
    today: {
      searches: { used: data?.search_count ?? 0, limit: tier.limits.searches_per_day },
      summaries: { used: data?.summary_count ?? 0, limit: tier.limits.summaries_per_day },
      assistant: { used: data?.assistant_count ?? 0, limit: tier.limits.assistant_per_day },
    },
  };
}
