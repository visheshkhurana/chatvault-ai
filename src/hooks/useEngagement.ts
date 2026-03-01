'use client';

import { useState, useEffect, useCallback } from 'react';

interface StreakData {
    current_streak: number;
    longest_streak: number;
    last_active_date: string;
    total_active_days: number;
}

interface EngagementState {
    streak: StreakData | null;
    daysActive: number;
    showFeedback: boolean;
    loading: boolean;
}

export function useEngagement() {
    const [state, setState] = useState<EngagementState>({
          streak: null,
          daysActive: 0,
          showFeedback: false,
          loading: true,
    });

  // Fetch streak data on mount (also updates streak server-side)
  useEffect(() => {
        async function initEngagement() {
                try {
                          const res = await fetch('/api/streaks');
                          const json = await res.json();
                          if (json.success && json.data) {
                                      const streakData = json.data as StreakData;
                                      setState(prev => ({
                                                    ...prev,
                                                    streak: streakData,
                                                    daysActive: streakData.total_active_days,
                                                    showFeedback: streakData.total_active_days >= 3,
                                                    loading: false,
                                      }));
                          } else {
                                      setState(prev => ({ ...prev, loading: false }));
                          }
                } catch (e) {
                          console.error('Failed to fetch engagement data:', e);
                          setState(prev => ({ ...prev, loading: false }));
                }
        }
        initEngagement();
  }, []);

  // Track feature usage events
  const trackEvent = useCallback(async (eventName: string, category?: string, metadata?: Record<string, unknown>) => {
        try {
                await fetch('/api/feature-events', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                                      event_name: eventName,
                                      event_category: category || 'general',
                                      metadata,
                          }),
                });
        } catch (e) {
                // Silent fail — analytics should never break UX
        }
  }, []);

  // Track page/tab view
  const trackPageView = useCallback((tabName: string) => {
        trackEvent('page_view', 'navigation', { tab: tabName });
  }, [trackEvent]);

  // Dismiss feedback prompt
  const dismissFeedback = useCallback(() => {
        setState(prev => ({ ...prev, showFeedback: false }));
  }, []);

  return {
        streak: state.streak,
        daysActive: state.daysActive,
        showFeedback: state.showFeedback,
        loading: state.loading,
        trackEvent,
        trackPageView,
        dismissFeedback,
  };
}
