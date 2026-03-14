'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, getInternalUserId } from '@/lib/supabase';
import {
  MessageSquare, Search, Paperclip, FileText, Image,
  Film, ChevronRight, ArrowLeft, Download, Clock,
  Filter, X, Music, StickyNote, Calendar, User,
  ExternalLink, AlertCircle, Play, Eye, ArrowUpDown,
  FolderOpen, Grid3X3, List, ChevronDown
} from 'lucide-react';
import { formatPhone, getDisplayName, getInitials } from '@/lib/format-contact';

type SubTab = 'conversations' | 'files' | 'search';

interface ChatRow {
  id: string;
  title: string;
  chat_type: string;       // 'individual' | 'group'
  wa_chat_id: string;
  last_message_at: string;
  participant_count: number;
}

interface Chat {
  id: string;
  name: string;
  is_group: boolean;
  last_message_at: string;
  wa_chat_id: string;
}

interface Message {
  id: string;
  chat_id: string;
  sender_name: string | null;
  sender_phone: string | null;
  text_content: string | null;
  message_type: string;
  timestamp: string;
  created_at: string;
  is_from_me: boolean;
}

interface Attachment {
  id: string;
  message_id: string;
  file_name: string;
  file_type: string;  // 'image' | 'video' | 'audio' | 'document' | 'sticker'
  mime_type: string;
  file_size: number;
  file_size_bytes: number;
  storage_key: string | null;
  url: string;
  created_at: string;
  transcript?: string | null;
  messages?: { sender_name: string; timestamp: string; chat_id: string };
}

interface MediaPreviewState {
  attachment: Attachment;
  signedUrl: string | null;
  loading: boolean;
  error: string | null;
}

type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc';
type GroupBy = 'none' | 'type' | 'chat' | 'date';
type ViewMode = 'grid' | 'list';

const FILE_TYPE_ICONS: Record<string, any> = {
  image: Image, video: Film, audio: Music, document: FileText, sticker: StickyNote,
};

const FILE_TYPE_COLORS: Record<string, string> = {
  image: 'bg-blue-50 text-blue-600',
  video: 'bg-violet-50 text-violet-600',
  audio: 'bg-amber-50 text-amber-600',
  document: 'bg-brand-50 text-brand-600',
  sticker: 'bg-rose-50 text-rose-600',
};

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

function avatarColor(name: string): string {
  const colors = [
    'bg-brand-100 text-brand-700',
    'bg-blue-100 text-blue-700',
    'bg-violet-100 text-violet-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
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
  const [fileSortBy, setFileSortBy] = useState<SortOption>('date_desc');
  const [fileGroupBy, setFileGroupBy] = useState<GroupBy>('none');
  const [fileViewMode, setFileViewMode] = useState<ViewMode>('grid');
  const [fileSearch, setFileSearch] = useState('');
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<MediaPreviewState | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);

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

    // For chats whose title is just a phone number, try to resolve a real name
    // from the contacts table (single batch query — no N+1 loops)
    const mapped: Chat[] = [];
    const phoneTitleChats: { index: number; waJid: string }[] = [];

    for (const row of (data || [])) {
      const title = row.title || row.wa_chat_id || '';
      const isPhoneTitle = /^\d{7,}$/.test(title.replace(/\D/g, ''));
      mapped.push({
        id: row.id,
        name: title,
        is_group: row.chat_type === 'group',
        last_message_at: row.last_message_at,
        wa_chat_id: row.wa_chat_id || '',
      });
      if (isPhoneTitle && row.chat_type !== 'group') {
        phoneTitleChats.push({ index: mapped.length - 1, waJid: row.wa_chat_id || '' });
      }
    }

    // Batch-resolve names from contacts table (single query)
    if (phoneTitleChats.length > 0) {
      const waJids = phoneTitleChats.map(c => c.waJid).filter(Boolean);
      if (waJids.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('wa_id, display_name')
          .eq('user_id', userId)
          .in('wa_id', waJids);

        const contactMap = new Map<string, string>();
        for (const c of (contacts || [])) {
          const dn = c.display_name || '';
          const isRealName = dn && !/^\d{7,}$/.test(dn.replace(/\D/g, ''));
          if (isRealName) contactMap.set(c.wa_id, dn);
        }

        for (const pc of phoneTitleChats) {
          const name = contactMap.get(pc.waJid);
          if (name) mapped[pc.index].name = name;
        }
      }
    }

    setChats(mapped);
    setLoading(false);
  }

  async function loadMessages(chatId: string) {
    const userId = await getInternalUserId();
    if (!userId) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .order('timestamp', { ascending: true })
      .limit(100);
    setMessages(data || []);
  }

  async function loadAttachments() {
    const userId = await getInternalUserId();
    if (!userId) return;
    // Join with messages to get sender & chat info
    const { data } = await supabase
      .from('attachments')
      .select('*, transcript, messages(sender_name, timestamp, chat_id)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(300);
    setAttachments(data || []);
    // Compute type counts
    if (data) {
      const c: Record<string, number> = { all: data.length };
      data.forEach((a: any) => { c[a.file_type] = (c[a.file_type] || 0) + 1; });
      setFileCounts(c);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    const userId = await getInternalUserId();
    if (!userId) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .ilike('text_content', '%' + searchQuery + '%')
      .order('timestamp', { ascending: false })
      .limit(50);
    setSearchResults(data || []);
  }

  // Close preview on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const openPreview = useCallback(async (att: any) => {
    const hasFile = att.storage_key && att.storage_key !== null;
    setPreview({
      attachment: att, signedUrl: null, loading: hasFile,
      error: hasFile ? null : 'This file was imported from a chat export. The actual media file is not stored yet.',
    });
    if (hasFile) {
      try {
        const res = await fetch(`/api/attachments/${att.id}`);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setPreview(prev => prev ? { ...prev, signedUrl: data.data?.url || data.url, loading: false } : null);
      } catch {
        setPreview(prev => prev ? { ...prev, loading: false, error: 'Failed to load media.' } : null);
      }
    }
  }, []);

  const filteredAttachments = useMemo(() => {
    let result = attachments;
    // Type filter
    if (fileFilter !== 'all') {
      result = result.filter(a => a.file_type === fileFilter);
    }
    // Search filter
    if (fileSearch.trim()) {
      const q = fileSearch.toLowerCase();
      result = result.filter(a =>
        a.file_name?.toLowerCase().includes(q) ||
        (a as any).messages?.sender_name?.toLowerCase().includes(q) ||
        a.mime_type?.toLowerCase().includes(q)
      );
    }
    // Sort
    result = [...result].sort((a, b) => {
      switch (fileSortBy) {
        case 'date_desc': return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case 'date_asc': return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        case 'name_asc': return (a.file_name || '').localeCompare(b.file_name || '');
        case 'name_desc': return (b.file_name || '').localeCompare(a.file_name || '');
        case 'size_desc': return (b.file_size_bytes || b.file_size || 0) - (a.file_size_bytes || a.file_size || 0);
        case 'size_asc': return (a.file_size_bytes || a.file_size || 0) - (b.file_size_bytes || b.file_size || 0);
        default: return 0;
      }
    });
    return result;
  }, [attachments, fileFilter, fileSearch, fileSortBy]);

  // Group attachments
  const groupedAttachments = useMemo(() => {
    if (fileGroupBy === 'none') return { 'All Files': filteredAttachments };
    const groups: Record<string, typeof filteredAttachments> = {};
    filteredAttachments.forEach(att => {
      let key = 'Other';
      if (fileGroupBy === 'type') {
        key = (att.file_type || 'other').charAt(0).toUpperCase() + (att.file_type || 'other').slice(1) + 's';
      } else if (fileGroupBy === 'chat') {
        const chatId = (att as any).messages?.chat_id;
        const chat = chats.find(c => c.id === chatId);
        key = chat ? getChatDisplayName(chat) : 'Unknown Chat';
      } else if (fileGroupBy === 'date') {
        if (att.created_at) {
          const d = new Date(att.created_at);
          const now = new Date();
          const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
          if (diffDays === 0) key = 'Today';
          else if (diffDays === 1) key = 'Yesterday';
          else if (diffDays < 7) key = 'This Week';
          else if (diffDays < 30) key = 'This Month';
          else key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(att);
    });
    return groups;
  }, [filteredAttachments, fileGroupBy, chats]);

  const tabs: { key: SubTab; label: string; icon: typeof MessageSquare }[] = [
    { key: 'conversations', label: 'Conversations', icon: MessageSquare },
    { key: 'files', label: 'Files', icon: Paperclip },
    { key: 'search', label: 'Search', icon: Search },
  ];

  function getChatDisplayName(chat: Chat): string {
    if (chat.is_group) return chat.name || 'Group Chat';
    return getDisplayName(chat.name, chat.name);
  }

  function getChatInitials(chat: Chat): string {
    const name = getChatDisplayName(chat);
    return getInitials(name);
  }

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
                <div className="p-8 text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-surface-400 text-sm">Loading conversations...</p>
                </div>
              ) : chats.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageSquare className="w-12 h-12 text-surface-300 mx-auto mb-3" />
                  <p className="text-surface-500 text-sm">No conversations yet</p>
                  <p className="text-surface-400 text-xs mt-1">Connect WhatsApp to see your chats</p>
                </div>
              ) : (
                chats.map(chat => {
                  const displayName = getChatDisplayName(chat);
                  const initials = getChatInitials(chat);
                  return (
                    <button
                      key={chat.id}
                      onClick={() => setSelectedChat(chat.id)}
                      className={'w-full text-left px-4 py-3.5 border-b border-surface-50 hover:bg-surface-50 transition-colors '
                        + (selectedChat === chat.id ? 'bg-brand-50/50' : '')}
                    >
                      <div className="flex items-center gap-3">
                        <div className={'w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ' + avatarColor(displayName)}>
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-surface-900 text-sm truncate">
                              {displayName}
                            </span>
                            <span className="text-[11px] text-surface-400 flex-shrink-0 ml-2">
                              {chat.last_message_at ? timeAgo(chat.last_message_at) : ''}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-xs text-surface-400 truncate">
                              {chat.is_group ? 'Group chat' : 'Personal chat'}
                            </span>
                            {/* unread count not tracked yet */}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {selectedChat ? (
              <div className="flex-1 flex flex-col">
                <div className="px-4 py-3 border-b border-surface-100 flex items-center gap-3 bg-white">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden p-2 hover:bg-surface-100 rounded">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className={'w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs flex-shrink-0 '
                    + avatarColor(getChatDisplayName(chats.find(c => c.id === selectedChat) || { name: '', is_group: false, wa_chat_id: '' } as Chat))}>
                    {getChatInitials(chats.find(c => c.id === selectedChat) || { name: '', is_group: false, wa_chat_id: '' } as Chat)}
                  </div>
                  <div>
                    <h3 className="font-medium text-surface-900 text-sm">
                      {getChatDisplayName(chats.find(c => c.id === selectedChat) || { name: 'Chat', is_group: false, wa_chat_id: '' } as Chat)}
                    </h3>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-50/50">
                  {messages.length === 0 ? (
                    <p className="text-center text-surface-400 text-sm py-8">No messages</p>
                  ) : (
                    messages.map(msg => (
                      <div key={msg.id} className={`max-w-[80%] ${msg.is_from_me ? 'ml-auto' : ''}`}>
                        <div className={`rounded-xl px-3.5 py-2.5 shadow-sm border ${msg.is_from_me ? 'bg-brand-50 border-brand-100' : 'bg-white border-surface-100'}`}>
                          <p className="text-xs font-medium text-brand-600 mb-1">{msg.is_from_me ? 'You' : getDisplayName(msg.sender_name || msg.sender_phone || '', msg.sender_phone || '')}</p>
                          <p className="text-sm text-surface-800 leading-relaxed">{msg.text_content || (msg.message_type !== 'text' ? `[${msg.message_type}]` : '')}</p>
                          <p className="text-[10px] text-surface-400 mt-1.5">{timeAgo(msg.timestamp || msg.created_at)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="hidden md:flex flex-1 items-center justify-center text-surface-400 bg-surface-50/30">
                <div className="text-center">
                  <MessageSquare className="w-16 h-16 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Select a conversation to view messages</p>
                </div>
              </div>
            )}
          </div>
        )}

        {subTab === 'files' && (
          <div className="h-full overflow-y-auto flex flex-col">
            {/* Search + Controls Bar */}
            <div className="px-6 pt-4 pb-3 space-y-3 border-b border-surface-100 bg-white">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  type="text"
                  placeholder="Search files by name, sender, or type..."
                  value={fileSearch}
                  onChange={e => setFileSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
                />
                {fileSearch && (
                  <button onClick={() => setFileSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="w-4 h-4 text-surface-400 hover:text-surface-600" />
                  </button>
                )}
              </div>
              {/* Type filters with counts */}
              <div className="flex items-center gap-2 flex-wrap">
                {['all', 'image', 'document', 'video', 'audio', 'sticker'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFileFilter(f)}
                    className={'px-3 py-2 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 '
                      + (fileFilter === f
                        ? 'bg-brand-600 text-white'
                        : 'bg-surface-100 text-surface-600 hover:bg-surface-200')}
                  >
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
                    {fileCounts[f] !== undefined && (
                      <span className={'text-[10px] px-1.5 py-0.5 rounded-full '
                        + (fileFilter === f ? 'bg-brand-700 text-brand-100' : 'bg-surface-200 text-surface-500')}>
                        {fileCounts[f]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {/* Sort, Group, View controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Sort dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowSortMenu(!showSortMenu)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-50 text-surface-600 hover:bg-surface-100 transition-colors"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      Sort
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showSortMenu && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-surface-200 rounded-xl shadow-lg z-20 py-1 w-44">
                        {([
                          ['date_desc', 'Newest first'],
                          ['date_asc', 'Oldest first'],
                          ['name_asc', 'Name A–Z'],
                          ['name_desc', 'Name Z–A'],
                          ['size_desc', 'Largest first'],
                          ['size_asc', 'Smallest first'],
                        ] as [SortOption, string][]).map(([val, label]) => (
                          <button
                            key={val}
                            onClick={() => { setFileSortBy(val); setShowSortMenu(false); }}
                            className={'w-full text-left px-3 py-2 text-xs hover:bg-surface-50 transition-colors '
                              + (fileSortBy === val ? 'text-brand-700 font-medium bg-brand-50' : 'text-surface-700')}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Group by */}
                  <div className="flex items-center gap-1 bg-surface-50 rounded-lg p-0.5">
                    {([['none', 'None'], ['type', 'Type'], ['chat', 'Chat'], ['date', 'Date']] as [GroupBy, string][]).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setFileGroupBy(val)}
                        className={'px-2.5 py-1 rounded-md text-xs font-medium transition-colors '
                          + (fileGroupBy === val ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-surface-400 mr-2">
                    {filteredAttachments.length} file{filteredAttachments.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => setFileViewMode('grid')}
                    className={'p-2 rounded-md transition-colors ' + (fileViewMode === 'grid' ? 'bg-surface-200 text-surface-800' : 'text-surface-400 hover:text-surface-600')}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setFileViewMode('list')}
                    className={'p-2 rounded-md transition-colors ' + (fileViewMode === 'list' ? 'bg-surface-200 text-surface-800' : 'text-surface-400 hover:text-surface-600')}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* File content */}
            <div className="flex-1 overflow-y-auto">
              {filteredAttachments.length === 0 ? (
                <div className="p-6 sm:p-12 text-center">
                  <Paperclip className="w-14 h-14 text-surface-200 mx-auto mb-3" />
                  <p className="text-surface-500 text-sm font-medium">
                    {fileSearch ? `No files matching "${fileSearch}"` : 'No files found'}
                  </p>
                  <p className="text-surface-400 text-xs mt-1">Files shared in your WhatsApp chats will appear here</p>
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {Object.entries(groupedAttachments).map(([group, items]) => (
                    <div key={group}>
                      {fileGroupBy !== 'none' && (
                        <div className="flex items-center gap-2 mb-3">
                          <FolderOpen className="w-4 h-4 text-surface-400" />
                          <h3 className="text-sm font-semibold text-surface-700">{group}</h3>
                          <span className="text-xs text-surface-400">({items.length})</span>
                        </div>
                      )}
                      {fileViewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {items.map((att: any) => {
                            const Icon = FILE_TYPE_ICONS[att.file_type] || FileText;
                            const colorClass = FILE_TYPE_COLORS[att.file_type] || 'bg-surface-50 text-surface-600';
                            const bgColor = colorClass.split(' ')[0];
                            const txtColor = colorClass.split(' ')[1];
                            const hasFile = att.storage_key != null;
                            const chatId = att.messages?.chat_id;
                            const chat = chats.find((c: Chat) => c.id === chatId);
                            const chatName = chat ? getChatDisplayName(chat) : null;
                            return (
                              <div
                                key={att.id}
                                onClick={() => openPreview(att)}
                                className="bg-white rounded-xl border border-surface-100 hover:border-brand-200 hover:shadow-md transition-all cursor-pointer group"
                              >
                                {/* Thumbnail area */}
                                <div className={`w-full h-28 rounded-t-xl flex items-center justify-center relative ${bgColor}`}>
                                  <Icon className={`w-10 h-10 ${txtColor}`} />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-t-xl transition-all flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2 shadow-sm">
                                      {att.file_type === 'video' || att.file_type === 'audio' ? (
                                        <Play className="w-5 h-5 text-surface-700" />
                                      ) : (
                                        <Eye className="w-5 h-5 text-surface-700" />
                                      )}
                                    </div>
                                  </div>
                                  {!hasFile && (
                                    <div className="absolute top-2 right-2">
                                      <span className="bg-amber-100 text-amber-600 text-[10px] px-1.5 py-0.5 rounded-full font-medium">No media</span>
                                    </div>
                                  )}
                                </div>
                                {/* Info */}
                                <div className="p-3">
                                  <p className="text-sm font-medium text-surface-900 truncate" title={att.file_name}>
                                    {att.file_name}
                                  </p>
                                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${colorClass}`}>
                                      {att.file_type}
                                    </span>
                                    {att.transcript && (
                                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600">
                                        📝 Transcribed
                                      </span>
                                    )}
                                    {(att.file_size_bytes || att.file_size) > 0 && (
                                      <span className="text-[10px] text-surface-400">{fileSize(att.file_size_bytes || att.file_size)}</span>
                                    )}
                                  </div>
                                  {att.transcript && (
                                    <p className="mt-1 text-[11px] text-surface-500 line-clamp-2 italic">
                                      &ldquo;{att.transcript.slice(0, 100)}
                                      {att.transcript.length > 100 ? '…' : ''}&rdquo;
                                    </p>
                                  )}
                                  {chatName && (
                                    <div className="flex items-center gap-1 mt-1.5 text-[11px] text-surface-400">
                                      <MessageSquare className="w-3 h-3" />
                                      <span className="truncate">{chatName}</span>
                                    </div>
                                  )}
                                  {att.messages?.sender_name && (
                                    <div className="flex items-center gap-1 mt-0.5 text-[11px] text-surface-400">
                                      <User className="w-3 h-3" />
                                      <span className="truncate">{getDisplayName(att.messages.sender_name, att.messages.sender_name)}</span>
                                    </div>
                                  )}
                                  {att.created_at && (
                                    <div className="flex items-center gap-1 mt-0.5 text-[11px] text-surface-400">
                                      <Calendar className="w-3 h-3" />
                                      <span>{new Date(att.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* List view */
                        <div className="space-y-1.5">
                          {items.map((att: any) => {
                            const Icon = FILE_TYPE_ICONS[att.file_type] || FileText;
                            const colorClass = FILE_TYPE_COLORS[att.file_type] || 'bg-surface-50 text-surface-600';
                            const bgColor = colorClass.split(' ')[0];
                            const txtColor = colorClass.split(' ')[1];
                            const chatId = att.messages?.chat_id;
                            const chat = chats.find((c: Chat) => c.id === chatId);
                            const chatName = chat ? getChatDisplayName(chat) : null;
                            return (
                              <div
                                key={att.id}
                                onClick={() => openPreview(att)}
                                className="bg-white rounded-lg border border-surface-100 px-4 py-3 hover:bg-surface-50 hover:border-brand-200 transition-all cursor-pointer group flex items-center gap-3"
                              >
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${bgColor}`}>
                                  <Icon className={`w-5 h-5 ${txtColor}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-surface-900 truncate">{att.file_name}</p>
                                  <p className="text-xs text-surface-400 mt-0.5 flex items-center gap-2">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${colorClass}`}>
                                      {att.file_type}
                                    </span>
                                    {(att.file_size_bytes || att.file_size) > 0 && (
                                      <span>{fileSize(att.file_size_bytes || att.file_size)}</span>
                                    )}
                                    {chatName && <span className="truncate max-w-[120px]">· {chatName}</span>}
                                    {att.created_at && <span>· {timeAgo(att.created_at)}</span>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {att.file_type === 'video' || att.file_type === 'audio' ? (
                                    <Play className="w-4 h-4 text-surface-400" />
                                  ) : (
                                    <Eye className="w-4 h-4 text-surface-400" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Media Preview Modal */}
            {preview && (() => {
              const att = preview.attachment;
              const Icon = FILE_TYPE_ICONS[att.file_type] || FileText;
              const colorClass = FILE_TYPE_COLORS[att.file_type] || 'bg-surface-50 text-surface-600';
              const bgColor = colorClass.split(' ')[0];
              const txtColor = colorClass.split(' ')[1];
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                  <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgColor}`}>
                          <Icon className={`w-5 h-5 ${txtColor}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-surface-900 truncate">{att.file_name}</p>
                          <p className="text-xs text-surface-500">
                            {att.file_type}{att.mime_type && att.mime_type !== 'application/octet-stream' ? ` · ${att.mime_type}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {preview.signedUrl && (
                          <>
                            <a href={preview.signedUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-surface-100 text-surface-500" title="Open">
                              <ExternalLink className="w-5 h-5" />
                            </a>
                            <a href={preview.signedUrl} download={att.file_name} className="p-2 rounded-lg hover:bg-surface-100 text-surface-500" title="Download">
                              <Download className="w-5 h-5" />
                            </a>
                          </>
                        )}
                        <button onClick={() => setPreview(null)} className="p-2 rounded-lg hover:bg-surface-100 text-surface-500">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    {/* Content */}
                    <div className="p-6">
                      {preview.loading ? (
                        <div className="flex flex-col items-center py-16">
                          <div className="w-10 h-10 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-4" />
                          <p className="text-sm text-surface-500">Loading media...</p>
                        </div>
                      ) : preview.error ? (
                        <div className="flex flex-col items-center py-12 px-4">
                          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${bgColor}`}>
                            <Icon className={`w-10 h-10 ${txtColor}`} />
                          </div>
                          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-md">
                            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-800">{preview.error}</p>
                          </div>
                        </div>
                      ) : preview.signedUrl ? (
                        <div className="flex items-center justify-center">
                          {(att.file_type === 'image' || att.file_type === 'sticker') ? (
                            <img src={preview.signedUrl} alt={att.file_name} className="max-w-full max-h-[60vh] rounded-lg object-contain" />
                          ) : att.file_type === 'video' ? (
                            <video controls className="max-w-full max-h-[60vh] rounded-lg">
                              <source src={preview.signedUrl} type={att.mime_type || 'video/mp4'} />
                            </video>
                          ) : att.file_type === 'audio' ? (
                            <div className="w-full max-w-md">
                              <div className={`w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-6 ${bgColor}`}>
                                <Music className={`w-12 h-12 ${txtColor}`} />
                              </div>
                              <audio controls className="w-full">
                                <source src={preview.signedUrl} type={att.mime_type || 'audio/ogg'} />
                              </audio>
                              {att.transcript && (
                                <div className="mt-4 p-3 bg-surface-50 rounded-xl border border-surface-100">
                                  <p className="text-xs font-medium text-surface-500 mb-1.5 flex items-center gap-1">
                                    <span>📝</span> Transcription
                                  </p>
                                  <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{att.transcript}</p>
                                </div>
                              )}
                            </div>
                          ) : att.mime_type === 'application/pdf' ? (
                            <iframe src={preview.signedUrl} className="w-full h-[60vh] rounded-lg border" title={att.file_name} />
                          ) : (
                            <div className="flex flex-col items-center py-8">
                              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${bgColor}`}>
                                <FileText className={`w-10 h-10 ${txtColor}`} />
                              </div>
                              <p className="text-sm text-surface-600 mb-4">Preview not available for this file type.</p>
                              <a href={preview.signedUrl} download={att.file_name} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2">
                                <Download className="w-4 h-4" /> Download File
                              </a>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                    {/* Footer metadata */}
                    <div className="px-6 py-3 border-t border-surface-100 bg-surface-50 flex items-center gap-4 text-xs text-surface-500">
                      {(att as any).messages?.sender_name && (
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{getDisplayName((att as any).messages.sender_name, (att as any).messages.sender_name)}</span>
                      )}
                      {att.created_at && (
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(att.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      )}
                      {(att.file_size_bytes || att.file_size) > 0 && (
                        <span>{fileSize(att.file_size_bytes || att.file_size)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
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
                  className="w-full pl-10 pr-4 py-2.5 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
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
                    <div key={msg.id} className="border border-surface-100 rounded-xl p-3.5 hover:bg-surface-50 transition-colors bg-white">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-brand-600">{msg.is_from_me ? 'You' : getDisplayName(msg.sender_name || msg.sender_phone || '', msg.sender_phone || '')}</span>
                        <span className="text-[11px] text-surface-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeAgo(msg.timestamp || msg.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-surface-800 leading-relaxed">{msg.text_content || (msg.message_type !== 'text' ? `[${msg.message_type}]` : '')}</p>
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
