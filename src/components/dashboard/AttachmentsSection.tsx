'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText } from 'lucide-react';

export default function AttachmentsSection() {
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
