'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, Image, Film, Music, Search, StickyNote, Calendar, User, X, Download, ExternalLink, AlertCircle, Play, Eye } from 'lucide-react';

const FILE_TYPE_ICONS: Record<string, any> = {
  image: Image, video: Film, audio: Music, document: FileText, sticker: StickyNote,
};

const FILE_TYPE_COLORS: Record<string, string> = {
  image: 'bg-blue-50 text-blue-600',
  video: 'bg-purple-50 text-purple-600',
  audio: 'bg-orange-50 text-orange-600',
  document: 'bg-green-50 text-green-600',
  sticker: 'bg-pink-50 text-pink-600',
};

interface MediaPreviewState {
  attachment: any; signedUrl: string | null; loading: boolean; error: string | null;
}

export default function AttachmentsSection() {
  const [attachments, setAttachments] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<MediaPreviewState | null>(null);

  useEffect(() => { loadAttachments(); }, [filter]);
  useEffect(() => { loadCounts(); }, []);
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  async function loadCounts() {
    const { data } = await supabase.from('attachments').select('file_type');
    if (data) {
      const c: Record<string, number> = { all: data.length };
      data.forEach((a: any) => { c[a.file_type] = (c[a.file_type] || 0) + 1; });
      setCounts(c);
    }
  }

  async function loadAttachments() {
    setLoading(true);
    let query = supabase.from('attachments').select('*, messages(sender_name, timestamp, chat_id)').order('created_at', { ascending: false }).limit(100);
    if (filter !== 'all') { query = query.eq('file_type', filter); }
    const { data } = await query;
    setAttachments(data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return attachments;
    const q = searchQuery.toLowerCase();
    return attachments.filter((att: any) =>
      att.file_name?.toLowerCase().includes(q) || att.messages?.sender_name?.toLowerCase().includes(q) || att.file_type?.toLowerCase().includes(q) || att.mime_type?.toLowerCase().includes(q)
    );
  }, [attachments, searchQuery]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const openPreview = useCallback(async (att: any) => {
    const hasFile = att.storage_key && att.storage_key !== null;
    setPreview({
      attachment: att, signedUrl: null, loading: hasFile,
      error: hasFile ? null : 'This file was imported from a chat export. The actual media file is not stored yet. Future messages received via WhatsApp will have playable media.',
    });
    if (hasFile) {
      try {
        const res = await fetch(`/api/attachments/${att.id}`);
        if (!res.ok) throw new Error('Failed to load file');
        const data = await res.json();
        setPreview(prev => prev ? { ...prev, signedUrl: data.data?.url || data.url, loading: false } : null);
      } catch (err) {
        setPreview(prev => prev ? { ...prev, loading: false, error: 'Failed to load media. Please try again.' } : null);
      }
    }
  }, []);

  const renderMediaPreview = () => {
    if (!preview) return null;
    const { attachment: att, signedUrl, loading: mediaLoading, error } = preview;
    const Icon = FILE_TYPE_ICONS[att.file_type] || FileText;
    const colorClass = FILE_TYPE_COLORS[att.file_type] || 'bg-gray-50 text-gray-600';
    const bgColor = colorClass.split(' ')[0];
    const txtColor = colorClass.split(' ')[1];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgColor}`}>
                <Icon className={`w-5 h-5 ${txtColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{att.file_name}</p>
                <p className="text-xs text-gray-500">
                  {att.file_type} {att.mime_type && att.mime_type !== 'application/octet-stream' ? `\u2022 ${att.mime_type}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {signedUrl && (
                <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" title="Open in new tab">
                  <ExternalLink className="w-5 h-5" />
                </a>
              )}
              {signedUrl && (
                <a href={signedUrl} download={att.file_name} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" title="Download">
                  <Download className="w-5 h-5" />
                </a>
              )}
              <button onClick={() => setPreview(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-6">
            {mediaLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-10 h-10 border-3 border-green-200 border-t-green-600 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-500">Loading media...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${bgColor}`}>
                  <Icon className={`w-10 h-10 ${txtColor}`} />
                </div>
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-md">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">{error}</p>
                </div>
              </div>
            ) : signedUrl ? (
              <div className="flex items-center justify-center">
                {att.file_type === 'image' || att.file_type === 'sticker' ? (
                  <img src={signedUrl} alt={att.file_name} className="max-w-full max-h-[60vh] rounded-lg object-contain" />
                ) : att.file_type === 'video' ? (
                  <video controls className="max-w-full max-h-[60vh] rounded-lg">
                    <source src={signedUrl} type={att.mime_type || 'video/mp4'} />
                    Your browser does not support video playback.
                  </video>
                ) : att.file_type === 'audio' ? (
                  <div className="w-full max-w-md">
                    <div className={`w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-6 ${bgColor}`}>
                      <Music className={`w-12 h-12 ${txtColor}`} />
                    </div>
                    <audio controls className="w-full">
                      <source src={signedUrl} type={att.mime_type || 'audio/ogg'} />
                      Your browser does not support audio playback.
                    </audio>
                  </div>
                ) : att.mime_type === 'application/pdf' ? (
                  <iframe src={signedUrl} className="w-full h-[60vh] rounded-lg border" title={att.file_name} />
                ) : (
                  <div className="flex flex-col items-center py-8">
                    <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${bgColor}`}>
                      <FileText className={`w-10 h-10 ${txtColor}`} />
                    </div>
                    <p className="text-sm text-gray-600 mb-4">This file type cannot be previewed in the browser.</p>
                    <a href={signedUrl} download={att.file_name} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download File
                    </a>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-xs text-gray-500">
            {att.messages?.sender_name && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {att.messages.sender_name}
              </span>
            )}
            {att.created_at && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(att.created_at)}
              </span>
            )}
            {att.file_size_bytes && (
              <span>{(att.file_size_bytes / 1024).toFixed(0)} KB</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
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
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {['all', 'image', 'document', 'audio', 'video'].map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize flex items-center gap-1.5 ${filter === type ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
          >
            {type}
            {counts[type] !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === type ? 'bg-green-700 text-green-100' : 'bg-gray-100 text-gray-500'}`}>
                {counts[type]}
              </span>
            )}
          </button>
        ))}
      </div>

      {!loading && (
        <p className="text-xs text-gray-400 mb-3">
          Showing {filtered.length} file{filtered.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
        </p>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading files...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {searchQuery ? `No files found matching "${searchQuery}"` : 'No files in this category'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((att: any) => {
            const Icon = FILE_TYPE_ICONS[att.file_type] || FileText;
            const colorClass = FILE_TYPE_COLORS[att.file_type] || 'bg-gray-50 text-gray-600';
            const hasFile = att.storage_key !== null && att.storage_key !== undefined;
            const bgColor = colorClass.split(' ')[0];
            const txtColor = colorClass.split(' ')[1];

            return (
              <div
                key={att.id}
                onClick={() => openPreview(att)}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-green-200 transition-all cursor-pointer group relative"
              >
                <div className={`w-full h-28 rounded-lg mb-3 flex items-center justify-center relative ${bgColor}`}>
                  <Icon className={`w-10 h-10 ${txtColor}`} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-all flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2 shadow-sm">
                      {att.file_type === 'video' || att.file_type === 'audio' ? (
                        <Play className="w-5 h-5 text-gray-700" />
                      ) : (
                        <Eye className="w-5 h-5 text-gray-700" />
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-sm font-medium text-gray-900 truncate" title={att.file_name}>
                  {att.file_name}
                </p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium capitalize ${colorClass}`}>
                      {att.file_type}
                    </span>
                    {!hasFile && (
                      <span className="text-xs text-amber-500" title="Media not stored">•</span>
                    )}
                    {att.mime_type && att.mime_type !== 'application/octet-stream' && (
                      <span className="text-gray-300">|</span>
                    )}
                    {att.mime_type && att.mime_type !== 'application/octet-stream' && (
                      <span className="truncate">{att.mime_type.split('/')[1]}</span>
                    )}
                  </div>
                  {att.messages?.sender_name && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <User className="w-3 h-3" />
                      <span className="truncate">{att.messages.sender_name}</span>
                    </div>
                  )}
                  {att.created_at && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(att.created_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {renderMediaPreview()}
    </div>
  );
}
