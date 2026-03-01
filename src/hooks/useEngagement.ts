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
        // Not logged in - return defaults silently
        setState({ streak: DEFAULT_STREAK, loading: false, error: null });
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
            loading: false,
            error: body.error ?? 'Failed to load streak',
        });
        return;
    }

    const body = await res.json();

    if (body.success && body.data) {
        setState({ streak: body.data, loading: false, error: null });
    } else {
        setState({
            streak: DEFAULT_STREAK,
            loading: false,
            error: body.error ?? 'Unknown error',
        });
    }
    } catch (err) {
        setState({
            streak: DEFAULT_STREAK,
            loading: false,
            error: 'Network error',
        });
    }
}, []);

useEffect(() => {
    fetchStreak();
}, [fetchStreak]);

return {
    ...state,
    refetch: fetchStreak,
};
}
