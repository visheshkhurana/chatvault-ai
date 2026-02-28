-- Migration: 005_market_readiness.sql
-- Description: Tables for billing, referrals, push notifications, onboarding, daily digests
-- Created: 2026-02-28

-- ============================================================================
-- TABLE: subscriptions — Stripe billing / tier management
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'trialing')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT subscriptions_user_unique UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

DROP TRIGGER IF EXISTS subscriptions_updated_at_trigger ON subscriptions;
CREATE TRIGGER subscriptions_updated_at_trigger
BEFORE UPDATE ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: usage_tracking — daily search/action counts for free tier limits
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    search_count INTEGER DEFAULT 0,
    summary_count INTEGER DEFAULT 0,
    assistant_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT usage_tracking_user_date_unique UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_date ON usage_tracking(user_id, date);

-- ============================================================================
-- TABLE: referrals — referral tracking for growth
-- ============================================================================

CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_email TEXT NOT NULL,
    referred_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'activated', 'rewarded')),
    referral_code TEXT NOT NULL,
    reward_type TEXT DEFAULT 'pro_days' CHECK (reward_type IN ('pro_days', 'credit')),
    reward_amount INTEGER DEFAULT 7, -- 7 days of Pro for each referral
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT referrals_email_unique UNIQUE(referred_email)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_user ON referrals(referred_user_id);

DROP TRIGGER IF EXISTS referrals_updated_at_trigger ON referrals;
CREATE TRIGGER referrals_updated_at_trigger
BEFORE UPDATE ON referrals
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: push_subscriptions — Web Push notification endpoints
-- ============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT push_subscriptions_endpoint_unique UNIQUE(endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ============================================================================
-- TABLE: onboarding_progress — track user onboarding steps
-- ============================================================================

CREATE TABLE IF NOT EXISTS onboarding_progress (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    completed BOOLEAN DEFAULT false,
    current_step INTEGER DEFAULT 0,
    steps_completed JSONB DEFAULT '[]',
    whatsapp_connected BOOLEAN DEFAULT false,
    first_search_done BOOLEAN DEFAULT false,
    first_commitment_viewed BOOLEAN DEFAULT false,
    first_summary_viewed BOOLEAN DEFAULT false,
    skipped BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS onboarding_progress_updated_at_trigger ON onboarding_progress;
CREATE TRIGGER onboarding_progress_updated_at_trigger
BEFORE UPDATE ON onboarding_progress
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: daily_digests — track sent daily digests to avoid duplicates
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_digests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    digest_date DATE NOT NULL,
    digest_type TEXT NOT NULL DEFAULT 'morning' CHECK (digest_type IN ('morning', 'evening', 'weekly')),
    content_json JSONB,
    sent_via TEXT DEFAULT 'whatsapp' CHECK (sent_via IN ('whatsapp', 'push', 'email')),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT daily_digests_user_date_type_unique UNIQUE(user_id, digest_date, digest_type)
);

CREATE INDEX IF NOT EXISTS idx_daily_digests_user_date ON daily_digests(user_id, digest_date);

-- ============================================================================
-- ALTER TABLE: users — add referral_code and onboarding flag
-- ============================================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';

-- ============================================================================
-- ALTER TABLE: reminders — add proactive fields
-- ============================================================================

ALTER TABLE reminders
ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'time',
ADD COLUMN IF NOT EXISTS condition_json JSONB,
ADD COLUMN IF NOT EXISTS recurrence_rule TEXT,
ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS context_summary TEXT,
ADD COLUMN IF NOT EXISTS contact_wa_id TEXT,
ADD COLUMN IF NOT EXISTS commitment_id UUID REFERENCES commitments(id) ON DELETE SET NULL;

-- ============================================================================
-- ALTER TABLE: notification_preferences — add push + digest prefs
-- ============================================================================

ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS morning_digest BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS digest_time TEXT DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS proactive_reminders BOOLEAN DEFAULT true;

-- ============================================================================
-- ALTER TABLE: commitments — add proactive reminder tracking
-- ============================================================================

ALTER TABLE commitments
ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS overdue_notified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- ============================================================================
-- ALTER TABLE: chats — add group intelligence fields
-- ============================================================================

ALTER TABLE chats
ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS group_summary TEXT,
ADD COLUMN IF NOT EXISTS group_activity_score FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS top_contributors JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS last_summarized_at TIMESTAMPTZ;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_digests ENABLE ROW LEVEL SECURITY;

-- subscriptions
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON subscriptions;
CREATE POLICY "Users can view their own subscriptions" ON subscriptions FOR SELECT USING (auth.uid() IN (SELECT auth_id FROM users WHERE id = user_id));
DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON subscriptions;
CREATE POLICY "Users can manage their own subscriptions" ON subscriptions FOR ALL USING (auth.uid() IN (SELECT auth_id FROM users WHERE id = user_id));

-- usage_tracking
DROP POLICY IF EXISTS "Users can view their own usage" ON usage_tracking;
CREATE POLICY "Users can view their own usage" ON usage_tracking FOR SELECT USING (auth.uid() IN (SELECT auth_id FROM users WHERE id = user_id));
DROP POLICY IF EXISTS "Users can manage their own usage" ON usage_tracking;
CREATE POLICY "Users can manage their own usage" ON usage_tracking FOR ALL USING (auth.uid() IN (SELECT auth_id FROM users WHERE id = user_id));

-- referrals
DROP POLICY IF EXISTS "Users can view their own referrals" ON referrals;
CREATE POLICY "Users can view their own referrals" ON referrals FOR SELECT USING (auth.uid() IN (SELECT auth_id FROM users WHERE id = referrer_id));
DROP POLICY IF EXISTS "Users can create referrals" ON referrals;
CREATE POLICY "Users can create referrals" ON referrals FOR INSERT WITH CHECK (auth.uid() IN (SELECT auth_id FROM users WHERE id = referrer_id));

-- push_subscriptions
DROP POLICY IF EXISTS "Users can manage their push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can manage their push subscriptions" ON push_subscriptions FOR ALL USING (auth.uid() IN (SELECT auth_id FROM users WHERE id = user_id));

-- onboarding_progress
DROP POLICY IF EXISTS "Users can manage their onboarding" ON onboarding_progress;
CREATE POLICY "Users can manage their onboarding" ON onboarding_progress FOR ALL USING (auth.uid() IN (SELECT auth_id FROM users WHERE id = user_id));

-- daily_digests
DROP POLICY IF EXISTS "Users can view their digests" ON daily_digests;
CREATE POLICY "Users can view their digests" ON daily_digests FOR SELECT USING (auth.uid() IN (SELECT auth_id FROM users WHERE id = user_id));

-- ============================================================================
-- FUNCTION: increment_usage — atomically increment daily usage counters
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_usage(
    p_user_id UUID,
    p_field TEXT DEFAULT 'search_count'
)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    current_count INTEGER;
BEGIN
    INSERT INTO usage_tracking (user_id, date)
    VALUES (p_user_id, CURRENT_DATE)
    ON CONFLICT (user_id, date) DO NOTHING;

    IF p_field = 'search_count' THEN
        UPDATE usage_tracking SET search_count = search_count + 1
        WHERE user_id = p_user_id AND date = CURRENT_DATE
        RETURNING search_count INTO current_count;
    ELSIF p_field = 'summary_count' THEN
        UPDATE usage_tracking SET summary_count = summary_count + 1
        WHERE user_id = p_user_id AND date = CURRENT_DATE
        RETURNING summary_count INTO current_count;
    ELSIF p_field = 'assistant_count' THEN
        UPDATE usage_tracking SET assistant_count = assistant_count + 1
        WHERE user_id = p_user_id AND date = CURRENT_DATE
        RETURNING assistant_count INTO current_count;
    END IF;

    RETURN current_count;
END;
$$;

-- ============================================================================
-- FUNCTION: generate_referral_code — unique 8-char alphanumeric
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    code TEXT;
    exists_count INTEGER;
BEGIN
    LOOP
        code := upper(substring(md5(random()::text) from 1 for 8));
        SELECT count(*) INTO exists_count FROM users WHERE referral_code = code;
        EXIT WHEN exists_count = 0;
    END LOOP;
    RETURN code;
END;
$$;

-- Auto-generate referral codes for users that don't have one
UPDATE users SET referral_code = generate_referral_code() WHERE referral_code IS NULL;
