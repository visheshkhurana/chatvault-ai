'use client';
import { useState, useEffect, useCallback } from 'react';

interface StreakData {
    current_streak: number;
    longest_streak: number;
    last_active_date: string;
    streak_start_date: string;
    total_active_days: number;
    streak_type: string;
}

interface EngagementState {
    streak: StreakData | null;
    showFeedback: boolean;
    loading: boolean;
    error: string | null;
}

const DEFAULT_STREAK: StreakData = {
    current_streak: 0,
    longest_streak: 0,
    last_active_date: '',
    streak_start_date: '',
    total_active_days: 0,
    streak_type: 'daily',
};

export function useEngagement() {
    const [state, setState] = useState<EngagementState>({
        streak: null,
        showFeedback: false,
        loading: true,
        error: null,
    });

    const fetchStreak = useCallback(async () => {
        try {
            setState((prev) => ({ ...prev, loading: true, error: null }));

            const res = await fetch('/api/streaks', {
                credentials: 'include',
            });

            if (res.status === 401) {
                setState({ streak: DEFAULT_STREAK, showFeedback: false, loading: false, error: null });
                return;
            }

            if (res.status === 429) {
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: 'Rate limited. Try again later.',
                }));
                return;
            }

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setState({
                    streak: DEFAULT_STREAK,
                    showFeedback: false,
                    loading: false,
                    error: body.error ?? 'Failed to load streak',
                });
                return;
            }

            const body = await res.json();
            if (body.success && body.data) {
                const streakData = body.data as StreakData;
                setState({
                    streak: streakData,
                    showFeedback: streakData.total_active_days >= 3,
                    loading: false,
                    error: null,
                });
                return;
            }

            setState({
                streak: DEFAULT_STREAK,
                showFeedback: false,
                loading: false,
                error: body.error ?? 'Unknown error',
            });
        } catch {
            setState({
                streak: DEFAULT_STREAK,
                showFeedback: false,
                loading: false,
                error: 'Network error',
            });
        }
    }, []);

    const trackEvent = useCallback(
        async (eventName: string, category = 'general', metadata?: Record<string, unknown>) => {
            try {
                await fetch('/api/feature-events', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event_name: eventName,
                        event_category: category,
                        metadata,
                    }),
                });
            } catch {
                // Silent fail; analytics must never block UX.
            }
        },
        []
    );

    const trackPageView = useCallback(
        (tabName: string) => {
            void trackEvent('page_view', 'navigation', { tab: tabName });
        },
        [trackEvent]
    );

    const dismissFeedback = useCallback(() => {
        setState((prev) => ({ ...prev, showFeedback: false }));
    }, []);

    useEffect(() => {
        void fetchStreak();
    }, [fetchStreak]);

    return {
        ...state,
        daysActive: state.streak?.total_active_days ?? 0,
        refetch: fetchStreak,
        trackEvent,
        trackPageView,
        dismissFeedback,
    };
}
