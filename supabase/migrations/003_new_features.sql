-- Migration: 003_new_features.sql
-- Description: Add all tables needed for new features
-- Created: 2026-02-21

-- ============================================================================
-- FUNCTION: updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE: saved_searches
-- ============================================================================

CREATE TABLE IF NOT EXISTS saved_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    query TEXT NOT NULL,
    chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
    date_from TIMESTAMPTZ,
    date_to TIMESTAMPTZ,
    filters JSONB DEFAULT '{}',
    is_smart_collection BOOLEAN DEFAULT false,
    icon TEXT,
    color TEXT,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT saved_searches_name_unique UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON saved_searches(user_id);

-- ============================================================================
-- TABLE: privacy_zones
-- ============================================================================

CREATE TABLE IF NOT EXISTS privacy_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    zone_type TEXT NOT NULL CHECK (zone_type IN ('exclude_from_search', 'exclude_from_summary', 'exclude_all')),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT privacy_zones_scope_unique UNIQUE (
        user_id,
        COALESCE(chat_id, '00000000-0000-0000-0000-000000000000'),
        COALESCE(contact_id, '00000000-0000-0000-0000-000000000000'),
        zone_type
    )
);

CREATE INDEX IF NOT EXISTS idx_privacy_zones_user_id ON privacy_zones(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_zones_chat_id ON privacy_zones(chat_id);
CREATE INDEX IF NOT EXISTS idx_privacy_zones_contact_id ON privacy_zones(contact_id);

-- Create trigger for updated_at on privacy_zones
DROP TRIGGER IF EXISTS privacy_zones_updated_at_trigger ON privacy_zones;
CREATE TRIGGER privacy_zones_updated_at_trigger
BEFORE UPDATE ON privacy_zones
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: notification_preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    daily_summary BOOLEAN DEFAULT true,
    weekly_summary BOOLEAN DEFAULT true,
    commitment_alerts BOOLEAN DEFAULT true,
    summary_time TEXT DEFAULT '09:00',
    summary_timezone TEXT DEFAULT 'UTC',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger for updated_at on notification_preferences
DROP TRIGGER IF EXISTS notification_preferences_updated_at_trigger ON notification_preferences;
CREATE TRIGGER notification_preferences_updated_at_trigger
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: commitments
-- ============================================================================

CREATE TABLE IF NOT EXISTS commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    committed_by TEXT NOT NULL CHECK (committed_by IN ('me', 'them', 'mutual')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commitments_user_id_status ON commitments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_commitments_user_id_due_date ON commitments(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_commitments_chat_id ON commitments(chat_id);
CREATE INDEX IF NOT EXISTS idx_commitments_contact_id ON commitments(contact_id);

-- Create trigger for updated_at on commitments
DROP TRIGGER IF EXISTS commitments_updated_at_trigger ON commitments;
CREATE TRIGGER commitments_updated_at_trigger
BEFORE UPDATE ON commitments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: reminders
-- ============================================================================

CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    due_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user_id_status ON reminders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id_due_at ON reminders(user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_reminders_chat_id ON reminders(chat_id);

-- Create trigger for updated_at on reminders
DROP TRIGGER IF EXISTS reminders_updated_at_trigger ON reminders;
CREATE TRIGGER reminders_updated_at_trigger
BEFORE UPDATE ON reminders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ALTER TABLE: contacts
-- Add new columns if they don't exist
-- ============================================================================

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS nickname TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create trigger for updated_at on contacts (if not already present)
DROP TRIGGER IF EXISTS contacts_updated_at_trigger ON contacts;
CREATE TRIGGER contacts_updated_at_trigger
BEFORE UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ALTER TABLE: users
-- Add new columns if they don't exist
-- ============================================================================

ALTER TABLE auth.users
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS data_retention_days INTEGER DEFAULT 365,
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- saved_searches RLS Policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own saved searches" ON saved_searches;
CREATE POLICY "Users can view their own saved searches"
    ON saved_searches FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own saved searches" ON saved_searches;
CREATE POLICY "Users can create their own saved searches"
    ON saved_searches FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own saved searches" ON saved_searches;
CREATE POLICY "Users can update their own saved searches"
    ON saved_searches FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own saved searches" ON saved_searches;
CREATE POLICY "Users can delete their own saved searches"
    ON saved_searches FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- privacy_zones RLS Policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own privacy zones" ON privacy_zones;
CREATE POLICY "Users can view their own privacy zones"
    ON privacy_zones FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own privacy zones" ON privacy_zones;
CREATE POLICY "Users can create their own privacy zones"
    ON privacy_zones FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own privacy zones" ON privacy_zones;
CREATE POLICY "Users can update their own privacy zones"
    ON privacy_zones FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own privacy zones" ON privacy_zones;
CREATE POLICY "Users can delete their own privacy zones"
    ON privacy_zones FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- notification_preferences RLS Policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own notification preferences" ON notification_preferences;
CREATE POLICY "Users can view their own notification preferences"
    ON notification_preferences FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own notification preferences" ON notification_preferences;
CREATE POLICY "Users can create their own notification preferences"
    ON notification_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notification preferences" ON notification_preferences;
CREATE POLICY "Users can update their own notification preferences"
    ON notification_preferences FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own notification preferences" ON notification_preferences;
CREATE POLICY "Users can delete their own notification preferences"
    ON notification_preferences FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- commitments RLS Policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own commitments" ON commitments;
CREATE POLICY "Users can view their own commitments"
    ON commitments FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own commitments" ON commitments;
CREATE POLICY "Users can create their own commitments"
    ON commitments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own commitments" ON commitments;
CREATE POLICY "Users can update their own commitments"
    ON commitments FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own commitments" ON commitments;
CREATE POLICY "Users can delete their own commitments"
    ON commitments FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- reminders RLS Policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own reminders" ON reminders;
CREATE POLICY "Users can view their own reminders"
    ON reminders FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own reminders" ON reminders;
CREATE POLICY "Users can create their own reminders"
    ON reminders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reminders" ON reminders;
CREATE POLICY "Users can update their own reminders"
    ON reminders FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reminders" ON reminders;
CREATE POLICY "Users can delete their own reminders"
    ON reminders FOR DELETE
    USING (auth.uid() = user_id);
