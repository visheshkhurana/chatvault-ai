'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Heart, Smile, Frown, Meh, Loader2, Sparkles, TrendingUp, TrendingDown } from 'lucide-react';

export default function SentimentSection() {
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
