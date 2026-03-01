'use client';

import { Flame } from 'lucide-react';

interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_active_date: string;
  total_active_days: number;
}

interface StreakBadgeProps {
  streak: StreakData | null;
  compact?: boolean;
}

export default function StreakBadge({ streak, compact = false }: StreakBadgeProps) {
  if (!streak || streak.current_streak === 0) return null;

  const milestones = [3, 7, 14, 30, 60, 100];
  const nextMilestone = milestones.find(m => m > streak.current_streak) || streak.current_streak + 10;
  const progress = Math.min((streak.current_streak / nextMilestone) * 100, 100);

  function getFlameColor(days: number): string {
    if (days >= 30) return 'text-red-500';
    if (days >= 14) return 'text-orange-500';
    if (days >= 7) return 'text-yellow-500';
    return 'text-surface-400';
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-100 dark:bg-surface-800" title={`${streak.current_streak} day streak`}>
        <Flame className={`w-3.5 h-3.5 ${getFlameColor(streak.current_streak)}`} />
        <span className="text-xs font-bold text-surface-700 dark:text-surface-300">{streak.current_streak}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 border border-orange-200/50 dark:border-orange-800/30">
      <div className="flex items-center gap-1.5">
        <Flame className={`w-5 h-5 ${getFlameColor(streak.current_streak)}`} />
        <span className="text-sm font-bold text-surface-900 dark:text-surface-100">{streak.current_streak}</span>
        <span className="text-xs text-surface-500">day streak</span>
      </div>
      <div className="flex-1 h-1.5 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-orange-400 to-yellow-400 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[10px] text-surface-400 whitespace-nowrap">{nextMilestone} day goal</span>
    </div>
  );
}
