'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, FileText, MessageSquare, Calendar, Filter, ChevronDown, Loader2, LogOut, Upload } from 'lucide-react';

// ============================================================
// ChatVault AI - Dashboard Page
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

export default function DashboardPage() {
    const [query, setQuery] = useState('');
    const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [activeTab, setActiveTab] = useState<'search' | 'chats' | 'attachments' | 'summaries'>('search');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [user, setUser] = useState<any>(null);

  useEffect(() => {
        checkAuth();
        loadChats();
  }, []);

  async function checkAuth() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
                window.location.href = '/login';
                return;
        }
        setUser(user);
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
                setSearchResult(data);
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
                                            <h1 className="text-xl font-bold text-gray-900">ChatVault AI</h1>
                                </div>
                                <div className="flex items-center gap-4">
                                            <span className="text-sm text-gray-500">{user?.email}</span>
                                            <button onClick={handleSignOut} className="text-gray-500 hover:text-gray-700">
                                                          <LogOut className="w-5 h-5" />
                                            </button>
                                </div>
                      </div>
              </header>
        
              <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Tabs */}
                      <div className="flex gap-1 mb-8 bg-gray-100 rounded-lg p-1 w-fit">
                        {(['search', 'chats', 'attachments', 'summaries'] as const).map((tab) => (
                      <button
                                      key={tab}
                                      onClick={() => setActiveTab(tab)}
                                      className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
                                                        activeTab === tab
                                                          ? 'bg-white text-gray-900 shadow-sm'
                                                          : 'text-gray-500 hover:text-gray-700'
                                      }`}
                                    >
                        {tab}
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
                                                                                                      onChange={(e) => setQuery(e.target.value)}
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
                                                                                  onChange={(e) => setSelectedChat(e.target.value || null)}
                                                                                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white"
                                                                                >
                                                                                <option value="">All Chats</option>
                                                                {chats.map((chat) => (
                                                                                                      <option key={chat.id} value={chat.id}>{chat.title}</option>
                                                                                                    ))}
                                                              </select>
                                                              <input
                                                                                  type="date"
                                                                                  value={dateFrom}
                                                                                  onChange={(e) => setDateFrom(e.target.value)}
                                                                                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white"
                                                                                  placeholder="From date"
                                                                                />
                                                              <input
                                                                                  type="date"
                                                                                  value={dateTo}
                                                                                  onChange={(e) => setDateTo(e.target.value)}
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
                                                                              {searchResult.citations.map((cite, i) => (
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
                                                                              {searchResult.relatedAttachments.map((att) => (
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
                                                {chats.map((chat) => (
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
                                        messages.map((msg) => (
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
                  {attachments.map((att) => (
                      <a
                                    key={att.id}
                                    href={att.storage_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
                                  >
                        {att.file_type === 'image' ? (
                                                  <div className="w-full h-32 bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                                                                  <img src={att.storage_url} alt={att.file_name} className="max-h-full max-w-full object-cover rounded-lg" />
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
                                    onChange={(e) => setSelectedChatForSummary(e.target.value)}
                                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                  >
                                  <option value="">Select a chat...</option>
                          {chats.map((chat) => (
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
                  {summaries.map((summary) => (
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
