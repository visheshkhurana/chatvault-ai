'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

interface Chat {
    id: string;
    title: string;
    chat_type: string;
    category: string | null;
    last_message_at: string;
    participant_count: number;
}

export default function SummariesSection() {
    const [summaries, setSummaries] = useState<any[]>([]);
    const [generating, setGenerating] = useState(false);
    const [selectedChatForSummary, setSelectedChatForSummary] = useState('');
    const [chats, setChats] = useState<Chat[]>([]);
    const [genError, setGenError] = useState<string | null>(null);
    const [genSuccess, setGenSuccess] = useState<string | null>(null);

    useEffect(() => {
          loadChats();
          loadSummaries();
    }, []);

    async function loadChats() {
        const { data } = await supabase
          .from('chats')
          .select('*')
          .order('last_message_at', { ascending: false });
        setChats(data || []);
    }

    async function loadSummaries() {
          const { data } = await supabase
                  .from('chat_summaries')
                  .select('*, chats(title)')
                  .order('created_at', { ascending: false })
                  .limit(20);
          setSummaries(data || []);
    }

    async function generateSummary() {
          if (!selectedChatForSummary) {
              setGenError('Please select a chat first');
              return;
          }
          setGenerating(true);
          setGenError(null);
          setGenSuccess(null);
          try {
                  const session = await supabase.auth.getSession();
                  const response = await fetch('/api/summarize', {
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
                  const data = await response.json();
                  if (!response.ok) {
                      setGenError(data.error || 'Failed to generate summary');
                  } else {
                      setGenSuccess('Summary generated successfully');
                      await loadSummaries();
                  }
          } catch (err) {
                  console.error('Summary error:', err);
                  setGenError('Failed to generate summary. Please try again.');
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
                {genError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                        {genError}
                    </div>
                )}
                {genSuccess && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                        {genSuccess}
                    </div>
                )}

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
