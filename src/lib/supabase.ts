import { createClient } from '@supabase/supabase-js';

// ============================================================
// Supabase Client Configuration
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client-side Supabase client (uses anon key, respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client (uses service role key, bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
          autoRefreshToken: false,
          persistSession: false,
    },
});

// Types for database tables
export interface DbUser {
    id: string;
    auth_id: string;
    phone: string | null;
    display_name: string | null;
    email: string | null;
    timezone: string;
    data_retention_days: number;
    created_at: string;
}

export interface DbContact {
    id: string;
    user_id: string;
    wa_id: string;
    display_name: string | null;
    tags: string[];
    created_at: string;
}

export interface DbChat {
    id: string;
    user_id: string;
    wa_chat_id: string;
    chat_type: 'individual' | 'group';
    title: string | null;
    category: string | null;
    participant_count: number;
    last_message_at: string | null;
    created_at: string;
}

export interface DbMessage {
    id: string;
    user_id: string;
    chat_id: string;
    contact_id: string | null;
    wa_message_id: string | null;
    sender_phone: string | null;
    sender_name: string | null;
    message_type: string;
    text_content: string | null;
    raw_payload: any;
    is_from_me: boolean;
    timestamp: string;
    created_at: string;
}

export interface DbAttachment {
    id: string;
    message_id: string;
    user_id: string;
    file_type: string;
    mime_type: string | null;
    file_name: string | null;
    file_size_bytes: number | null;
    storage_url: string;
    storage_key: string;
    ocr_text: string | null;
    transcript: string | null;
    pdf_text: string | null;
    processed: boolean;
    created_at: string;
}

export interface DbEmbedding {
    id: string;
    user_id: string;
    message_id: string | null;
    attachment_id: string | null;
    chat_id: string;
    chunk_index: number;
    chunk_text: string;
    embedding: number[];
    metadata: any;
    created_at: string;
}

export interface SearchResult {
    id: string;
    chunk_text: string;
    similarity: number;
    message_id: string | null;
    attachment_id: string | null;
    chat_id: string;
    metadata: any;
}
