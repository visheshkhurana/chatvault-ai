'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BarChart3, Calendar, Share2, TrendingUp, Loader2 } from 'lucide-react';

interface WeeklyRecap {
    id: string;
    week_start: string;
    week_end: string;
    messages_count: number;
    active_chats: number;
    commitments_made: number;
    commitments_completed: number;
    summary_text: string;
    key_topics?: string[];
    top_contacts?: Array<{ name: string; count: number }>;
}

export default function WeeklyRecapSection() {
    const [latestRecap, setLatestRecap] = useState<WeeklyRecap | null>(null);
    const [historicalRecaps, setHistoricalRecaps] = useState<WeeklyRecap[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadRecaps();
    }, []);

    async function loadRecaps() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/weekly-recap', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            const recaps = data.recaps || [];
            if (recaps.length > 0) {
                setLatestRecap(recaps[0]);
                setHistoricalRecaps(recaps.slice(1));
            }
        } catch (err) {
            console.error('Failed to load recaps:', err);
        }
        setLoading(false);
    }

    async function shareRecap() {
        if (!latestRecap) return;
        const shareUrl = `${window.location.origin}/recap/${latestRecap.id}`;
        try {
            await navigator.clipboard.writeText(shareUrl);
            alert('Share URL copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy URL:', err);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    if (!latestRecap) {
        return (
            <div className="bg-white rounded-xl border border-surface-200 p-12 text-center">
                <BarChart3 className="w-8 h-8 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-600 font-medium">No weekly recap available yet</p>
                <p className="text-surface-400 text-sm mt-1">Check back when you have more messages</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Latest Recap */}
            <div className="bg-gradient-to-br from-brand-50 to-brand-100 rounded-xl border border-brand-200 p-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-brand-900">This Week's Recap</h2>
                        <p className="text-sm text-brand-700 mt-1">
                            {new Date(latestRecap.week_start).toLocaleDateString()} - {new Date(latestRecap.week_end).toLocaleDateString()}
                        </p>
                    </div>
                    <button
                        onClick={shareRecap}
                        className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 flex items-center gap-2"
                    >
                        <Share2 className="w-4 h-4" />
                        Share
                    </button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-surface-500 font-medium mb-1">Messages</p>
                        <p className="text-2xl font-bold text-surface-900">{latestRecap.messages_count}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-surface-500 font-medium mb-1">Active Chats</p>
                        <p className="text-2xl font-bold text-surface-900">{latestRecap.active_chats}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-surface-500 font-medium mb-1">Commitments Made</p>
                        <p className="text-2xl font-bold text-surface-900">{latestRecap.commitments_made}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-surface-500 font-medium mb-1">Completed</p>
                        <p className="text-2xl font-bold text-green-600">{latestRecap.commitments_completed}</p>
                    </div>
                </div>

                {/* Summary */}
                <div className="mb-4">
                    <p className="text-sm text-brand-900 leading-relaxed">{latestRecap.summary_text}</p>
                </div>

                {/* Key Topics */}
                {latestRecap.key_topics && latestRecap.key_topics.length > 0 && (
                    <div className="mb-4">
                        <p className="text-xs font-semibold text-brand-800 mb-2 uppercase">Key Topics</p>
                        <div className="flex flex-wrap gap-2">
                            {latestRecap.key_topics.map((topic, i) => (
                                <span key={i} className="text-xs bg-brand-200 text-brand-900 px-3 py-1 rounded-full">
                                    {topic}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Top Contacts */}
                {latestRecap.top_contacts && latestRecap.top_contacts.length > 0 && (
                    <div className="border-t border-brand-200 pt-4">
                        <p className="text-xs font-semibold text-brand-800 mb-3 uppercase">Top Contacts</p>
                        <div className="space-y-2">
                            {latestRecap.top_contacts.slice(0, 5).map((contact, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <span className="text-sm text-brand-900">{contact.name}</span>
                                    <span className="text-xs bg-brand-200 text-brand-900 px-2 py-1 rounded">
                                        {contact.count} messages
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Historical Recaps */}
            {historicalRecaps.length > 0 && (
                <div>
                    <h3 className="font-semibold text-surface-900 mb-3 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-surface-500" />
                        Previous Recaps
                    </h3>
                    <div className="space-y-2">
                        {historicalRecaps.map((recap) => (
                            <div key={recap.id} className="bg-white rounded-xl border border-surface-200 p-4 hover:shadow-sm transition-shadow">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <p className="font-medium text-surface-900">Week of {new Date(recap.week_start).toLocaleDateString()}</p>
                                        <p className="text-xs text-surface-500 mt-0.5">
                                            {recap.messages_count} messages • {recap.active_chats} chats • {recap.commitments_completed}/{recap.commitments_made} commitments
                                        </p>
                                    </div>
                                    <TrendingUp className="w-4 h-4 text-surface-300" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
