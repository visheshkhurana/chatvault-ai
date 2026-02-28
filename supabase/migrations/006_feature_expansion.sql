-- ============================================================
-- Migration 006: Feature Expansion — 16 New Features
-- ============================================================
-- Adds tables and columns for:
-- Tier 1: Morning Briefing, Multilingual, This Day, Relationship Intel,
--         Voice Transcription, WhatsApp Bot Commands
-- Tier 2: Proactive Alerts, Multi-Platform, Response Suggestions,
--         Shared Spaces, Weekly Recap, Birthday Reminders, Knowledge Base
-- Tier 3: Wearable Audio, Agentic Tasks, Emotional Intelligence
-- ============================================================

-- =====================
-- 1. MEMORY HIGHLIGHTS (This Day in Your Chats)
-- =====================
CREATE TABLE IF NOT EXISTS memory_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  highlight_date DATE NOT NULL,
  original_date DATE NOT NULL,
  message_id UUID REFERENCES messages(id),
  chat_id UUID REFERENCES chats(id),
  snippet TEXT NOT NULL,
  sender_name TEXT,
  highlight_type TEXT DEFAULT 'this_day' CHECK (highlight_type IN ('this_day', 'milestone', 'memory', 'anniversary')),
  years_ago INTEGER,
  viewed BOOLEAN DEFAULT false,
  dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_highlights_user_date ON memory_highlights(user_id, highlight_date);
CREATE INDEX idx_memory_highlights_original ON memory_highlights(user_id, original_date);

-- =====================
-- 2. CONTACT INSIGHTS (Relationship Intelligence)
-- =====================
CREATE TABLE IF NOT EXISTS contact_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  -- Relationship metrics
  total_messages INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  avg_response_time_minutes FLOAT,
  -- Frequency analysis
  daily_avg_messages FLOAT DEFAULT 0,
  weekly_trend TEXT DEFAULT 'stable' CHECK (weekly_trend IN ('increasing', 'stable', 'decreasing', 'inactive')),
  last_interaction_days INTEGER DEFAULT 0,
  -- Topics and sentiment
  top_topics JSONB DEFAULT '[]',
  overall_sentiment TEXT DEFAULT 'neutral' CHECK (overall_sentiment IN ('very_positive', 'positive', 'neutral', 'negative', 'very_negative')),
  sentiment_trend TEXT DEFAULT 'stable',
  -- Relationship health
  relationship_score INTEGER DEFAULT 50 CHECK (relationship_score BETWEEN 0 AND 100),
  needs_attention BOOLEAN DEFAULT false,
  attention_reason TEXT,
  -- Pending items
  pending_commitments_count INTEGER DEFAULT 0,
  -- Metadata
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, contact_phone)
);

CREATE INDEX idx_contact_insights_user ON contact_insights(user_id);
CREATE INDEX idx_contact_insights_attention ON contact_insights(user_id, needs_attention) WHERE needs_attention = true;

-- =====================
-- 3. VOICE TRANSCRIPTIONS
-- =====================
CREATE TABLE IF NOT EXISTS voice_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id),
  attachment_id UUID REFERENCES attachments(id),
  chat_id UUID REFERENCES chats(id),
  -- Transcription data
  transcription TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  duration_seconds FLOAT,
  confidence FLOAT,
  -- Processing
  model_used TEXT DEFAULT 'whisper-1',
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  -- Embedding flag
  embedded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_voice_transcriptions_user ON voice_transcriptions(user_id);
CREATE INDEX idx_voice_transcriptions_message ON voice_transcriptions(message_id);
CREATE INDEX idx_voice_transcriptions_search ON voice_transcriptions USING gin(to_tsvector('english', transcription));

-- =====================
-- 4. BOT COMMANDS LOG
-- =====================
CREATE TABLE IF NOT EXISTS bot_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  raw_input TEXT NOT NULL,
  intent TEXT,
  response TEXT,
  execution_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bot_commands_user ON bot_commands(user_id, created_at DESC);

-- =====================
-- 5. PROACTIVE ALERTS
-- =====================
CREATE TABLE IF NOT EXISTS proactive_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'context_reminder', 'follow_up', 'topic_mention',
    'commitment_due', 'relationship_nudge', 'birthday',
    'anniversary', 'inactivity', 'sentiment_change'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  context_data JSONB DEFAULT '{}',
  -- Targeting
  related_contact TEXT,
  related_chat_id UUID REFERENCES chats(id),
  related_message_id UUID REFERENCES messages(id),
  -- State
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'read', 'dismissed', 'acted_on')),
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  acted_at TIMESTAMPTZ,
  -- Scheduling
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proactive_alerts_user_status ON proactive_alerts(user_id, status, scheduled_for);
CREATE INDEX idx_proactive_alerts_pending ON proactive_alerts(user_id, status) WHERE status = 'pending';

-- =====================
-- 6. PLATFORM CONNECTIONS (Multi-Platform Sync)
-- =====================
CREATE TABLE IF NOT EXISTS platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram', 'signal', 'sms', 'imessage')),
  platform_user_id TEXT,
  display_name TEXT,
  phone_number TEXT,
  auth_token TEXT, -- encrypted in production
  connection_status TEXT DEFAULT 'pending' CHECK (connection_status IN ('pending', 'active', 'disconnected', 'error')),
  last_sync_at TIMESTAMPTZ,
  messages_synced INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

CREATE INDEX idx_platform_connections_user ON platform_connections(user_id, platform);

-- =====================
-- 7. RESPONSE SUGGESTIONS
-- =====================
CREATE TABLE IF NOT EXISTS response_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES chats(id),
  message_id UUID REFERENCES messages(id),
  -- The suggestion
  suggestion_text TEXT NOT NULL,
  tone TEXT DEFAULT 'casual' CHECK (tone IN ('casual', 'formal', 'friendly', 'professional', 'empathetic')),
  context_summary TEXT,
  -- State
  used BOOLEAN DEFAULT false,
  dismissed BOOLEAN DEFAULT false,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_response_suggestions_user ON response_suggestions(user_id, created_at DESC);

-- =====================
-- 8. SHARED SPACES (Family/Team Memory)
-- =====================
CREATE TABLE IF NOT EXISTS shared_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  space_type TEXT DEFAULT 'family' CHECK (space_type IN ('family', 'team', 'couple', 'friends', 'custom')),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  settings JSONB DEFAULT '{"search_shared": true, "commitments_shared": true, "summaries_shared": true}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_space_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES shared_spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(space_id, user_id)
);

CREATE TABLE IF NOT EXISTS shared_space_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES shared_spaces(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES users(id),
  item_type TEXT NOT NULL CHECK (item_type IN ('message', 'commitment', 'summary', 'note', 'link')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shared_spaces_owner ON shared_spaces(owner_id);
CREATE INDEX idx_shared_space_members_user ON shared_space_members(user_id);
CREATE INDEX idx_shared_space_items_space ON shared_space_items(space_id, created_at DESC);

-- =====================
-- 9. WEEKLY RECAPS
-- =====================
CREATE TABLE IF NOT EXISTS weekly_recaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  -- Stats
  total_messages INTEGER DEFAULT 0,
  total_chats_active INTEGER DEFAULT 0,
  commitments_made INTEGER DEFAULT 0,
  commitments_completed INTEGER DEFAULT 0,
  -- AI-generated content
  summary TEXT,
  highlights JSONB DEFAULT '[]',
  top_contacts JSONB DEFAULT '[]',
  key_topics JSONB DEFAULT '[]',
  mood_summary TEXT,
  -- Delivery
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  sent_via TEXT,
  -- Shareable
  share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  share_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

CREATE INDEX idx_weekly_recaps_user ON weekly_recaps(user_id, week_start DESC);

-- =====================
-- 10. BIRTHDAY & ANNIVERSARY TRACKING
-- =====================
CREATE TABLE IF NOT EXISTS special_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_phone TEXT,
  contact_name TEXT NOT NULL,
  date_type TEXT NOT NULL CHECK (date_type IN ('birthday', 'anniversary', 'custom')),
  date_value DATE NOT NULL, -- month/day stored as date, year may be 1900 if unknown
  year_known BOOLEAN DEFAULT false,
  -- Auto-detected vs manual
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'auto_detected', 'imported')),
  source_message_id UUID REFERENCES messages(id),
  -- Reminder settings
  reminder_days_before INTEGER DEFAULT 1,
  reminder_enabled BOOLEAN DEFAULT true,
  last_reminded_at TIMESTAMPTZ,
  -- Suggested message
  suggested_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, contact_name, date_type)
);

CREATE INDEX idx_special_dates_user ON special_dates(user_id);
CREATE INDEX idx_special_dates_upcoming ON special_dates(user_id, date_value);

-- =====================
-- 11. KNOWLEDGE BASE / PERSONAL WIKI
-- =====================
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Categorization
  category TEXT NOT NULL CHECK (category IN (
    'recipe', 'recommendation', 'address', 'contact_info', 'link',
    'tip', 'review', 'quote', 'idea', 'note', 'other'
  )),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags JSONB DEFAULT '[]',
  -- Source tracking
  source_message_id UUID REFERENCES messages(id),
  source_chat_id UUID REFERENCES chats(id),
  source_contact TEXT,
  extracted_at TIMESTAMPTZ,
  -- State
  auto_extracted BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  pinned BOOLEAN DEFAULT false,
  archived BOOLEAN DEFAULT false,
  -- Search
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_entries_user ON knowledge_entries(user_id, category);
CREATE INDEX idx_knowledge_entries_tags ON knowledge_entries USING gin(tags);
CREATE INDEX idx_knowledge_entries_search ON knowledge_entries USING gin(to_tsvector('english', title || ' ' || content));

-- =====================
-- 12. WEARABLE/AUDIO CAPTURE SESSIONS
-- =====================
CREATE TABLE IF NOT EXISTS audio_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Session info
  capture_type TEXT DEFAULT 'wearable' CHECK (capture_type IN ('wearable', 'phone_mic', 'meeting', 'voice_memo')),
  title TEXT,
  duration_seconds FLOAT,
  -- Audio storage
  audio_url TEXT,
  audio_size_bytes BIGINT,
  -- Transcription
  transcription TEXT,
  transcription_status TEXT DEFAULT 'pending' CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed')),
  -- AI analysis
  summary TEXT,
  action_items JSONB DEFAULT '[]',
  participants JSONB DEFAULT '[]',
  key_topics JSONB DEFAULT '[]',
  -- Metadata
  location TEXT,
  device_info JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_audio_captures_user ON audio_captures(user_id, created_at DESC);

-- =====================
-- 13. AGENTIC TASKS
-- =====================
CREATE TABLE IF NOT EXISTS agentic_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Task definition
  task_type TEXT NOT NULL CHECK (task_type IN (
    'send_message', 'set_reminder', 'book_calendar', 'create_note',
    'summarize_chat', 'follow_up', 'research', 'custom'
  )),
  description TEXT NOT NULL,
  parameters JSONB DEFAULT '{}',
  -- Execution
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'running', 'completed', 'failed', 'cancelled')),
  requires_approval BOOLEAN DEFAULT true,
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB DEFAULT '{}',
  error_message TEXT,
  -- Source
  triggered_by TEXT DEFAULT 'user' CHECK (triggered_by IN ('user', 'ai_suggestion', 'schedule', 'event')),
  source_message_id UUID REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agentic_tasks_user ON agentic_tasks(user_id, status, created_at DESC);

-- =====================
-- 14. EMOTIONAL INTELLIGENCE
-- =====================
CREATE TABLE IF NOT EXISTS emotional_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES chats(id),
  contact_phone TEXT,
  -- Analysis window
  analysis_date DATE NOT NULL,
  period_type TEXT DEFAULT 'daily' CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  -- Emotional metrics
  dominant_emotion TEXT CHECK (dominant_emotion IN (
    'joy', 'sadness', 'anger', 'fear', 'surprise', 'trust', 'anticipation', 'neutral'
  )),
  emotion_scores JSONB DEFAULT '{}',
  sentiment_score FLOAT CHECK (sentiment_score BETWEEN -1 AND 1),
  -- Relationship dynamics
  communication_health TEXT DEFAULT 'healthy' CHECK (communication_health IN (
    'thriving', 'healthy', 'needs_attention', 'concerning', 'critical'
  )),
  tone_indicators JSONB DEFAULT '[]',
  -- Alerts
  alert_triggered BOOLEAN DEFAULT false,
  alert_type TEXT,
  alert_message TEXT,
  -- Metadata
  messages_analyzed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emotional_analysis_user ON emotional_analysis(user_id, analysis_date DESC);
CREATE INDEX idx_emotional_analysis_contact ON emotional_analysis(user_id, contact_phone, analysis_date DESC);

-- =====================
-- ALTER EXISTING TABLES
-- =====================

-- Add language support to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_detect_language BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_time TEXT DEFAULT '07:00';

-- Add language to messages for multilingual indexing
ALTER TABLE messages ADD COLUMN IF NOT EXISTS detected_language TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_voice_note BOOLEAN DEFAULT false;

-- Add platform source to messages and chats
ALTER TABLE messages ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'whatsapp';
ALTER TABLE chats ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'whatsapp';

-- Add emotional score to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sentiment_score FLOAT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS emotion TEXT;

-- Extend notification preferences
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS weekly_recap BOOLEAN DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS birthday_reminders BOOLEAN DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS proactive_alerts BOOLEAN DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS response_suggestions BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS this_day_memories BOOLEAN DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS preferred_digest_time TEXT DEFAULT '07:00';

-- Extend daily_digests for different types
ALTER TABLE daily_digests ADD COLUMN IF NOT EXISTS digest_type TEXT DEFAULT 'morning';
ALTER TABLE daily_digests ADD COLUMN IF NOT EXISTS includes_memories BOOLEAN DEFAULT false;
ALTER TABLE daily_digests ADD COLUMN IF NOT EXISTS includes_birthdays BOOLEAN DEFAULT false;

-- =====================
-- ROW LEVEL SECURITY
-- =====================

-- Enable RLS on all new tables
ALTER TABLE memory_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_space_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_recaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE agentic_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE emotional_analysis ENABLE ROW LEVEL SECURITY;

-- RLS policies (users can only access their own data)
CREATE POLICY "Users own memory_highlights" ON memory_highlights FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own contact_insights" ON contact_insights FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own voice_transcriptions" ON voice_transcriptions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own bot_commands" ON bot_commands FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own proactive_alerts" ON proactive_alerts FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own platform_connections" ON platform_connections FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own response_suggestions" ON response_suggestions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own shared_spaces" ON shared_spaces FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Members access shared_space_members" ON shared_space_members FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Members access shared_space_items" ON shared_space_items FOR ALL
  USING (space_id IN (SELECT space_id FROM shared_space_members WHERE user_id = auth.uid()));
CREATE POLICY "Users own weekly_recaps" ON weekly_recaps FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own special_dates" ON special_dates FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own knowledge_entries" ON knowledge_entries FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own audio_captures" ON audio_captures FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own agentic_tasks" ON agentic_tasks FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own emotional_analysis" ON emotional_analysis FOR ALL USING (user_id = auth.uid());

-- =====================
-- HELPER FUNCTIONS
-- =====================

-- Function to get "this day" memories from past years
CREATE OR REPLACE FUNCTION get_this_day_memories(p_user_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  message_id UUID,
  chat_id UUID,
  chat_title TEXT,
  sender_name TEXT,
  text_content TEXT,
  timestamp TIMESTAMPTZ,
  years_ago INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id AS message_id,
    m.chat_id,
    c.title AS chat_title,
    m.sender_name,
    m.text_content,
    m.timestamp,
    EXTRACT(YEAR FROM p_date)::INTEGER - EXTRACT(YEAR FROM m.timestamp)::INTEGER AS years_ago
  FROM messages m
  JOIN chats c ON m.chat_id = c.id
  WHERE m.user_id = p_user_id
    AND EXTRACT(MONTH FROM m.timestamp) = EXTRACT(MONTH FROM p_date)
    AND EXTRACT(DAY FROM m.timestamp) = EXTRACT(DAY FROM p_date)
    AND EXTRACT(YEAR FROM m.timestamp) < EXTRACT(YEAR FROM p_date)
    AND m.text_content IS NOT NULL
    AND LENGTH(m.text_content) > 20
  ORDER BY m.timestamp DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to analyze contact relationship health
CREATE OR REPLACE FUNCTION calculate_relationship_score(
  p_total_messages INTEGER,
  p_last_interaction_days INTEGER,
  p_avg_response_time FLOAT,
  p_pending_commitments INTEGER
) RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 50;
BEGIN
  -- Message frequency factor (0-25 points)
  IF p_total_messages > 1000 THEN score := score + 25;
  ELSIF p_total_messages > 500 THEN score := score + 20;
  ELSIF p_total_messages > 100 THEN score := score + 15;
  ELSIF p_total_messages > 20 THEN score := score + 10;
  ELSE score := score + 5;
  END IF;

  -- Recency factor (-30 to +15 points)
  IF p_last_interaction_days <= 1 THEN score := score + 15;
  ELSIF p_last_interaction_days <= 7 THEN score := score + 10;
  ELSIF p_last_interaction_days <= 30 THEN score := score + 0;
  ELSIF p_last_interaction_days <= 90 THEN score := score - 10;
  ELSE score := score - 30;
  END IF;

  -- Pending commitments penalty (-10 points per pending)
  score := score - LEAST(p_pending_commitments * 5, 20);

  -- Clamp to 0-100
  RETURN GREATEST(0, LEAST(100, score));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to detect birthdays from messages
CREATE OR REPLACE FUNCTION detect_special_dates_from_text(p_text TEXT)
RETURNS TABLE (date_type TEXT, extracted_date DATE, confidence FLOAT) AS $$
BEGIN
  -- Simple pattern matching for common birthday/anniversary mentions
  -- Real implementation would use LLM, but this catches obvious ones
  IF p_text ~* 'my birthday is|born on|birthday on' THEN
    RETURN QUERY SELECT 'birthday'::TEXT, NULL::DATE, 0.8::FLOAT;
  END IF;
  IF p_text ~* 'our anniversary|wedding anniversary|years together' THEN
    RETURN QUERY SELECT 'anniversary'::TEXT, NULL::DATE, 0.7::FLOAT;
  END IF;
  RETURN;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
