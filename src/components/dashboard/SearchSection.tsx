'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Loader2, FileText } from 'lucide-react';

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

export default function SearchSection() {
    const [query, setQuery] = useState('');
    const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat] = useState<string | null>(null);

    useEffect(() => {
        loadChats();
    }, []);

    const loadChats = async () => {
        const { data } = await supabase
          .from('chats')
          .select('*')
          .order('last_message_at', { ascending: false });
        setChats(data || []);
    };

    const handleSearch = async (e: React.FormEvent) => {
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
    };

    return (
        <div>
            <form onSubmit={handleSearch} className="mb-8">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e: any) => setQuery(e.target.value)}
                            placeholder="Search your messages... (e.g., 'Find Neha's MRI report')"
                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-surface-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-surface-900"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSearching}
                        className="px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Search
                    </button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-3 sm:gap-4 mt-4">
                    <select
                        value={selectedChat || ''}
                        onChange={(e: any) => setSelectedChat(e.target.value || null)}
                        className="px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 bg-white"
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
                        className="px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 bg-white"
                        placeholder="From date"
                    />
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e: any) => setDateTo(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-700 bg-white"
                        placeholder="To date"
                    />
                </div>
            </form>

            {/* Search Results */}
            {searchResult && (
                <div className="space-y-6">
                    <div className="bg-white rounded-xl p-6 border border-surface-200">
                        <h3 className="font-semibold text-surface-900 mb-3">Answer</h3>
                        <p className="text-surface-700 whitespace-pre-wrap">{searchResult.answer}</p>
                    </div>

                    {searchResult.citations.length > 0 && (
                        <div className="bg-white rounded-xl p-6 border border-surface-200">
                            <h3 className="font-semibold text-surface-900 mb-3">Sources</h3>
                            <div className="space-y-3">
                                {searchResult.citations.map((cite: any, i: number) => (
                                    <div key={i} className="p-3 bg-surface-50 rounded-lg">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-medium text-brand-700 bg-brand-100 px-2 py-0.5 rounded">
                                                {Math.round(cite.similarity * 100)}% match
                                            </span>
                                            {cite.senderName && (
                                                <span className="text-xs text-surface-500">{cite.senderName}</span>
                                            )}
                                            {cite.timestamp && (
                                                <span className="text-xs text-surface-400">
                                                  {new Date(cite.timestamp).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-surface-600">{cite.text}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {searchResult.relatedAttachments.length > 0 && (
                        <div className="bg-white rounded-xl p-6 border border-surface-200">
                            <h3 className="font-semibold text-surface-900 mb-3">Related Files</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {searchResult.relatedAttachments.map((att: any) => (
                                    <a
                                        key={att.id}
                                        href={att.storageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 p-3 bg-surface-50 rounded-lg hover:bg-surface-100"
                                    >
                                        <FileText className="w-8 h-8 text-blue-500" />
                                        <div>
                                            <p className="text-sm font-medium text-surface-900 truncate">{att.fileName}</p>
                                            <p className="text-xs text-surface-500">{att.fileType}</p>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
