import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function apiSuccess(data: unknown) {
    return NextResponse.json({ success: true, data });
}

function apiError(message: string, status = 400) {
    return NextResponse.json({ success: false, error: message }, { status });
}

// GET /api/streaks — get or update streak for current user
export async function GET() {
    try {
          const supabase = createRouteHandlerClient({ cookies });
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return apiError('Unauthorized', 401);

      const today = new Date().toISOString().split('T')[0];

      // Get existing streak
      const { data: streak } = await supabase
            .from('engagement_streaks')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

      if (!streak) {
              // First visit — create streak
            const newStreak = {
                      user_id: user.id,
                      current_streak: 1,
                      longest_streak: 1,
                      last_active_date: today,
                      streak_start_date: today,
                      total_active_days: 1,
            };
              const { data, error } = await supabase
                .from('engagement_streaks')
                .upsert(newStreak, { onConflict: 'user_id' })
                .select()
                .single();
              if (error) return apiError('Failed to create streak', 500);

            // Also update users.last_active_at
            await supabase.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', user.id);

            return apiSuccess(data);
      }

      // Calculate streak continuation
      const lastActive = new Date(streak.last_active_date);
          const todayDate = new Date(today);
          const diffDays = Math.floor((todayDate.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
              // Already visited today — return current streak
            return apiSuccess(streak);
      }

      let newCurrentStreak = streak.current_streak;
          let newLongestStreak = streak.longest_streak;
          let newStreakStart = streak.streak_start_date;

      if (diffDays === 1) {
              // Consecutive day — increment streak
            newCurrentStreak += 1;
              if (newCurrentStreak > newLongestStreak) {
                        newLongestStreak = newCurrentStreak;
              }
      } else {
              // Streak broken — reset
            newCurrentStreak = 1;
              newStreakStart = today;
      }

      const { data: updated, error } = await supabase
            .from('engagement_streaks')
            .update({
                      current_streak: newCurrentStreak,
                      longest_streak: newLongestStreak,
                      last_active_date: today,
                      streak_start_date: newStreakStart,
                      total_active_days: streak.total_active_days + 1,
                      updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
            .select()
            .single();

      if (error) return apiError('Failed to update streak', 500);

      // Also update users.last_active_at
      await supabase.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', user.id);

      return apiSuccess(updated);
    } catch (err) {
          return apiError('Failed to process streak', 500);
    }
}
