// Phase 2: Feature usage tracking & PMF instrumentation
// Lightweight client-side analytics that logs to Supabase feature_events table

import { supabase } from './supabase';

let sessionId: string | null = null;

function getSessionId(): string {
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  return sessionId;
}

interface TrackEventOptions {
  category?: string;
  data?: Record<string, unknown>;
}

// Fire-and-forget event tracking; never blocks UI.
export function trackEvent(eventName: string, options: TrackEventOptions = {}) {
  const { category = 'feature', data = {} } = options;

  void (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.from('feature_events').insert({
        user_id: session.user.id,
        event_name: eventName,
        event_category: category,
        event_data: data,
        session_id: getSessionId(),
      });
    } catch {
      // Silently fail; analytics should never break the app.
    }
  })();
}

export function trackPageView(tabName: string) {
  trackEvent('page_view', { category: 'navigation', data: { tab: tabName } });
}

export function trackFeatureUse(feature: string, action = 'open') {
  trackEvent(`feature_${action}`, { category: 'feature', data: { feature } });
}

export function trackSearch(query: string, resultCount: number) {
  trackEvent('search', {
    category: 'engagement',
    data: { query_length: query.length, result_count: resultCount },
  });
}

export function trackBridgeEvent(status: string) {
  trackEvent('bridge_status', { category: 'connection', data: { status } });
}

export function trackAssistantQuery(queryLength: number, responseTime: number) {
  trackEvent('assistant_query', {
    category: 'ai',
    data: { query_length: queryLength, response_time_ms: responseTime },
  });
}

export function trackActivation(milestone: string) {
  trackEvent('activation_milestone', { category: 'activation', data: { milestone } });
}

export async function updateStreak() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('engagement_streaks')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('streak_type', 'daily_login')
      .single();

    if (!existing) {
      await supabase.from('engagement_streaks').insert({
        user_id: session.user.id,
        streak_type: 'daily_login',
        current_streak: 1,
        longest_streak: 1,
        last_activity_date: today,
      });
      return;
    }

    const lastDate = existing.last_activity_date;
    if (lastDate === today) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const newStreak = lastDate === yesterdayStr ? existing.current_streak + 1 : 1;
    const longestStreak = Math.max(newStreak, existing.longest_streak);

    await supabase
      .from('engagement_streaks')
      .update({
        current_streak: newStreak,
        longest_streak: longestStreak,
        last_activity_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (newStreak === 3) trackActivation('streak_3_days');
    if (newStreak === 7) trackActivation('streak_7_days');
    if (newStreak === 30) trackActivation('streak_30_days');
  } catch {
    // Silent fail
  }
}

export async function updateLastActive() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    await supabase
      .from('users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', session.user.id);
  } catch {
    // Silent fail
  }
}
