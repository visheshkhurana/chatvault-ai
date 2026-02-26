'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase, getInternalUserId } from '@/lib/supabase';
import {
  MessageSquare, Search, Paperclip, FileText, Image,
  Film, ChevronRight, ArrowLeft, Download, Clock,
  Filter, X
} from 'lucide-react';

type SubTab = 'conversations' | 'files' | 'search';

interface Chat {
  id: string;
  name: string;
  is_group: boolean;
  last_message_at: string;
  unread_count: number;
}

interface Message {
  id: string;
  chat_id: string;
  sender: string;
  content: string;
  message_type: string;
  created_at: string;
  has_attachment: boolean;
}

interface Attachment {
  id: string;
  message_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  url: string;
  created_at: string;
}

function formatPhone(phone: string): string {
  if (!phone) return 'Unknown';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    const n = cleaned.slice(2);
    return '+91 ' + n.slice(0, 5) + ' ' + n.slice(5);
  }
  if (cleaned.length >= 10) {
    const last10 = cleaned.slice(-10);
    return '+' + cleaned.slice(0, -10) + ' ' + last10.slice(0, 5) + ' ' + last10.slice(5);
  }
  return phone;
}

function timeAgo(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd ago';
  return d.toLocaleDateString();
}

function fileIcon(type: string) {
  if (type?.startsWith('image')) return Image;
  if (type?.startsWith('video')) return Film;
  if (type?.includes('pdf') || type?.includes('document')) return FileText;
  return Paperclip;
}

function fileSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export default function MessagesSection() {
    const [subTab, setSubTab] = useState<SubTab>('conversations');
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileFilter, setFileFilter] = useState<string>('all');

  useEffect(() => {
    loadChats();
    loadAttachments();
  }, []);

  useEffect(() => {
    if (selectedChat) loadMessages(selectedChat);
  }, [selectedChat]);

  async function loadChats() {
    setLoading(true);
    const userId = await getInternalUserId();
    if (!userId) return;
    const { data } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false });
    setChats(data || []);
    setLoading(false);
  }

  async function loadMessages(chatId: string) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(100);
    setMessages(data || []);
  }

  async function loadAttachments() {
    const userId = await getInternalUserId();
    if (!userId) return;
    const { data } = await supabase
      .from('attachments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setAttachments(data || []);
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    const userId = await getInternalUserId();
    if (!userId) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .ilike('content', '%' + searchQuery + '%')
      .order('created_at', { ascending: false })
      .limit(50);
    setSearchResults(data || []);
  }

  const filteredAttachments = useMemo(() => {
    if (fileFilter === 'all') return attachments;
    return attachments.filter(a => {
      if (fileFilter === 'images') return a.file_type?.startsWith('image');
      if (fileFilter === 'videos') return a.file_type?.startsWith('video');
      if (fileFilter === 'documents') return a.file_type?.includes('pdf') || a.file_type?.includes('doc');
      return true;
    });
  }, [attachments, fileFilter]);

  const tabs: { key: SubTab; label: string; icon: typeof MessageSquare }[] = [
    { key: 'conversations', label: 'Conversations', icon: MessageSquare },
    { key: 'files', label: 'Files', icon: Paperclip },
    { key: 'search', label: 'Search', icon: Search },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-6 pt-6 pb-4 border-b border-surface-100">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors '
              + (subTab === t.key
                ? 'bg-brand-50 text-brand-700'
                : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50')}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {subTab === 'conversations' && (
          <div className="h-full flex">
            <div className={'border-r border-surface-100 overflow-y-auto '
              + (selectedChat ? 'hidden md:block md:w-80' : 'w-full md:w-80')}>
              {loading ? (
                <div className="p-8 text-center text-surface-400">Loading conversations...</div>
              ) : chats.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageSquare className="w-12 h-12 text-surface-300 mx-auto mb-3" />
                  <p className="text-surface-500 text-sm">No conversations yet</p>
                  <p className="text-surface-400 text-xs mt-1">Connect WhatsApp to see your chats</p>
                </div>
              ) : (
                chats.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedChat(chat.id)}
                    className={'w-full text-left px-4 py-3 border-b border-surface-50 hover:bg-surface-50 transition-colors '
                      + (selectedChat === chat.id ? 'bg-brand-50' : '')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm flex-shrink-0">
                        {(chat.name || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-surface-900 text-sm truncate">
                            {chat.is_group ? chat.name : formatPhone(chat.name)}
                          </span>
                          <span className="text-xs text-surface-400 flex-shrink-0 ml-2">
                            {chat.last_message_at ? timeAgo(chat.last_message_at) : ''}
                          </span>
                        </div>
                        {chat.unread_count > 0 && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-brand-500 text-white text-xs rounded-full">
                            {chat.unread_count} new
                          </span>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-surface-300 flex-shrink-0" />
                    </div>
                  </button>
                ))
              )}
            </div>

            {selectedChat ? (
              <div className="flex-1 flex flex-col">
                <div className="px-4 py-3 border-b border-surface-100 flex items-center gap-3">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden p-1 hover:bg-surface-100 rounded">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h3 className="font-medium text-surface-900 text-sm">
                    {chats.find(c => c.id === selectedChat)?.name || 'Chat'}
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-center text-surface-400 text-sm py-8">No messages</p>
                  ) : (
                    messages.map(msg => (
                      <div key={msg.id} className="max-w-[80%]">
                        <div className="bg-surface-50 rounded-lg px-3 py-2">
                          <p className="text-xs font-medium text-brand-600 mb-1">{formatPhone(msg.sender)}</p>
                          <p className="text-sm text-surface-800">{msg.content}</p>
                          <p className="text-xs text-surface-400 mt-1">{timeAgo(msg.created_at)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="hidden md:flex flex-1 items-center justify-center text-surface-400">
                <div className="text-center">
                  <MessageSquare className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a conversation to view messages</p>
                </div>
              </div>
            )}
          </div>
        )}

        {subTab === 'files' && (
          <div className="h-full overflow-y-auto">
            <div className="flex items-center gap-2 px-6 py-3 border-b border-surface-100">
              <Filter className="w-4 h-4 text-surface-400" />
              {['all', 'images', 'videos', 'documents'].map(f => (
                <button
                  key={f}
                  onClick={() => setFileFilter(f)}
                  className={'px-3 py-1 rounded-full text-xs font-medium transition-colors '
                    + (fileFilter === f
                      ? 'bg-brand-100 text-brand-700'
                      : 'bg-surface-100 text-surface-600 hover:bg-surface-200')}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            {filteredAttachments.length === 0 ? (
              <div className="p-8 text-center">
                <Paperclip className="w-12 h-12 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-500 text-sm">No files found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-6">
                {filteredAttachments.map(att => {
                  const Icon = fileIcon(att.file_type);
                  return (
                    <div key={att.id} className="border border-surface-100 rounded-lg p-3 hover:shadow-sm transition-shadow group">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-surface-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-surface-900 truncate">{att.file_name}</p>
                          <p className="text-xs text-surface-400 mt-0.5">
                            {fileSize(att.file_size)} {att.created_at ? ' · ' + timeAgo(att.created_at) : ''}
                          </p>
                        </div>
                        {att.url && (
                          <a href={att.url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-surface-100 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Download className="w-4 h-4 text-surface-400" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {subTab === 'search' && (
          <div className="h-full flex flex-col">
            <div className="px-6 py-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  type="text"
                  placeholder="Search across all messages..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                  className="w-full pl-10 pr-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="w-4 h-4 text-surface-400 hover:text-surface-600" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6">
              {searchResults.length === 0 ? (
                <div className="py-12 text-center">
                  <Search className="w-12 h-12 text-surface-300 mx-auto mb-3" />
                  <p className="text-surface-500 text-sm">
                    {searchQuery ? 'No results found' : 'Search your WhatsApp messages'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 pb-6">
                  {searchResults.map(msg => (
                    <div key={msg.id} className="border border-surface-100 rounded-lg p-3 hover:bg-surface-50 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-brand-600">{formatPhone(msg.sender)}</span>
                        <span className="text-xs text-surface-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeAgo(msg.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-surface-800">{msg.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
