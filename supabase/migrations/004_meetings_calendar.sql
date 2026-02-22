-- Migration 004: Calendar events, enhanced reminders, Google auth tokens
-- Purpose: Support meeting detection, calendar sync, conditional/recurring reminders

-- ============================================================
-- 1. Calendar Events Table
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  timezone TEXT DEFAULT 'UTC',
  participants JSONB DEFAULT '[]'::jsonb,
  -- Each participant: { "name": "...", "phone": "...", "email": "..." }
  meeting_link TEXT,
  location TEXT,
  google_event_id TEXT,
  conversation_context TEXT,
  -- Snapshot of relevant conversation for pre-meeting briefing
  key_topics TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled', 'rescheduled')),
  reminder_sent BOOLEAN DEFAULT FALSE,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_time
  ON calendar_events(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_events_reminder_pending
  ON calendar_events(user_id, status, reminder_sent, start_time)
  WHERE status = 'confirmed' AND reminder_sent = FALSE;
CREATE INDEX IF NOT EXISTS idx_calendar_events_google
  ON calendar_events(user_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

-- RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_events_user_policy ON calendar_events
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- 2. Enhance Reminders Table — Conditional & Recurring Support
-- ============================================================
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'time'
  CHECK (trigger_type IN ('time', 'conditional', 'recurring'));
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS condition_json JSONB;
-- For conditional: { "type": "no_reply", "contact_wa_id": "...", "chat_id": "...", "wait_hours": 48, "check_after": "ISO" }
-- For recurring:   stored in recurrence_rule instead
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
-- iCal-style: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9"
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS context_summary TEXT;
-- Conversation context at time of reminder creation
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS contact_wa_id TEXT;
-- For conditional reminders: which contact to monitor

-- ============================================================
-- 3. Add Google OAuth Tokens + Bot Mode to Users
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_mode TEXT DEFAULT 'active';

-- ============================================================
-- 4. Intent Log Table — Track classified intents for analytics
-- ============================================================
CREATE TABLE IF NOT EXISTS intent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  raw_message TEXT NOT NULL,
  classified_intent TEXT NOT NULL,
  confidence REAL,
  entities JSONB DEFAULT '{}'::jsonb,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intent_logs_user
  ON intent_logs(user_id, created_at DESC);

ALTER TABLE intent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY intent_logs_user_policy ON intent_logs
  FOR ALL USING (user_id = auth.uid());
