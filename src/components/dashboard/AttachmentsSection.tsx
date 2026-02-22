'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, Image, Film, Music, Search, StickyNote, Calendar, User } from 'lucide-react';

const FILE_TYPE_ICONS: Record<string, any> = {
      image: Image,
      video: Film,
      audio: Music,
      document: FileText,
      sticker: StickyNote,
};

const FILE_TYPE_COLORS: Record<string, string> = {
      image: 'bg-blue-50 text-blue-600',
      video: 'bg-purple-50 text-purple-600',
      audio: 'bg-orange-50 text-orange-600',
      document: 'bg-green-50 text-green-600',
      sticker: 'bg-pink-50 text-pink-600',
};

export default function AttachmentsSection() {
      const [attachments, setAttachments] = useState<any[]>([]);
      const [filter, setFilter] = useState('all');
      const [searchQuery, setSearchQuery] = useState('');
      const [loading, setLoading] = useState(true);
      const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
          loadAttachments();
  }, [filter]);

  useEffect(() => {
          loadCounts();
  }, []);

  async function loadCounts() {
          const { data } = await supabase
            .from('attachments')
            .select('file_type');
          if (data) {
                    const c: Record<string, number> = { all: data.length };
                    data.forEach((a: any) => {
                                c[a.file_type] = (c[a.file_type] || 0) + 1;
                    });
                    setCounts(c);
          }
  }

  async function loadAttachments() {
          setLoading(true);
          let query = supabase
            .from('attachments')
            .select('*, messages(sender_name, timestamp, chat_id)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (filter !== 'all') {
                  query = query.eq('file_type', filter);
        }

        const { data } = await query;
          setAttachments(data || []);
          setLoading(false);
  }

  const filtered = useMemo(() => {
          if (!searchQuery.trim()) return attachments;
          const q = searchQuery.toLowerCase();
          return attachments.filter((att: any) =>
                    att.file_name?.toLowerCase().includes(q) ||
                    att.messages?.sender_name?.toLowerCase().includes(q) ||
                    att.file_type?.toLowerCase().includes(q) ||
                    att.mime_type?.toLowerCase().includes(q)
                                        );
  }, [attachments, searchQuery]);

  const formatDate = (dateStr: string) => {
          if (!dateStr) return '';
          const d = new Date(dateStr);
          return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
          <div>
              {/* Search Bar */}
                <div className="mb-4">
                        <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                  <input
                                                  type="text"
                                                  placeholder="Search files by name, sender, or type..."
                                                  value={searchQuery}
                                                  onChange={(e) => setSearchQuery(e.target.value)}
                                                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                                />
                        </div>div>
                </div>div>
          
              {/* Filter Tabs with Counts */}
                <div className="flex gap-2 mb-6 flex-wrap">
                    {['all', 'image', 'document', 'audio', 'video'].map((type) => (
                        <button
                                        key={type}
                                        onClick={() => setFilter(type)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium capitalize flex items-center gap-1.5 ${
                                                          filter === type
                                                            ? 'bg-green-600 text-white'
                                                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                                        }`}
                                      >
                            {type}
                            {counts[type] !== undefined && (
                                                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                                                            filter === type ? 'bg-green-700 text-green-100' : 'bg-gray-100 text-gray-500'
                                                        }`}>
                                                            {counts[type]}
                                                        </span>span>
                                    )}
                        </button>button>
                      ))}
                </div>div>
          
              {/* Results Count */}
              {!loading && (
                      <p className="text-xs text-gray-400 mb-3">
                                Showing {filtered.length} file{filtered.length !== 1 ? 's' : ''}
                          {searchQuery && ` matching "${searchQuery}"`}
                      </p>p>
                )}
          
              {/* Loading State */}
              {loading ? (
                      <div className="text-center py-12 text-gray-400">Loading files...</div>div>
                    ) : filtered.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                          {searchQuery ? `No files found matching "${searchQuery}"` : 'No files in this category'}
                      </div>div>
                    ) : (
                      /* File Grid */
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {filtered.map((att: any) => {
                                      const Icon = FILE_TYPE_ICONS[att.file_type] || FileText;
                                      const colorClass = FILE_TYPE_COLORS[att.file_type] || 'bg-gray-50 text-gray-600';
                          
                                      return (
                                                        <div
                                                                            key={att.id}
                                                                            className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-green-200 transition-all cursor-default group"
                                                                          >
                                                            {/* Icon Area */}
                                                                        <div className={`w-full h-28 rounded-lg mb-3 flex items-center justify-center ${colorClass.split(' ')[0]}`}>
                                                                                          <Icon className={`w-10 h-10 ${colorClass.split(' ')[1]}`} />
                                                                        </div>div>
                                                        
                                                            {/* File Name */}
                                                                        <p className="text-sm font-medium text-gray-900 truncate" title={att.file_name}>
                                                                            {att.file_name}
                                                                        </p>p>
                                                        
                                                            {/* Metadata */}
                                                                        <div className="mt-2 space-y-1">
                                                                                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                                                                              <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium capitalize ${colorClass}`}>
                                                                                                                  {att.file_type}
                                                                                                                  </span>span>
                                                                                              {att.mime_type && att.mime_type !== 'application/octet-stream' && (
                                                                                                    <span className="text-gray-300">|</span>span>
                                                                                                              )}
                                                                                              {att.mime_type && att.mime_type !== 'application/octet-stream' && (
                                                                                                    <span className="truncate">{att.mime_type.split('/')[1]}</span>span>
                                                                                                              )}
                                                                                              </div>div>
                                                                            {att.messages?.sender_name && (
                                                                                                  <div className="flex items-center gap-1 text-xs text-gray-400">
                                                                                                                        <User className="w-3 h-3" />
                                                                                                                        <span className="truncate">{att.messages.sender_name}</span>span>
                                                                                                      </div>div>
                                                                                          )}
                                                                            {att.created_at && (
                                                                                                  <div className="flex items-center gap-1 text-xs text-gray-400">
                                                                                                                        <Calendar className="w-3 h-3" />
                                                                                                                        <span>{formatDate(att.created_at)}</span>span>
                                                                                                      </div>div>
                                                                                          )}
                                                                        </div>div>
                                                        </div>div>
                                                      );
                      })}
                      </div>div>
                )}
          </div>div>
        );
}</div>
