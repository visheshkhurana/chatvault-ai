// Shared types for dashboard components

export interface SearchResult {
  answer: string;
  citations: Array<{
    messageId: string | null;
    chatId: string;
    text: string;
    similarity: number;
    timestamp?: string;
    senderName?: string;
  }>;
  relatedAttachments: Array<{
    id: string;
    fileName: string;
    fileType: string;
    storageUrl: string;
  }>;
}

export interface BridgeStatus {
  connected: boolean;
  phone?: string;
  name?: string;
}

export interface Chat {
  id: string;
  title: string;
  chat_type: string;
  category: string | null;
  last_message_at: string;
  participant_count: number;
}

export interface Message {
  id: string;
  sender_name: string;
  text_content: string;
  message_type: string;
  timestamp: string;
  chat_id: string;
}

export interface Contact {
  id: string;
  display_name: string;
  wa_id: string;
  message_count: number;
  tags: string[];
  notes: string;
}

export interface Commitment {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'overdue' | 'done';
  due_date: string;
  priority: 'low' | 'medium' | 'high';
  contact_id: string;
}

export interface AnalyticsData {
  total_messages: number;
  active_chats: number;
  top_contact: string;
  message_volume: Array<{ date: string; count: number }>;
  hourly_distribution: Array<{ hour: number; count: number }>;
  top_contacts: Array<{ name: string; count: number }>;
  message_types: Array<{ type: string; count: number }>;
}

export interface SettingsData {
  display_name: string;
  email: string;
  timezone: string;
  daily_summary: boolean;
  weekly_summary: boolean;
  commitment_alerts: boolean;
  privacy_zones: any[];
  data_retention_days: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Template {
  id: string;
  name: string;
  content: string;
  category: string;
  variables: string[];
  use_count: number;
  last_used_at: string;
}

export interface Reminder {
  id: string;
  chat_id: string;
  text: string;
  due_at: string;
  status: string;
  isOverdue?: boolean;
  created_at: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_smart: boolean;
  chat_ids: string[];
  chatCount?: number;
}

// New consolidated navigation - 5 primary tabs + feature tabs + settings
// Old tabs kept as aliases for backward compat
export type TabType =
  | 'home'
  | 'messages'
  | 'actions'
  | 'people'
  | 'assistant'
  | 'settings'
  // Feature expansion tabs
  | 'memories'
  | 'voice-notes'
  | 'knowledge-base'
  | 'contact-insights'
  | 'emotional-insights'
  | 'weekly-recap'
  | 'birthdays'
  | 'shared-spaces'
  | 'platforms'
  | 'response-suggestions'
  | 'agentic-tasks'
    | 'relationships'
  // Legacy tab aliases (mapped to new tabs in page.tsx)
  | 'search'
  | 'chats'
  | 'attachments'
  | 'summaries'
  | 'contacts'
  | 'sentiment'
  | 'labels'
  | 'reminders'
  | 'commitments'
  | 'templates'
  | 'analytics'
  | 'reports'
  | 'referrals'
  | 'files';
