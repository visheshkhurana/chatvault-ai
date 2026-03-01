-- Migration 007: Add missing columns to engagement_streaks table
-- These columns are required by /api/streaks route
-- Applied manually via Supabase SQL Editor on 2026-01-03
-- This file tracks the change in version control

ALTER TABLE engagement_streaks ADD COLUMN IF NOT EXISTS last_active_date TEXT;
ALTER TABLE engagement_streaks ADD COLUMN IF NOT EXISTS streak_start_date TEXT;
ALTER TABLE engagement_streaks ADD COLUMN IF NOT EXISTS total_active_days INTEGER DEFAULT 1;

-- Backfill from existing last_activity_date column
UPDATE engagement_streaks SET last_active_date = last_activity_date::text WHERE last_active_date IS NULL AND last_activity_date IS NOT NULL;
UPDATE engagement_streaks SET streak_start_date = last_activity_date::text WHERE streak_start_date IS NULL AND last_activity_date IS NOT NULL;
UPDATE engagement_streaks SET total_active_days = current_streak WHERE total_active_days IS NULL;
