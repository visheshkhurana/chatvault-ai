-- ============================================================
-- Migration 008: Contact Book, Enrichment & Persistent Memory
-- ============================================================

-- ============================================================
-- CONTACT ENRICHMENT TABLE
-- Professional info fetched from LinkedIn/Apollo/Lemlist
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_enrichment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Professional info
  linkedin_url TEXT,
    linkedin_headline TEXT,
    linkedin_summary TEXT,
    company_name TEXT,
    company_domain TEXT,
    job_title TEXT,
    industry TEXT,
    location TEXT,
    profile_photo_url TEXT,

  -- Apollo/Lemlist specific
  apollo_id TEXT,
    lemlist_id TEXT,
    email_addresses TEXT[] DEFAULT '{}',

  -- Enrichment metadata
  source TEXT CHECK (source IN ('linkedin', 'apollo', 'lemlist', 'manual', 'vcard')),
    raw_data JSONB DEFAULT '{}',
    enriched_at TIMESTAMPTZ DEFAULT NOW(),
    confidence_score FLOAT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(contact_id)
  );

-- ============================================================
-- CONTACT PHONE BOOK TABLE
-- Uploaded contact book entries (vCard/CSV)
-- Maps phone numbers to real names before WhatsApp sync
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_phonebook (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,       -- normalized phone number
  full_name TEXT NOT NULL,
    email TEXT,
    company TEXT,
    job_title TEXT,
    source TEXT DEFAULT 'upload' CHECK (source IN ('upload', 'whatsapp_sync', 'manual', 'google_contacts')),
    raw_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, phone_number)
  );

-- ============================================================
-- PERSISTENT MEMORY TABLE
-- Structured notes/facts about contacts for easy search
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Memory content
  category TEXT NOT NULL CHECK (category IN (
      'personal', 'professional', 'preference', 'relationship',
      'health', 'family', 'event', 'note', 'auto_extracted'
    )),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',

  -- Source tracking
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'auto_extracted', 'ai_summary', 'enrichment')),
    source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    confidence FLOAT DEFAULT 1.0,

  -- Embedding for semantic search
  embedding vector(1536),

  -- Metadata
  is_pinned BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

-- ============================================================
-- ADD NEW COLUMNS TO EXISTING CONTACTS TABLE
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_raw TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'none' 
  CHECK (enrichment_status IN ('none', 'pending', 'enriched', 'failed'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contact_enrichment_contact_id ON contact_enrichment(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_enrichment_user_id ON contact_enrichment(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_enrichment_company ON contact_enrichment(company_name);

CREATE INDEX IF NOT EXISTS idx_contact_phonebook_user_id ON contact_phonebook(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_phonebook_phone ON contact_phonebook(user_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_contact_phonebook_name ON contact_phonebook(full_name);

CREATE INDEX IF NOT EXISTS idx_contact_memories_user_id ON contact_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_memories_contact_id ON contact_memories(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_memories_category ON contact_memories(category);
CREATE INDEX IF NOT EXISTS idx_contact_memories_tags ON contact_memories USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_contact_memories_embedding ON contact_memories 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_contact_memories_search ON contact_memories 
  USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')));

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE contact_enrichment ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_phonebook ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_enrichment_policy ON contact_enrichment FOR ALL 
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY contact_phonebook_policy ON contact_phonebook FOR ALL 
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY contact_memories_policy ON contact_memories FOR ALL 
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ============================================================
-- FUNCTION: Match phonebook names to contacts
-- ============================================================
CREATE OR REPLACE FUNCTION sync_phonebook_to_contacts(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update contacts that have matching phone numbers in phonebook
  UPDATE contacts c
  SET 
    display_name = COALESCE(pb.full_name, c.display_name),
    full_name = pb.full_name,
    email = COALESCE(pb.email, c.email),
    company = COALESCE(pb.company, c.company),
    job_title = COALESCE(pb.job_title, c.job_title),
    updated_at = NOW()
  FROM contact_phonebook pb
  WHERE c.user_id = p_user_id
    AND pb.user_id = p_user_id
    AND (
        -- Match by exact phone number
      c.wa_id = pb.phone_number
        -- Match by phone with country code stripped
        OR REGEXP_REPLACE(c.wa_id, '^\+?', '') = REGEXP_REPLACE(pb.phone_number, '^\+?', '')
        -- Match by last 10 digits
      OR RIGHT(REGEXP_REPLACE(c.wa_id, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(pb.phone_number, '\D', '', 'g'), 10)
      )
    AND c.display_name IS DISTINCT FROM pb.full_name;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Also update chat titles where the title is just a phone number
  UPDATE chats ch
  SET title = pb.full_name,
      updated_at = NOW()
  FROM contact_phonebook pb
  WHERE ch.user_id = p_user_id
    AND pb.user_id = p_user_id
    AND ch.chat_type = 'individual'
    AND (
          ch.wa_chat_id = pb.phone_number
          OR RIGHT(REGEXP_REPLACE(ch.wa_chat_id, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(pb.phone_number, '\D', '', 'g'), 10)
        );

  RETURN updated_count;
END;
$$;

-- ============================================================
-- FUNCTION: Search memories semantically
-- ============================================================
CREATE OR REPLACE FUNCTION search_memories(
    p_user_id UUID,
    p_query_embedding vector(1536),
    p_match_count INTEGER DEFAULT 10,
    p_match_threshold FLOAT DEFAULT 0.6,
    p_contact_id UUID DEFAULT NULL,
    p_category TEXT DEFAULT NULL
  )
RETURNS TABLE (
    id UUID,
    title TEXT,
    content TEXT,
    category TEXT,
    contact_id UUID,
    tags TEXT[],
    similarity FLOAT,
    created_at TIMESTAMPTZ
  )
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.title,
    cm.content,
    cm.category,
    cm.contact_id,
    cm.tags,
    1 - (cm.embedding <=> p_query_embedding) AS similarity,
    cm.created_at
  FROM contact_memories cm
  WHERE cm.user_id = p_user_id
    AND cm.is_archived = FALSE
    AND 1 - (cm.embedding <=> p_query_embedding) > p_match_threshold
    AND (p_contact_id IS NULL OR cm.contact_id = p_contact_id)
    AND (p_category IS NULL OR cm.category = p_category)
  ORDER BY similarity DESC
  LIMIT p_match_count;
END;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE TRIGGER update_contact_enrichment_updated_at 
  BEFORE UPDATE ON contact_enrichment 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_contact_phonebook_updated_at 
  BEFORE UPDATE ON contact_phonebook 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_contact_memories_updated_at 
  BEFORE UPDATE ON contact_memories 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
