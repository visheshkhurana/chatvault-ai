-- ============================================================
-- ChatVault AI - Database Schema
-- Supabase + pgvector
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- USERS TABLE
-- Stores authenticated users and their preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID UNIQUE NOT NULL,  -- links to supabase auth.users
  phone TEXT UNIQUE,
    display_name TEXT,
    email TEXT,
    avatar_url TEXT,
    timezone TEXT DEFAULT 'UTC',
    data_retention_days INTEGER DEFAULT 365,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

-- ============================================================
-- CONTACTS TABLE
-- WhatsApp contacts extracted from messages
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wa_id TEXT NOT NULL,           -- WhatsApp ID / phone number
  display_name TEXT,
    profile_pic_url TEXT,
    tags TEXT[] DEFAULT '{}',      -- e.g., {'medical', 'family'}
  created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, wa_id)
  );

-- ============================================================
-- CHATS TABLE
-- Individual and group conversations
-- ============================================================
CREATE TABLE IF NOT EXISTS chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wa_chat_id TEXT NOT NULL,
    chat_type TEXT NOT NULL CHECK (chat_type IN ('individual', 'group')),
    title TEXT,
    description TEXT,
    category TEXT CHECK (category IN ('medical', 'financial', 'legal', 'personal', 'work', 'other')),
    participant_count INTEGER DEFAULT 2,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, wa_chat_id)
  );

-- ============================================================
-- MESSAGES TABLE
-- Core message store
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    wa_message_id TEXT,
    sender_phone TEXT,
    sender_name TEXT,
    message_type TEXT NOT NULL CHECK (message_type IN (
      'text', 'image', 'video', 'audio', 'voice', 'document',
      'sticker', 'location', 'contact', 'reaction', 'system'
    )),
    text_content TEXT,
    raw_payload JSONB,
    is_from_me BOOLEAN DEFAULT FALSE,
    is_forwarded BOOLEAN DEFAULT FALSE,
    reply_to_message_id UUID REFERENCES messages(id),
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, wa_message_id)
  );

-- ============================================================
-- ATTACHMENTS TABLE
-- Media files metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_type TEXT NOT NULL CHECK (file_type IN (
      'image', 'video', 'audio', 'voice', 'document', 'sticker'
    )),
    mime_type TEXT,
    file_name TEXT,
    file_size_bytes BIGINT,
    storage_url TEXT NOT NULL,     -- Backblaze B2 / S3 URL
  storage_key TEXT NOT NULL,     -- Object storage key
  thumbnail_url TEXT,
    duration_seconds FLOAT,       -- for audio/video
  width INTEGER,                -- for images/video
  height INTEGER,               -- for images/video
  ocr_text TEXT,                -- extracted text from images
  transcript TEXT,              -- transcription for audio/voice
  pdf_text TEXT,                -- extracted text from PDFs
  metadata JSONB DEFAULT '{}',
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

-- ============================================================
-- EMBEDDINGS TABLE (pgvector)
-- Vector store for semantic search
-- ============================================================
CREATE TABLE IF NOT EXISTS embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    attachment_id UUID REFERENCES attachments(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    chunk_index INTEGER DEFAULT 0,
    chunk_text TEXT NOT NULL,
    embedding vector(1536),       -- OpenAI text-embedding-3-small dimension
  token_count INTEGER,
    metadata JSONB DEFAULT '{}',  -- sender, timestamp, chat title, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
  );

-- ============================================================
-- CHAT SUMMARIES TABLE
-- Periodic group/chat summaries
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    summary_type TEXT NOT NULL CHECK (summary_type IN ('daily', 'weekly', 'custom')),
    summary_text TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    message_count INTEGER,
    key_topics TEXT[],
    action_items JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

-- ============================================================
-- ENTITIES TABLE
-- Extracted named entities from messages
-- ============================================================
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN (
      'person', 'organization', 'date', 'amount', 'diagnosis',
      'medication', 'document_type', 'location', 'phone', 'email'
    )),
    entity_value TEXT NOT NULL,
    confidence FLOAT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

-- ============================================================
-- WEBHOOK LOGS TABLE
-- Raw webhook payloads for debugging
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payload JSONB NOT NULL,
    source TEXT DEFAULT 'whatsapp',
    processed BOOLEAN DEFAULT FALSE,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

-- ============================================================
-- AUDIT LOG TABLE
-- Track all data access and modifications
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

-- ============================================================
-- INDEXES
-- ============================================================

-- Messages indexes
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_messages_type ON messages(message_type);
CREATE INDEX idx_messages_text_search ON messages USING gin(to_tsvector('english', COALESCE(text_content, '')));

-- Attachments indexes
CREATE INDEX idx_attachments_message_id ON attachments(message_id);
CREATE INDEX idx_attachments_user_id ON attachments(user_id);
CREATE INDEX idx_attachments_file_type ON attachments(file_type);
CREATE INDEX idx_attachments_processed ON attachments(processed);

-- Embeddings vector index (IVFFlat for similarity search)
CREATE INDEX idx_embeddings_vector ON embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX idx_embeddings_user_id ON embeddings(user_id);
CREATE INDEX idx_embeddings_chat_id ON embeddings(chat_id);
CREATE INDEX idx_embeddings_message_id ON embeddings(message_id);

-- Contacts indexes
CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_wa_id ON contacts(user_id, wa_id);

-- Chats indexes
CREATE INDEX idx_chats_user_id ON chats(user_id);
CREATE INDEX idx_chats_category ON chats(category);

-- Entities indexes
CREATE INDEX idx_entities_user_id ON entities(user_id);
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_value ON entities(entity_value);

-- Summaries indexes
CREATE INDEX idx_summaries_chat_id ON chat_summaries(chat_id);
CREATE INDEX idx_summaries_period ON chat_summaries(period_start, period_end);

-- Audit log indexes
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY users_policy ON users
  FOR ALL USING (auth_id = auth.uid());

CREATE POLICY contacts_policy ON contacts
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY chats_policy ON chats
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY messages_policy ON messages
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY attachments_policy ON attachments
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY embeddings_policy ON embeddings
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY summaries_policy ON chat_summaries
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY entities_policy ON entities
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY audit_policy ON audit_logs
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function: Vector similarity search
CREATE OR REPLACE FUNCTION search_embeddings(
    p_user_id UUID,
    p_query_embedding vector(1536),
    p_match_count INTEGER DEFAULT 10,
    p_match_threshold FLOAT DEFAULT 0.7,
    p_chat_id UUID DEFAULT NULL,
    p_date_from TIMESTAMPTZ DEFAULT NULL,
    p_date_to TIMESTAMPTZ DEFAULT NULL
  )
RETURNS TABLE (
    id UUID,
    chunk_text TEXT,
    similarity FLOAT,
    message_id UUID,
    attachment_id UUID,
    chat_id UUID,
    metadata JSONB
  ) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.chunk_text,
    1 - (e.embedding <=> p_query_embedding) AS similarity,
    e.message_id,
    e.attachment_id,
    e.chat_id,
    e.metadata
  FROM embeddings e
  WHERE e.user_id = p_user_id
    AND 1 - (e.embedding <=> p_query_embedding) > p_match_threshold
    AND (p_chat_id IS NULL OR e.chat_id = p_chat_id)
    AND (p_date_from IS NULL OR (e.metadata->>'timestamp')::timestamptz >= p_date_from)
    AND (p_date_to IS NULL OR (e.metadata->>'timestamp')::timestamptz <= p_date_to)
  ORDER BY similarity DESC
  LIMIT p_match_count;
END;
$$;

-- Function: Hybrid search (vector + full text)
CREATE OR REPLACE FUNCTION hybrid_search(
    p_user_id UUID,
    p_query_embedding vector(1536),
    p_query_text TEXT,
    p_match_count INTEGER DEFAULT 10,
    p_vector_weight FLOAT DEFAULT 0.7,
    p_text_weight FLOAT DEFAULT 0.3,
    p_chat_id UUID DEFAULT NULL
  )
RETURNS TABLE (
    id UUID,
    chunk_text TEXT,
    combined_score FLOAT,
    vector_score FLOAT,
    text_score FLOAT,
    message_id UUID,
    chat_id UUID,
    metadata JSONB
  ) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
      SELECT
        e.id,
        e.chunk_text,
        1 - (e.embedding <=> p_query_embedding) AS v_score,
        e.message_id,
        e.chat_id,
        e.metadata
      FROM embeddings e
      WHERE e.user_id = p_user_id
        AND (p_chat_id IS NULL OR e.chat_id = p_chat_id)
      ORDER BY e.embedding <=> p_query_embedding
      LIMIT p_match_count * 3
    ),
  text_results AS (
      SELECT
        m.id AS msg_id,
        ts_rank(to_tsvector('english', COALESCE(m.text_content, '')), plainto_tsquery('english', p_query_text)) AS t_score
      FROM messages m
      WHERE m.user_id = p_user_id
        AND to_tsvector('english', COALESCE(m.text_content, '')) @@ plainto_tsquery('english', p_query_text)
        AND (p_chat_id IS NULL OR m.chat_id = p_chat_id)
    )
  SELECT
    vr.id,
    vr.chunk_text,
    (p_vector_weight * vr.v_score + p_text_weight * COALESCE(tr.t_score, 0)) AS combined_score,
    vr.v_score AS vector_score,
    COALESCE(tr.t_score, 0) AS text_score,
    vr.message_id,
    vr.chat_id,
    vr.metadata
  FROM vector_results vr
  LEFT JOIN text_results tr ON vr.message_id = tr.msg_id
  ORDER BY combined_score DESC
  LIMIT p_match_count;
END;
$$;

-- Function: Auto-delete expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Delete messages older than user's retention period
  DELETE FROM messages m
  USING users u
  WHERE m.user_id = u.id
    AND m.timestamp < NOW() - (u.data_retention_days || ' days')::INTERVAL;

  -- Log the cleanup
  INSERT INTO audit_logs (action, resource_type, details)
  VALUES ('auto_cleanup', 'messages', jsonb_build_object('timestamp', NOW()));
END;
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON chats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
