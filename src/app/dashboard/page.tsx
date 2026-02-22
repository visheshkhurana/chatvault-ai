'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Search,
  FileText,
  MessageSquare,
  Calendar,
  Filter,
  ChevronDown,
  Loader2,
  LogOut,
  Upload,
  Users,
  CheckSquare,
  BarChart3,
  Settings,
  Shield,
  Download,
  Clock,
  AlertTriangle,
  Tag,
  Plus,
  X,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Bell,
  Bot,
  Heart,
  FolderOpen,
  FileBarChart,
  Lightbulb,
  Send,
  Smile,
  Frown,
  Meh,
  RefreshCw,
  Copy,
  Sparkles,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus as MinusIcon,
  Eye,
} from 'lucide-react';

// ============================================================
// Rememora - Dashboard Page
// Search, browse messages, view attachments, summaries
// ============================================================

interface SearchResult {
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

interface BridgeStatus {
    connected: boolean;
    phone?: string;
    name?: string;
}

interface Chat {
    id: string;
    title: string;
    chat_type: string;
    category: string | null;
    last_message_at: string;
    participant_count: number;
}

interface Message {
    id: string;
    sender_name: string;
    text_content: string;
    message_type: string;
    timestamp: string;
    chat_id: string;
}

interface Contact {
    id: string;
    display_name: string;
    wa_id: string;
    message_count: number;
    tags: string[];
    notes: string;
}

interface Commitment {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'overdue' | 'done';
    due_date: string;
    priority: 'low' | 'medium' | 'high';
    contact_id: string;
}

interface AnalyticsData {
    total_messages: number;
    active_chats: number;
    top_contact: string;
    message_volume: Array<{ date: string; count: number }>;
    hourly_distribution: Array<{ hour: number; count: number }>;
    top_contacts: Array<{ name: string; count: number }>;
    message_types: Array<{ type: string; count: number }>;
}

interface SettingsData {
    display_name: string;
    email: string;
    timezone: string;
    daily_summary: boolean;
    weekly_summary: boolean;
    commitment_alerts: boolean;
    privacy_zones: any[];
    data_retention_days: number;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface Template {
    id: string;
    name: string;
    content: string;
    category: string;
    variables: string[];
    use_count: number;
    last_used_at: string;
}

interface Reminder {
    id: string;
    chat_id: string;
    text: string;
    due_at: string;
    status: string;
    isOverdue?: boolean;
    created_at: string;
}

interface Label {
    id: string;
    name: string;
    color: string;
    icon: string;
    is_smart: boolean;
    chat_ids: string[];
    chatCount?: number;
}

type TabType = 'search' | 'chats' | 'attachments' | 'summaries' | 'contacts' | 'commitments' | 'analytics' | 'settings' | 'assistant' | 'sentiment' | 'templates' | 'reminders' | 'labels' | 'reports';

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

export default function DashboardPage() {
    const [query, setQuery] = useState('');
    const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>('search');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [user, setUser] = useState<any>(null);
    const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({connected: false});

    useEffect(() => {
        const checkBridge = async () => {
            try {
                const res = await fetch(BRIDGE_URL + '/status');
                const data = await res.json();
                setBridgeStatus({ connected: data.connected, phone: data.phone, name: data.name });
            } catch (e) { setBridgeStatus({ connected: false }); }
        };
        checkBridge();
        const interval = setInterval(checkBridge, 30000);
        return () => clearInterval(interval);
    }, []);


  useEffect(() => {
        async function initDashboard() {
            const authedUser = await checkAuth();
            if (authedUser) {
                await loadChats();
            }
        }
        initDashboard();
  }, []);

  async function checkAuth() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
                window.location.href = '/login';
                return null;
        }
        setUser(user);
        return user;
  }

  async function loadChats() {
        const { data } = await supabase
          .from('chats')
          .select('*')
          .order('last_message_at', { ascending: false });
        setChats(data || []);
  }

  async function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        if (!query.trim()) return;

      setIsSearching(true);
        try {
                const session = await supabase.auth.getSession();
                const response = await fetch('/api/search', {
                          method: 'POST',
                          headers: {
                                      'Content-Type': 'application/json',
                                      'Authorization': `Bearer ${session.data.session?.access_token}`,
                          },
                          body: JSON.stringify({
                                      query,
                                      chatId: selectedChat,
                                      dateFrom: dateFrom || undefined,
                                      dateTo: dateTo || undefined,
                          }),
                });
                const data = await response.json();
                setSearchResult({ answer: data.answer || data.error || 'No results found', citations: data.citations || [], relatedAttachments: data.relatedAttachments || [] });
        } catch (err) {
                console.error('Search error:', err);
        }
        setIsSearching(false);
  }

  async function loadChatMessages(chatId: string) {
        setSelectedChat(chatId);
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('timestamp', { ascending: false })
          .limit(100);
        setMessages(data || []);
  }

  async function handleSignOut() {
        await supabase.auth.signOut();
        window.location.href = '/login';
  }

  return (
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
              <header className="bg-white border-b border-gray-200 px-6 py-4">
                      <div className="max-w-7xl mx-auto flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                                                          <MessageSquare className="w-5 h-5 text-white" />
                                            </div>
                                            <h1 className="text-xl font-bold text-gray-900">Rememora</h1>
                                </div>
                                <div className="flex items-center gap-4">
                                            {bridgeStatus.connected ? (
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span>
                                    <span className="text-sm text-green-600 font-medium">{bridgeStatus.name || bridgeStatus.phone || 'Connected'}</span>
                                </div>
                            ) : (
                                <a href="/dashboard/connect" className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-medium">
                                    <span className="w-2.5 h-2.5 bg-orange-400 rounded-full"></span>
                                    Connect WhatsApp
                                </a>
                            )}
                                            <span className="text-sm text-gray-500">{user?.email}</span>
                                            <button onClick={handleSignOut} className="text-gray-500 hover:text-gray-700">
                                                          <LogOut className="w-5 h-5" />
                                            </button>
                                </div>
                      </div>
              </header>
        
              <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Tabs */}
                      <div className="flex gap-1 mb-8 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
                        {([
                          {id: 'search', label: 'Search', icon: '🔍'},
                          {id: 'assistant', label: 'AI Assistant', icon: '🤖'},
                          {id: 'chats', label: 'Chats', icon: '💬'},
                          {id: 'attachments', label: 'Files', icon: '📎'},
                          {id: 'summaries', label: 'Summaries', icon: '📝'},
                          {id: 'contacts', label: 'Contacts', icon: '👥'},
                          {id: 'labels', label: 'Labels', icon: '🏷️'},
                          {id: 'commitments', label: 'Tasks', icon: '✅'},
                          {id: 'reminders', label: 'Reminders', icon: '⏰'},
                          {id: 'templates', label: 'Templates', icon: '📋'},
                          {id: 'sentiment', label: 'Mood', icon: '😊'},
                          {id: 'analytics', label: 'Analytics', icon: '📊'},
                          {id: 'reports', label: 'Reports', icon: '📄'},
                          {id: 'settings', label: 'Settings', icon: '⚙️'},
                        ] as const).map((tab) => (
                      <button
                                      key={tab.id}
                                      onClick={() => setActiveTab(tab.id as TabType)}
                                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                                                        activeTab === tab.id
                                                          ? 'bg-white text-gray-900 shadow-sm'
                                                          : 'text-gray-500 hover:text-gray-700'
                                      }`}
                                    >
                        <span className="text-xs">{tab.icon}</span>
                        {tab.label}
                      </button>
                    ))}
                      </div>
              
                {/* Search Tab */}
                {activeTab === 'search' && (
                    <div>
                                <form onSubmit={handleSearch} className="mb-8">
                                              <div className="flex gap-4">
                                                              <div className="flex-1 relative">
                                                                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                                                                <input
                                                                                                      type="text"
                                                                                                      value={query}
                                                                                                      onChange={(e: any) => setQuery(e.target.value)}
                                                                                                      placeholder="Search your messages... (e.g., 'Find Neha's MRI report')"
                                                                                                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900"
                                                                                                    />
                                                              </div>
                                                              <button
                                                                                  type="submit"
                                                                                  disabled={isSearching}
                                                                                  className="px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                                                                                >
                                                                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                                                                Search
                                                              </button>
                                              </div>
                                
                                  {/* Filters */}
                                              <div className="flex gap-4 mt-4">
                                                              <select
                                                                                  value={selectedChat || ''}
                                                                                  onChange={(e: any) => setSelectedChat(e.target.value || null)}
                                                                                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white"
                                                                                >
                                                                                <option value="">All Chats</option>
                                                                {chats.map((chat: any) => (
                                                                                                      <option key={chat.id} value={chat.id}>{chat.title}</option>
                                                                                                    ))}
                                                              </select>
                                                              <input
                                                                                  type="date"
                                                                                  value={dateFrom}
                                                                                  onChange={(e: any) => setDateFrom(e.target.value)}
                                                                                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white"
                                                                                  placeholder="From date"
                                                                                />
                                                              <input
                                                                                  type="date"
                                                                                  value={dateTo}
                                                                                  onChange={(e: any) => setDateTo(e.target.value)}
                                                                                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white"
                                                                                  placeholder="To date"
                                                                                />
                                              </div>
                                </form>
                    
                      {/* Search Results */}
                      {searchResult && (
                                    <div className="space-y-6">
                                                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                                                                      <h3 className="font-semibold text-gray-900 mb-3">Answer</h3>
                                                                      <p className="text-gray-700 whitespace-pre-wrap">{searchResult.answer}</p>
                                                    </div>
                                    
                                      {searchResult.citations.length > 0 && (
                                                        <div className="bg-white rounded-xl p-6 border border-gray-200">
                                                                            <h3 className="font-semibold text-gray-900 mb-3">Sources</h3>
                                                                            <div className="space-y-3">
                                                                              {searchResult.citations.map((cite: any, i: number) => (
                                                                                  <div key={i} className="p-3 bg-gray-50 rounded-lg">
                                                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                                                                        <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
                                                                                                                                          {Math.round(cite.similarity * 100)}% match
                                                                                                                                          </span>
                                                                                                              {cite.senderName && (
                                                                                                                  <span className="text-xs text-gray-500">{cite.senderName}</span>
                                                                                                                                        )}
                                                                                                              {cite.timestamp && (
                                                                                                                  <span className="text-xs text-gray-400">
                                                                                                                    {new Date(cite.timestamp).toLocaleDateString()}
                                                                                                                    </span>
                                                                                                                                        )}
                                                                                                              </div>
                                                                                                            <p className="text-sm text-gray-600">{cite.text}</p>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                        </div>
                                                    )}
                                    
                                      {searchResult.relatedAttachments.length > 0 && (
                                                        <div className="bg-white rounded-xl p-6 border border-gray-200">
                                                                            <h3 className="font-semibold text-gray-900 mb-3">Related Files</h3>
                                                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                                              {searchResult.relatedAttachments.map((att: any) => (
                                                                                  <a
                                                                                                              key={att.id}
                                                                                                              href={att.storageUrl}
                                                                                                              target="_blank"
                                                                                                              rel="noopener noreferrer"
                                                                                                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                                                                                                            >
                                                                                                            <FileText className="w-8 h-8 text-blue-500" />
                                                                                                            <div>
                                                                                                                                        <p className="text-sm font-medium text-gray-900 truncate">{att.fileName}</p>
                                                                                                                                        <p className="text-xs text-gray-500">{att.fileType}</p>
                                                                                                              </div>
                                                                                    </a>
                                                                                ))}
                                                                            </div>
                                                        </div>
                                                    )}
                                    </div>
                                )}
                    </div>
                      )}
              
                {/* Chats Tab */}
                {activeTab === 'chats' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                              <div className="p-4 border-b border-gray-100">
                                                              <h3 className="font-semibold text-gray-900">Conversations</h3>
                                              </div>
                                              <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                                                {chats.map((chat: any) => (
                                        <button
                                                              key={chat.id}
                                                              onClick={() => loadChatMessages(chat.id)}
                                                              className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                                                                                      selectedChat === chat.id ? 'bg-green-50' : ''
                                                              }`}
                                                            >
                                                            <p className="font-medium text-gray-900">{chat.title}</p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                                  <span className="text-xs text-gray-500">{chat.chat_type}</span>
                                                              {chat.category && (
                                                                                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                                                                        {chat.category}
                                                                                        </span>
                                                                                  )}
                                                              {chat.last_message_at && (
                                                                                      <span className="text-xs text-gray-400">
                                                                                        {new Date(chat.last_message_at).toLocaleDateString()}
                                                                                        </span>
                                                                                  )}
                                                            </div>
                                        </button>
                                      ))}
                                              </div>
                                </div>
                    
                                <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
                                              <div className="p-4 border-b border-gray-100">
                                                              <h3 className="font-semibold text-gray-900">Messages</h3>
                                              </div>
                                              <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                                                {messages.length === 0 ? (
                                        <p className="text-gray-500 text-center py-8">Select a chat to view messages</p>
                                      ) : (
                                        messages.map((msg: any) => (
                                                              <div key={msg.id} className="p-3 bg-gray-50 rounded-lg">
                                                                                    <div className="flex items-center gap-2 mb-1">
                                                                                                            <span className="text-sm font-medium text-gray-900">{msg.sender_name}</span>
                                                                                                            <span className="text-xs text-gray-400">
                                                                                                              {new Date(msg.timestamp).toLocaleString()}
                                                                                                              </span>
                                                                                      {msg.message_type !== 'text' && (
                                                                                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                                                                                            {msg.message_type}
                                                                                            </span>
                                                                                                            )}
                                                                                      </div>
                                                                                    <p className="text-sm text-gray-700">{msg.text_content || `[${msg.message_type}]`}</p>
                                                              </div>
                                                            ))
                                      )}
                                              </div>
                                </div>
                    </div>
                      )}
              
                {/* Attachments Tab */}
                {activeTab === 'attachments' && (
                    <AttachmentsGallery />
                  )}
              
                {/* Summaries Tab */}
                {activeTab === 'summaries' && (
                    <SummariesSection chats={chats} />
                  )}

                {/* Contacts Tab */}
                {activeTab === 'contacts' && (
                    <ContactsSection />
                  )}

                {/* Commitments Tab */}
                {activeTab === 'commitments' && (
                    <CommitmentsSection />
                  )}

                {/* Analytics Tab */}
                {activeTab === 'analytics' && (
                    <AnalyticsSection />
                  )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                    <SettingsSection />
                  )}

                {/* AI Assistant Tab */}
                {activeTab === 'assistant' && (
                    <AssistantSection />
                  )}

                {/* Sentiment Tab */}
                {activeTab === 'sentiment' && (
                    <SentimentSection />
                  )}

                {/* Templates Tab */}
                {activeTab === 'templates' && (
                    <TemplatesSection />
                  )}

                {/* Reminders Tab */}
                {activeTab === 'reminders' && (
                    <RemindersSection />
                  )}

                {/* Labels Tab */}
                {activeTab === 'labels' && (
                    <LabelsSection />
                  )}

                {/* Reports Tab */}
                {activeTab === 'reports' && (
                    <ReportsSection />
                  )}
              </div>
        </div>
      );
}

// --- Attachments Gallery Component ---
function AttachmentsGallery() {
    const [attachments, setAttachments] = useState<any[]>([]);
    const [filter, setFilter] = useState('all');
  
    useEffect(() => {
          loadAttachments();
    }, [filter]);
  
    async function loadAttachments() {
          let query = supabase
                  .from('attachments')
                  .select('*, messages(sender_name, timestamp)')
                  .order('created_at', { ascending: false })
                  .limit(50);
      
          if (filter !== 'all') {
                  query = query.eq('file_type', filter);
          }
      
          const { data } = await query;
          setAttachments(data || []);
    }
  
    return (
          <div>
                <div className="flex gap-2 mb-6">
                  {['all', 'image', 'document', 'audio', 'video'].map((type) => (
                      <button
                                    key={type}
                                    onClick={() => setFilter(type)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
                                                    filter === type ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-200'
                                    }`}
                                  >
                        {type}
                      </button>
                    ))}
                </div>
          
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {attachments.map((att: any) => (
                      <a
                                    key={att.id}
                                    href="#"
                                    onClick={async (e: any) => {
                                        e.preventDefault();
                                        try {
                                            const res = await fetch(`/api/attachments/${att.id}`);
                                            const data = await res.json();
                                            if (data.url) window.open(data.url, '_blank');
                                        } catch (err) {
                                            console.error('Failed to get attachment URL:', err);
                                        }
                                    }}
                                    className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                                  >
                        {att.file_type === 'image' ? (
                                                  <div className="w-full h-32 bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                                                                  <img src={`/api/attachments/${att.id}?thumbnail=true`} alt={att.file_name} className="max-h-full max-w-full object-cover rounded-lg" />
                                                  </div>
                                                ) : (
                                                  <div className="w-full h-32 bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                                                                  <FileText className="w-12 h-12 text-gray-400" />
                                                  </div>
                                  )}
                                  <p className="text-sm font-medium text-gray-900 truncate">{att.file_name}</p>
                                  <p className="text-xs text-gray-500 mt-1">{att.file_type} &middot; {att.messages?.sender_name}</p>
                      </a>
                    ))}
                </div>
          </div>
        );
}

// --- Summaries Section Component ---
function SummariesSection({ chats }: { chats: Chat[] }) {
    const [summaries, setSummaries] = useState<any[]>([]);
    const [generating, setGenerating] = useState(false);
    const [selectedChatForSummary, setSelectedChatForSummary] = useState('');
  
    useEffect(() => {
          loadSummaries();
    }, []);
  
    async function loadSummaries() {
          const { data } = await supabase
                  .from('chat_summaries')
                  .select('*, chats(title)')
                  .order('created_at', { ascending: false })
                  .limit(20);
          setSummaries(data || []);
    }
  
    async function generateSummary() {
          if (!selectedChatForSummary) return;
          setGenerating(true);
          try {
                  const session = await supabase.auth.getSession();
                  await fetch('/api/summarize', {
                            method: 'POST',
                            headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${session.data.session?.access_token}`,
                            },
                            body: JSON.stringify({
                                        chatId: selectedChatForSummary,
                                        days: 7,
                            }),
                  });
                  await loadSummaries();
          } catch (err) {
                  console.error('Summary error:', err);
          }
          setGenerating(false);
    }
  
    return (
          <div>
                <div className="flex items-center gap-4 mb-6">
                        <select
                                    value={selectedChatForSummary}
                                    onChange={(e: any) => setSelectedChatForSummary(e.target.value)}
                                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                  >
                                  <option value="">Select a chat...</option>
                          {chats.map((chat: any) => (
                                                <option key={chat.id} value={chat.id}>{chat.title}</option>
                                              ))}
                        </select>
                        <button
                                    onClick={generateSummary}
                                    disabled={generating || !selectedChatForSummary}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                                  >
                          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                  Generate Summary
                        </button>
                </div>

                <div className="space-y-4">
                  {summaries.map((summary: any) => (
                      <div key={summary.id} className="bg-white rounded-xl border border-gray-200 p-6">
                                  <div className="flex items-center gap-3 mb-3">
                                                <h3 className="font-semibold text-gray-900">{summary.chats?.title}</h3>
                                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{summary.summary_type}</span>
                                                <span className="text-xs text-gray-400">
                                                  {new Date(summary.period_start).toLocaleDateString()} - {new Date(summary.period_end).toLocaleDateString()}
                                                </span>
                                  </div>
                                  <p className="text-gray-700 text-sm whitespace-pre-wrap">{summary.summary_text}</p>
                        {summary.key_topics?.length > 0 && (
                                      <div className="flex flex-wrap gap-2 mt-3">
                                        {summary.key_topics.map((topic: string, i: number) => (
                                                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{topic}</span>
                                                        ))}
                                      </div>
                                  )}
                      </div>
                    ))}
                </div>
          </div>
        );
}

// --- Contacts Section Component ---
function ContactsSection() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    loadContacts();
  }, [searchQuery]);

  async function loadContacts() {
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch(`/api/contacts?search=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
      });
      const data = await response.json();
      setContacts(data.contacts || []);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }
  }

  async function loadContactDetails(contactId: string) {
    setDetailsLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch(`/api/contacts/${contactId}`, {
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
      });
      const data = await response.json();
      setSelectedContact(data.contact);
    } catch (err) {
      console.error('Failed to load contact details:', err);
    }
    setDetailsLoading(false);
  }

  async function addTag() {
    if (!selectedContact || !newTag.trim()) return;
    try {
      const session = await supabase.auth.getSession();
      const updatedTags = [...(selectedContact.tags || []), newTag];
      await fetch(`/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({ tags: updatedTags }),
      });
      setSelectedContact({ ...selectedContact, tags: updatedTags });
      setNewTag('');
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  }

  async function removeTag(tag: string) {
    if (!selectedContact) return;
    try {
      const session = await supabase.auth.getSession();
      const updatedTags = (selectedContact.tags || []).filter((t: any) => t !== tag);
      await fetch(`/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({ tags: updatedTags }),
      });
      setSelectedContact({ ...selectedContact, tags: updatedTags });
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Contacts List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-green-600" />
            Contacts
          </h3>
        </div>
        <div className="p-4 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
          {contacts.map((contact: any) => (
            <button
              key={contact.id}
              onClick={() => loadContactDetails(contact.id)}
              className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                selectedContact?.id === contact.id ? 'bg-green-50' : ''
              }`}
            >
              <p className="font-medium text-gray-900">{contact.display_name}</p>
              <p className="text-xs text-gray-500 mt-1">{contact.wa_id}</p>
              <p className="text-xs text-gray-400 mt-0.5">{contact.message_count} messages</p>
            </button>
          ))}
        </div>
      </div>

      {/* Contact Details */}
      <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
        {detailsLoading ? (
          <div className="p-6 flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
          </div>
        ) : selectedContact ? (
          <div className="p-6 space-y-6">
            {/* Contact Info */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Contact Information</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Name</p>
                  <p className="text-gray-900">{selectedContact.display_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">WhatsApp ID</p>
                  <p className="text-gray-900 font-mono text-sm">{selectedContact.wa_id}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Messages</p>
                  <p className="text-gray-900">{selectedContact.message_count}</p>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Tags</h3>
                <button
                  onClick={() => setEditingTags(!editingTags)}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  {editingTags ? 'Done' : 'Edit'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {(selectedContact.tags || []).map((tag: any) => (
                  <div key={tag} className="flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                    {tag}
                    {editingTags && (
                      <button
                        onClick={() => removeTag(tag)}
                        className="hover:text-green-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {editingTags && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e: any) => setNewTag(e.target.value)}
                    placeholder="Add new tag..."
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={addTag}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
              <textarea
                value={selectedContact.notes || ''}
                readOnly
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 text-gray-600 min-h-[100px] focus:outline-none"
                placeholder="No notes yet"
              />
            </div>
          </div>
        ) : (
          <div className="p-6 flex items-center justify-center min-h-[400px] text-gray-500">
            Select a contact to view details
          </div>
        )}
      </div>
    </div>
  );
}

// --- Commitments Section Component ---
function CommitmentsSection() {
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    loadCommitments();
  }, []);

  async function loadCommitments() {
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('/api/commitments', {
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
      });
      const data = await response.json();
      setCommitments(data.commitments || []);
    } catch (err) {
      console.error('Failed to load commitments:', err);
    }
  }

  async function scanForCommitments() {
    setScanning(true);
    try {
      const session = await supabase.auth.getSession();
      await fetch('/api/commitments/scan', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
      });
      await loadCommitments();
    } catch (err) {
      console.error('Failed to scan commitments:', err);
    }
    setScanning(false);
  }

  async function markAsDone(commitmentId: string) {
    try {
      const session = await supabase.auth.getSession();
      await fetch(`/api/commitments/${commitmentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({ status: 'done' }),
      });
      await loadCommitments();
    } catch (err) {
      console.error('Failed to mark commitment as done:', err);
    }
  }

  const grouped = {
    overdue: commitments.filter((c: any) => c.status === 'overdue'),
    pending: commitments.filter((c: any) => c.status === 'pending'),
    done: commitments.filter((c: any) => c.status === 'done'),
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700';
      case 'low':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <AlertTriangle className="w-3 h-3" />;
      case 'medium':
        return <Clock className="w-3 h-3" />;
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Header with Scan Button */}
      <div className="mb-6">
        <button
          onClick={scanForCommitments}
          disabled={scanning}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
          Scan for Commitments
        </button>
      </div>

      {/* Commitments by Status */}
      <div className="space-y-6">
        {/* Overdue */}
        {grouped.overdue.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Overdue ({grouped.overdue.length})
            </h3>
            <div className="space-y-3">
              {grouped.overdue.map((commitment: any) => (
                <div key={commitment.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-medium text-gray-900">{commitment.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{commitment.description}</p>
                    </div>
                    <button
                      onClick={() => markAsDone(commitment.id)}
                      className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200"
                    >
                      Mark Done
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${getPriorityColor(commitment.priority)}`}>
                      {getPriorityIcon(commitment.priority)}
                      {commitment.priority}
                    </span>
                    <span className="text-xs text-red-600 font-medium">
                      Due: {new Date(commitment.due_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending */}
        {grouped.pending.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              Pending ({grouped.pending.length})
            </h3>
            <div className="space-y-3">
              {grouped.pending.map((commitment: any) => (
                <div key={commitment.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-medium text-gray-900">{commitment.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{commitment.description}</p>
                    </div>
                    <button
                      onClick={() => markAsDone(commitment.id)}
                      className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200"
                    >
                      Mark Done
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${getPriorityColor(commitment.priority)}`}>
                      {getPriorityIcon(commitment.priority)}
                      {commitment.priority}
                    </span>
                    <span className="text-xs text-gray-500">
                      Due: {new Date(commitment.due_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Done */}
        {grouped.done.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-green-600" />
              Completed ({grouped.done.length})
            </h3>
            <div className="space-y-3">
              {grouped.done.map((commitment: any) => (
                <div key={commitment.id} className="bg-gray-50 rounded-xl border border-gray-200 p-4 opacity-75">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-medium text-gray-900 line-through">{commitment.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{commitment.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${getPriorityColor(commitment.priority)}`}>
                      {getPriorityIcon(commitment.priority)}
                      {commitment.priority}
                    </span>
                    <span className="text-xs text-gray-500">
                      Due: {new Date(commitment.due_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {Object.values(grouped).every((arr) => arr.length === 0) && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
            No commitments found. Click "Scan for Commitments" to find commitments in your messages.
          </div>
        )}
      </div>
    </div>
  );
}

// --- Analytics Section Component ---
function AnalyticsSection() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch(`/api/analytics?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
      });
      const data = await response.json();
      setAnalytics({
              total_messages: data.totalMessages || 0,
              active_chats: data.chatActivity?.length || 0,
              top_contact: data.topContacts?.[0]?.name || 'N/A',
              message_volume: data.messageVolume || [],
              hourly_distribution: data.hourlyDistribution || [],
              top_contacts: data.topContacts || [],
              message_types: data.messageTypeBreakdown || [],
            });
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
    setLoading(false);
  }

  if (loading || !analytics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
      </div>
    );
  }

  const maxVolume = Math.max(...(analytics.message_volume || []).map((v: any) => v.count), 1);
  const maxHourly = Math.max(...(analytics.hourly_distribution || []).map((v: any) => v.count), 1);

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex gap-2">
        {(['7d', '30d', '90d'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === p ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-200'
            }`}
          >
            {p === '7d' ? 'Last 7 days' : p === '30d' ? 'Last 30 days' : 'Last 90 days'}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total Messages</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.total_messages.toLocaleString()}</p>
            </div>
            <MessageSquare className="w-12 h-12 text-green-100" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Active Chats</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.active_chats}</p>
            </div>
            <MessageSquare className="w-12 h-12 text-blue-100" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-600 text-sm">Top Contact</p>
              <p className="text-xl font-bold text-gray-900 mt-2 truncate">{analytics.top_contact}</p>
            </div>
            <Users className="w-12 h-12 text-purple-100" />
          </div>
        </div>
      </div>

      {/* Message Volume Chart */}
      {analytics.message_volume && analytics.message_volume.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Message Volume</h3>
          <div className="flex items-end gap-2 h-40">
            {analytics.message_volume.map((item: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full bg-green-600 rounded-t-lg transition-all"
                  style={{ height: `${(item.count / maxVolume) * 150}px` }}
                  title={`${item.count} messages`}
                />
                <span className="text-xs text-gray-600 text-center truncate">{item.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hourly Distribution */}
      {analytics.hourly_distribution && analytics.hourly_distribution.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Messages by Hour</h3>
          <div className="flex items-end gap-1 h-32">
            {analytics.hourly_distribution.map((item: any, i: number) => (
              <div
                key={i}
                className="flex-1 bg-blue-600 rounded-t-sm"
                style={{ height: `${(item.count / maxHourly) * 100}px` }}
                title={`${item.hour}:00 - ${item.count} messages`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-2">
            <span>00:00</span>
            <span>12:00</span>
            <span>23:00</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Contacts */}
        {analytics.top_contacts && analytics.top_contacts.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Top Contacts</h3>
            <div className="space-y-3">
              {analytics.top_contacts.map((contact: any, i: number) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-gray-700 truncate">{contact.name}</span>
                  <span className="text-sm text-gray-500 font-medium">{contact.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message Type Breakdown */}
        {analytics.message_types && analytics.message_types.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Message Types</h3>
            <div className="space-y-3">
              {analytics.message_types.map((type: any, i: number) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700 capitalize">{type.type}</span>
                    <span className="text-sm text-gray-500 font-medium">{type.count}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{
                        width: `${
                          (type.count /
                            (analytics.message_types?.reduce((sum: any, t: any) => sum + t.count, 0) || 1)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Settings Section Component ---
function SettingsSection() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newZone, setNewZone] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
      });
      const data = await response.json();
      setSettings({
              display_name: data.profile?.displayName || '',
              email: data.profile?.email || '',
              timezone: data.profile?.timezone || 'UTC',
              daily_summary: data.notifications?.dailySummary ?? false,
              weekly_summary: data.notifications?.weeklySummary ?? false,
              commitment_alerts: data.notifications?.commitmentAlerts ?? true,
              privacy_zones: data.privacyZones || [],
              data_retention_days: data.profile?.dataRetentionDays || 365,
            });
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
    setLoading(false);
  }

  async function saveSettings(updates: Partial<SettingsData>) {
    if (!settings) return;
    setSaving(true);
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({
                displayName: updates.display_name,
                timezone: updates.timezone,
                dataRetentionDays: updates.data_retention_days,
                notifications: {
                  daily_summary: updates.daily_summary,
                  weekly_summary: updates.weekly_summary,
                  commitment_alerts: updates.commitment_alerts,
                },
              }),
      });
      const data = await response.json();
      setSettings({
              display_name: data.profile?.displayName || '',
              email: data.profile?.email || '',
              timezone: data.profile?.timezone || 'UTC',
              daily_summary: data.notifications?.dailySummary ?? false,
              weekly_summary: data.notifications?.weeklySummary ?? false,
              commitment_alerts: data.notifications?.commitmentAlerts ?? true,
              privacy_zones: data.privacyZones || [],
              data_retention_days: data.profile?.dataRetentionDays || 365,
            });
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
    setSaving(false);
  }

  async function addPrivacyZone() {
    if (!settings || !newZone.trim()) return;
    const updatedZones = [...(settings.privacy_zones || []), newZone];
    await saveSettings({ privacy_zones: updatedZones });
    setNewZone('');
  }

  async function removePrivacyZone(zone: string) {
    if (!settings) return;
    const updatedZones = (settings.privacy_zones || []).filter((z: any) => z !== zone);
    await saveSettings({ privacy_zones: updatedZones });
  }

  async function handleExport() {
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('/api/export', {
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rememora-export-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
        Failed to load settings
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-green-600" />
          Profile
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-600">Display Name</label>
            <input
              type="text"
              value={settings.display_name}
              onChange={(e: any) => setSettings({ ...settings, display_name: e.target.value })}
              onBlur={() => saveSettings({ display_name: settings.display_name })}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Email</label>
            <input
              type="email"
              value={settings.email}
              disabled
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 bg-gray-50"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Timezone</label>
            <select
              value={settings.timezone}
              onChange={(e: any) => {
                setSettings({ ...settings, timezone: e.target.value });
                saveSettings({ timezone: e.target.value });
              }}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option>UTC</option>
              <option>US/Eastern</option>
              <option>US/Central</option>
              <option>US/Mountain</option>
              <option>US/Pacific</option>
              <option>Europe/London</option>
              <option>Europe/Paris</option>
              <option>Asia/Tokyo</option>
              <option>Asia/Hong_Kong</option>
              <option>Australia/Sydney</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-green-600" />
          Notifications
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-900 font-medium">Daily Summary</p>
              <p className="text-sm text-gray-600">Get daily message summaries</p>
            </div>
            <button
              onClick={() => saveSettings({ daily_summary: !settings.daily_summary })}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                settings.daily_summary
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {settings.daily_summary ? (
                <ToggleRight className="w-5 h-5" />
              ) : (
                <ToggleLeft className="w-5 h-5" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div>
              <p className="text-gray-900 font-medium">Weekly Summary</p>
              <p className="text-sm text-gray-600">Get weekly message summaries</p>
            </div>
            <button
              onClick={() => saveSettings({ weekly_summary: !settings.weekly_summary })}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                settings.weekly_summary
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {settings.weekly_summary ? (
                <ToggleRight className="w-5 h-5" />
              ) : (
                <ToggleLeft className="w-5 h-5" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div>
              <p className="text-gray-900 font-medium">Commitment Alerts</p>
              <p className="text-sm text-gray-600">Get alerted when commitments are due</p>
            </div>
            <button
              onClick={() => saveSettings({ commitment_alerts: !settings.commitment_alerts })}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                settings.commitment_alerts
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {settings.commitment_alerts ? (
                <ToggleRight className="w-5 h-5" />
              ) : (
                <ToggleLeft className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Privacy Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-green-600" />
          Privacy
        </h3>
        <div className="space-y-4">
          <div>
            <p className="text-gray-900 font-medium mb-2">Privacy Zones</p>
            <p className="text-sm text-gray-600 mb-3">
              Messages containing these keywords will not be indexed or searched
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(settings.privacy_zones || []).map((zone: any) => (
                <div
                  key={zone}
                  className="flex items-center gap-2 bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm"
                >
                  {zone}
                  <button
                    onClick={() => removePrivacyZone(zone)}
                    className="hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newZone}
                onChange={(e: any) => setNewZone(e.target.value)}
                placeholder="Add privacy zone keyword..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={addPrivacyZone}
                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-900 font-medium">Data Retention</p>
                <p className="text-sm text-gray-600">Delete old messages after</p>
              </div>
              <select
                value={settings.data_retention_days}
                onChange={(e: any) => {
                  const days = parseInt(e.target.value);
                  setSettings({ ...settings, data_retention_days: days });
                  saveSettings({ data_retention_days: days });
                }}
                className="px-3 py-2 rounded-lg border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
                <option value="365">1 year</option>
                <option value="999999">Never</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Data Export Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Download className="w-5 h-5 text-green-600" />
          Data Export
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Download all your messages, chats, and metadata as a JSON file
        </p>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export Data
        </button>
      </div>
    </div>
  );
}

// ============================================================
// AI Assistant Section
// ============================================================
function AssistantSection() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sources, setSources] = useState<any[]>([]);

    async function sendMessage(e: React.FormEvent) {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMsg: ChatMessage = { role: 'user', content: input };
        const updated = [...messages, userMsg];
        setMessages(updated);
        setInput('');
        setLoading(true);
        setSources([]);

        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/chat-assistant', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({ messages: updated }),
            });
            const data = await response.json();
            setMessages([...updated, { role: 'assistant', content: data.reply || 'Sorry, I could not generate a response.' }]);
            setSources(data.sources || []);
        } catch (err) {
            setMessages([...updated, { role: 'assistant', content: 'An error occurred. Please try again.' }]);
        }
        setLoading(false);
    }

    return (
        <div className="flex flex-col h-[calc(100vh-220px)]">
            <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                        <Brain className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">AI Assistant</h2>
                        <p className="text-sm text-gray-500">Chat with your WhatsApp data — ask anything about your conversations</p>
                    </div>
                </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 bg-gray-50 rounded-xl p-4">
                {messages.length === 0 && (
                    <div className="text-center py-16 text-gray-400">
                        <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">Start a conversation</p>
                        <p className="text-sm">Ask me anything about your WhatsApp messages, contacts, or conversations.</p>
                        <div className="mt-6 flex flex-wrap gap-2 justify-center">
                            {['What did I talk about with Mom last week?', 'Find all shared links', 'Summarize my group chats'].map((q) => (
                                <button key={q} onClick={() => setInput(q)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-gray-100">
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${
                            msg.role === 'user'
                                ? 'bg-green-600 text-white rounded-br-md'
                                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-md">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        </div>
                    </div>
                )}
            </div>

            {/* Sources */}
            {sources.length > 0 && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {sources.slice(0, 4).map((s: any, i: number) => (
                        <div key={i} className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 whitespace-nowrap flex-shrink-0">
                            📌 {s.senderName || 'Unknown'} • {s.text?.substring(0, 40)}...
                        </div>
                    ))}
                </div>
            )}

            {/* Input */}
            <form onSubmit={sendMessage} className="flex gap-3">
                <input
                    type="text"
                    value={input}
                    onChange={(e: any) => setInput(e.target.value)}
                    placeholder="Ask about your conversations..."
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
                <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="px-5 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                    <Send className="w-4 h-4" />
                </button>
            </form>
        </div>
    );
}

// ============================================================
// Sentiment Analysis Section
// ============================================================
function SentimentSection() {
    const [chatId, setChatId] = useState('');
    const [period, setPeriod] = useState('30d');
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [chats, setChats] = useState<any[]>([]);

    useEffect(() => {
        async function loadChats() {
            const { data } = await supabase.from('chats').select('id, title').order('last_message_at', { ascending: false });
            setChats(data || []);
        }
        loadChats();
    }, []);

    async function analyzeSentiment() {
        if (!chatId) return;
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const res = await fetch('/api/sentiment/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ chatId, period }),
            });
            const data = await res.json();
            setResult(data);
        } catch (err) { console.error(err); }
        setLoading(false);
    }

    const sentimentIcon = (s: string) => {
        if (s === 'positive') return <Smile className="w-5 h-5 text-green-500" />;
        if (s === 'negative') return <Frown className="w-5 h-5 text-red-500" />;
        return <Meh className="w-5 h-5 text-yellow-500" />;
    };

    const sentimentColor = (s: string) => {
        if (s === 'positive') return 'text-green-600 bg-green-50';
        if (s === 'negative') return 'text-red-600 bg-red-50';
        return 'text-yellow-600 bg-yellow-50';
    };

    return (
        <div>
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center">
                    <Heart className="w-5 h-5 text-pink-600" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Mood & Sentiment</h2>
                    <p className="text-sm text-gray-500">Analyze the emotional tone of your conversations</p>
                </div>
            </div>

            <div className="flex gap-3 mb-6">
                <select value={chatId} onChange={(e: any) => setChatId(e.target.value)} className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">Select a chat...</option>
                    {chats.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <div className="flex bg-gray-100 rounded-xl p-0.5">
                    {['7d', '30d', '90d'].map((p) => (
                        <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-2 rounded-lg text-xs font-medium ${period === p ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{p}</button>
                    ))}
                </div>
                <button onClick={analyzeSentiment} disabled={loading || !chatId} className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Analyze
                </button>
            </div>

            {result && (
                <div className="space-y-6">
                    {/* Overall Score */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className={`p-4 rounded-xl ${sentimentColor(result.overallSentiment)}`}>
                            <div className="flex items-center gap-2 mb-1">{sentimentIcon(result.overallSentiment)}<span className="font-bold capitalize">{result.overallSentiment}</span></div>
                            <p className="text-2xl font-bold">{((result.score + 1) * 50).toFixed(0)}%</p>
                            <p className="text-xs opacity-75">Positivity Score</p>
                        </div>
                        <div className="p-4 rounded-xl bg-blue-50 text-blue-600">
                            <p className="text-sm font-medium mb-1">Topics Analyzed</p>
                            <p className="text-2xl font-bold">{result.topics?.length || 0}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-purple-50 text-purple-600">
                            <p className="text-sm font-medium mb-1">Timeline Points</p>
                            <p className="text-2xl font-bold">{result.moodTimeline?.length || 0}</p>
                        </div>
                    </div>

                    {/* Mood Timeline */}
                    {result.moodTimeline && result.moodTimeline.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-xl p-4">
                            <h3 className="font-semibold text-gray-900 mb-3">Mood Timeline</h3>
                            <div className="flex items-end gap-1 h-32">
                                {result.moodTimeline.map((t: any, i: number) => {
                                    const height = ((t.score + 1) / 2) * 100;
                                    const color = t.sentiment === 'positive' ? 'bg-green-400' : t.sentiment === 'negative' ? 'bg-red-400' : 'bg-yellow-400';
                                    return (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                            <div className={`w-full rounded-t-sm ${color}`} style={{ height: `${Math.max(height, 5)}%` }} title={`${t.date}: ${t.sentiment} (${t.score})`} />
                                            <span className="text-[9px] text-gray-400 rotate-[-45deg]">{t.date?.substring(5)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Topics */}
                    {result.topics && result.topics.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-xl p-4">
                            <h3 className="font-semibold text-gray-900 mb-3">Topic Sentiments</h3>
                            <div className="flex flex-wrap gap-2">
                                {result.topics.map((t: any, i: number) => (
                                    <div key={i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${sentimentColor(t.sentiment)}`}>
                                        {sentimentIcon(t.sentiment)}
                                        {t.topic}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Highlights */}
                    {result.highlights && (
                        <div className="grid grid-cols-2 gap-4">
                            {result.highlights.mostPositive && (
                                <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-green-600" /><span className="text-sm font-semibold text-green-700">Most Positive</span></div>
                                    <p className="text-sm text-green-800">{result.highlights.mostPositive}</p>
                                </div>
                            )}
                            {result.highlights.mostNegative && (
                                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2"><TrendingDown className="w-4 h-4 text-red-600" /><span className="text-sm font-semibold text-red-700">Most Negative</span></div>
                                    <p className="text-sm text-red-800">{result.highlights.mostNegative}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================
// Message Templates Section
// ============================================================
function TemplatesSection() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => { loadTemplates(); }, []);

    async function loadTemplates() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const res = await fetch('/api/templates', { headers: { 'Authorization': `Bearer ${session.data.session?.access_token}` } });
            const data = await res.json();
            setTemplates(data.templates || []);
        } catch (err) { console.error(err); }
        setLoading(false);
    }

    async function createTemplate() {
        if (!newName.trim() || !newContent.trim()) return;
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ name: newName, content: newContent, category: newCategory || 'general' }),
            });
            setNewName(''); setNewContent(''); setNewCategory(''); setShowForm(false);
            loadTemplates();
        } catch (err) { console.error(err); }
    }

    async function deleteTemplate(id: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/templates', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            loadTemplates();
        } catch (err) { console.error(err); }
    }

    function copyToClipboard(content: string, id: string) {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                        <FileText className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Message Templates</h2>
                        <p className="text-sm text-gray-500">Save and reuse your most common messages</p>
                    </div>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Template
                </button>
            </div>

            {showForm && (
                <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
                    <div className="space-y-3">
                        <input value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder="Template name" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                        <textarea value={newContent} onChange={(e: any) => setNewContent(e.target.value)} placeholder="Template content... use {{name}} for variables" rows={4} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
                        <div className="flex gap-3">
                            <input value={newCategory} onChange={(e: any) => setNewCategory(e.target.value)} placeholder="Category (optional)" className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                            <button onClick={createTemplate} className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">Save</button>
                            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>
            ) : templates.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No templates yet</p>
                    <p className="text-sm">Create your first template to save time on repetitive messages</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {templates.map((t) => (
                        <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <h3 className="font-semibold text-gray-900">{t.name}</h3>
                                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{t.category || 'general'}</span>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => copyToClipboard(t.content, t.id)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Copy">
                                        {copiedId === t.id ? <CheckSquare className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                                    </button>
                                    <button onClick={() => deleteTemplate(t.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
                                </div>
                            </div>
                            <p className="text-sm text-gray-600 whitespace-pre-wrap">{t.content}</p>
                            <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                                <span>Used {t.use_count || 0} times</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================================
// Reminders Section
// ============================================================
function RemindersSection() {
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [showForm, setShowForm] = useState(false);
    const [newText, setNewText] = useState('');
    const [newDueAt, setNewDueAt] = useState('');
    const [extracting, setExtracting] = useState(false);
    const [extracted, setExtracted] = useState<any[]>([]);
    const [chats, setChats] = useState<any[]>([]);
    const [extractChatId, setExtractChatId] = useState('');

    useEffect(() => {
        loadReminders();
        async function loadChats() {
            const { data } = await supabase.from('chats').select('id, title').order('last_message_at', { ascending: false });
            setChats(data || []);
        }
        loadChats();
    }, []);

    useEffect(() => { loadReminders(); }, [statusFilter]);

    async function loadReminders() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const res = await fetch(`/api/reminders?status=${statusFilter}`, { headers: { 'Authorization': `Bearer ${session.data.session?.access_token}` } });
            const data = await res.json();
            setReminders(data.reminders || []);
        } catch (err) { console.error(err); }
        setLoading(false);
    }

    async function createReminder() {
        if (!newText.trim() || !newDueAt) return;
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ text: newText, dueAt: new Date(newDueAt).toISOString() }),
            });
            setNewText(''); setNewDueAt(''); setShowForm(false);
            loadReminders();
        } catch (err) { console.error(err); }
    }

    async function markDone(id: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/reminders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ id, status: 'done' }),
            });
            loadReminders();
        } catch (err) { console.error(err); }
    }

    async function extractReminders() {
        if (!extractChatId) return;
        setExtracting(true);
        try {
            const session = await supabase.auth.getSession();
            const res = await fetch('/api/reminders/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ chatId: extractChatId }),
            });
            const data = await res.json();
            setExtracted(data.extracted || []);
        } catch (err) { console.error(err); }
        setExtracting(false);
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Bell className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Reminders</h2>
                        <p className="text-sm text-gray-500">Track follow-ups and deadlines from your conversations</p>
                    </div>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Reminder
                </button>
            </div>

            {showForm && (
                <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
                    <div className="space-y-3">
                        <input value={newText} onChange={(e: any) => setNewText(e.target.value)} placeholder="What do you need to remember?" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                        <div className="flex gap-3">
                            <input type="datetime-local" value={newDueAt} onChange={(e: any) => setNewDueAt(e.target.value)} className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                            <button onClick={createReminder} className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Extract */}
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2"><Brain className="w-4 h-4 text-purple-600" /><span className="text-sm font-semibold text-purple-700">AI Extract Reminders</span></div>
                <div className="flex gap-3">
                    <select value={extractChatId} onChange={(e: any) => setExtractChatId(e.target.value)} className="flex-1 px-3 py-2 border border-purple-200 rounded-xl text-sm bg-white">
                        <option value="">Select a chat to scan...</option>
                        {chats.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    <button onClick={extractReminders} disabled={extracting || !extractChatId} className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
                        {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Extract
                    </button>
                </div>
                {extracted.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {extracted.map((e: any, i: number) => (
                            <div key={i} className="bg-white rounded-lg p-3 flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-800">{e.text}</p>
                                    <p className="text-xs text-gray-400">{e.suggestedDueAt ? new Date(e.suggestedDueAt).toLocaleDateString() : 'No date'} • {(e.confidence * 100).toFixed(0)}% confidence</p>
                                </div>
                                <button onClick={() => { setNewText(e.text); setNewDueAt(e.suggestedDueAt?.substring(0, 16) || ''); setShowForm(true); }} className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">Add</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Filter */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5 w-fit mb-6">
                {['pending', 'overdue', 'done'].map((s) => (
                    <button key={s} onClick={() => setStatusFilter(s)} className={`px-4 py-2 rounded-lg text-xs font-medium capitalize ${statusFilter === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{s}</button>
                ))}
            </div>

            {loading ? (
                <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>
            ) : reminders.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No {statusFilter} reminders</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {reminders.map((r) => (
                        <div key={r.id} className={`bg-white border rounded-xl p-4 flex items-center justify-between ${r.isOverdue ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                            <div className="flex items-center gap-3">
                                {r.isOverdue ? <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" /> : <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />}
                                <div>
                                    <p className={`text-sm font-medium ${r.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{r.text}</p>
                                    <p className="text-xs text-gray-400">Due: {new Date(r.due_at).toLocaleString()}</p>
                                </div>
                            </div>
                            {r.status !== 'done' && (
                                <button onClick={() => markDone(r.id)} className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 flex items-center gap-1">
                                    <CheckSquare className="w-3 h-3" /> Done
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================================
// Labels Section
// ============================================================
function LabelsSection() {
    const [labels, setLabels] = useState<Label[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('#10b981');
    const [categorizing, setCategorizing] = useState(false);
    const [suggestions, setSuggestions] = useState<any[]>([]);

    useEffect(() => { loadLabels(); }, []);

    async function loadLabels() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const res = await fetch('/api/labels', { headers: { 'Authorization': `Bearer ${session.data.session?.access_token}` } });
            const data = await res.json();
            setLabels(data.labels || []);
        } catch (err) { console.error(err); }
        setLoading(false);
    }

    async function createLabel() {
        if (!newName.trim()) return;
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/labels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ name: newName, color: newColor }),
            });
            setNewName(''); setShowForm(false);
            loadLabels();
        } catch (err) { console.error(err); }
    }

    async function deleteLabel(id: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/labels', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            loadLabels();
        } catch (err) { console.error(err); }
    }

    async function autoCategorize() {
        setCategorizing(true);
        try {
            const session = await supabase.auth.getSession();
            const res = await fetch('/api/labels/auto-categorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
            });
            const data = await res.json();
            setSuggestions(data.suggestions || []);
        } catch (err) { console.error(err); }
        setCategorizing(false);
    }

    const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#6366f1'];

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <FolderOpen className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Labels & Folders</h2>
                        <p className="text-sm text-gray-500">Organize your chats into custom categories</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={autoCategorize} disabled={categorizing} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        {categorizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Auto-Categorize
                    </button>
                    <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 flex items-center gap-2">
                        <Plus className="w-4 h-4" /> New Label
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
                    <div className="space-y-3">
                        <input value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder="Label name" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-600">Color:</span>
                            <div className="flex gap-2">
                                {COLORS.map((c) => (
                                    <button key={c} onClick={() => setNewColor(c)} className={`w-7 h-7 rounded-full border-2 ${newColor === c ? 'border-gray-900 scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={createLabel} className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">Create</button>
                            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Suggestions */}
            {suggestions.length > 0 && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mb-6">
                    <h3 className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-2"><Brain className="w-4 h-4" /> AI Suggestions</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {suggestions.map((s: any, i: number) => (
                            <div key={i} className="bg-white rounded-lg p-3 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-800">{s.chatTitle}</p>
                                    <div className="flex gap-1 mt-1">{s.suggestedLabels?.map((l: string, j: number) => (
                                        <span key={j} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs">{l}</span>
                                    ))}</div>
                                </div>
                                <span className="text-xs text-gray-400">{(s.confidence * 100).toFixed(0)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>
            ) : labels.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <Tag className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No labels yet</p>
                    <p className="text-sm">Create labels to organize your chats, or let AI auto-categorize them</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {labels.map((l) => (
                        <div key={l.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: l.color }} />
                                    <h3 className="font-semibold text-gray-900">{l.name}</h3>
                                </div>
                                <button onClick={() => deleteLabel(l.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
                            </div>
                            <p className="text-sm text-gray-500">{l.chatCount || l.chat_ids?.length || 0} chats</p>
                            {l.is_smart && <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full mt-2 inline-block">Smart Label</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================================
// Reports Section
// ============================================================
function ReportsSection() {
    const [reportType, setReportType] = useState<'analytics' | 'chat_summary' | 'contact' | 'full'>('analytics');
    const [period, setPeriod] = useState('30d');
    const [loading, setLoading] = useState(false);
    const [reportHtml, setReportHtml] = useState<string | null>(null);
    const [chats, setChats] = useState<any[]>([]);
    const [selectedChat, setSelectedChat] = useState('');

    useEffect(() => {
        async function loadChats() {
            const { data } = await supabase.from('chats').select('id, title').order('last_message_at', { ascending: false });
            setChats(data || []);
        }
        loadChats();
    }, []);

    async function generateReport() {
        setLoading(true);
        setReportHtml(null);
        try {
            const session = await supabase.auth.getSession();
            const body: any = { type: reportType, period, format: 'html' };
            if (reportType === 'chat_summary' && selectedChat) body.chatId = selectedChat;
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            setReportHtml(data.html || '<p>Report generation failed</p>');
        } catch (err) { console.error(err); }
        setLoading(false);
    }

    function printReport() {
        if (!reportHtml) return;
        const win = window.open('', '_blank');
        if (win) { win.document.write(reportHtml); win.document.close(); win.print(); }
    }

    return (
        <div>
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                    <FileBarChart className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Reports</h2>
                    <p className="text-sm text-gray-500">Generate beautiful, printable reports from your data</p>
                </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {[
                        { id: 'analytics', label: 'Analytics Report', icon: '📊' },
                        { id: 'chat_summary', label: 'Chat Summary', icon: '💬' },
                        { id: 'contact', label: 'Contact Report', icon: '👤' },
                        { id: 'full', label: 'Full Report', icon: '📋' },
                    ].map((r) => (
                        <button key={r.id} onClick={() => setReportType(r.id as any)} className={`p-3 rounded-xl text-sm font-medium text-center border transition-colors ${reportType === r.id ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                            <span className="text-lg block mb-1">{r.icon}</span>
                            {r.label}
                        </button>
                    ))}
                </div>

                <div className="flex gap-3">
                    <div className="flex bg-gray-100 rounded-xl p-0.5">
                        {['7d', '30d', '90d'].map((p) => (
                            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-2 rounded-lg text-xs font-medium ${period === p ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{p}</button>
                        ))}
                    </div>
                    {reportType === 'chat_summary' && (
                        <select value={selectedChat} onChange={(e: any) => setSelectedChat(e.target.value)} className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                            <option value="">Select a chat...</option>
                            {chats.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                    )}
                    <button onClick={generateReport} disabled={loading} className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileBarChart className="w-4 h-4" />}
                        Generate
                    </button>
                </div>
            </div>

            {reportHtml && (
                <div>
                    <div className="flex justify-end gap-2 mb-3">
                        <button onClick={printReport} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                            <Download className="w-4 h-4" /> Print / Save PDF
                        </button>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <iframe srcDoc={reportHtml} className="w-full h-[600px] border-0" title="Report Preview" />
                    </div>
                </div>
            )}
        </div>
    );
}
