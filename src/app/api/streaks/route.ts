import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

function apiSuccess(data: unknown, status = 200) {
    return NextResponse.json({ success: true, data }, { status });
}

function apiError(error: string, status: number) {
    return NextResponse.json({ success: false, error }, { status });
}

function createSupabaseRouteClient() {
    const cookieStore = cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => (cookieStore as any).set(name, value, options));
                    } catch {
                        // Route handlers may not always allow cookie mutation.
                    }
                },
            },
        }
    );
}

export async function GET(req: NextRequest) {
    try {
        const supabase = createSupabaseRouteClient();
        const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user?.id) {
        return apiError('unauthorized', 401);
    }

    const userId = session.user.id;
        const today = new Date().toISOString().split('T')[0];

    // Try to get existing streak
    const { data: streak, error: fetchError } = await supabase
        .from('engagement_streaks')
        .select('current_streak, longest_streak, last_active_date, streak_start_date, total_active_days, streak_type, updated_at')
        .eq('user_id', userId)
        .single();

    // Table missing
    if (fetchError?.code === '42P01') {
        console.error('[streaks] Table engagement_streaks does not exist');
        return apiError('service_unavailable', 503);
    }

    // No streak record yet - create one
    if (fetchError?.code === 'PGRST116' || !streak) {
        const { data: newStreak, error: insertError } = await supabase
        .from('engagement_streaks')
        .insert({
            user_id: userId,
            current_streak: 1,
            longest_streak: 1,
            last_active_date: today,
            streak_start_date: today,
            total_active_days: 1,
            streak_type: 'daily',
        })
        .select()
        .single();

        if (insertError) {
            console.error('[streaks] Insert error:', insertError.message);
            return apiError('failed_to_create_streak', 500);
        }

        return apiSuccess(newStreak);
    }

    // Unexpected fetch error
    if (fetchError) {
        console.error('[streaks] Fetch error:', fetchError);
        return apiError('failed_to_fetch_streak', 500);
    }

    // Calculate streak continuation
    const lastActive = new Date(streak.last_active_date);
        const todayDate = new Date(today);
        const diffDays = Math.floor(
            (todayDate.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
            );

    // Already visited today
    if (diffDays === 0) {
        return apiSuccess(streak);
    }

    let newCurrentStreak = streak.current_streak;
        let newLongestStreak = streak.longest_streak;
        let newStreakStart = streak.streak_start_date;

    if (diffDays === 1) {
        // Consecutive day
        newCurrentStreak += 1;
        if (newCurrentStreak > newLongestStreak) {
            newLongestStreak = newCurrentStreak;
        }
    } else {
        // Streak broken
        newCurrentStreak = 1;
        newStreakStart = today;
    }

    const { data: updated, error: updateError } = await supabase
        .from('engagement_streaks')
        .update({
            current_streak: newCurrentStreak,
            longest_streak: newLongestStreak,
            last_active_date: today,
            streak_start_date: newStreakStart,
            total_active_days: streak.total_active_days + 1,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select()
        .single();

    if (updateError) {
        console.error('[streaks] Update error:', updateError.message);
        return apiError('failed_to_update_streak', 500);
    }

    return apiSuccess(updated);
    } catch (err) {
        console.error('[streaks] Unhandled error:', err instanceof Error ? err.message : err);
        return apiError('internal_error', 500);
    }
}
