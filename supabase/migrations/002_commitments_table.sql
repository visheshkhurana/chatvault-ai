-- ============================================================
-- COMMITMENTS TABLE
-- Tracks promises, deadlines, and commitments from conversations
-- ============================================================

CREATE TABLE IF NOT EXISTS commitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    committed_by TEXT NOT NULL CHECK (committed_by IN ('me', 'them', 'mutual')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT text_length CHECK (char_length(text) <= 500)
);

-- ============================================================
-- COMMITMENTS TABLE INDEXES
-- ============================================================

CREATE INDEX idx_commitments_user_id ON commitments(user_id);
CREATE INDEX idx_commitments_chat_id ON commitments(chat_id);
CREATE INDEX idx_commitments_contact_id ON commitments(contact_id);
CREATE INDEX idx_commitments_status ON commitments(status);
CREATE INDEX idx_commitments_due_date ON commitments(due_date NULLS LAST);
CREATE INDEX idx_commitments_priority ON commitments(priority);
CREATE INDEX idx_commitments_user_status ON commitments(user_id, status);
CREATE INDEX idx_commitments_user_due_date ON commitments(user_id, due_date NULLS LAST);

-- ============================================================
-- COMMITMENTS ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY commitments_policy ON commitments
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ============================================================
-- COMMITMENTS UPDATED_AT TRIGGER
-- ============================================================

CREATE TRIGGER update_commitments_updated_at BEFORE UPDATE ON commitments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
