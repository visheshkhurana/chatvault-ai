'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageSquare, Users, Loader2 } from 'lucide-react';

interface AnalyticsData {
    total_messages: number;
    active_chats: number;
    top_contact: string;
    message_volume: Array<{ date: string; count: number }>;
    hourly_distribution: Array<{ hour: number; count: number }>;
    top_contacts: Array<{ name: string; count: number }>;
    message_types: Array<{ type: string; count: number }>;
}

export default function AnalyticsSection() {
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
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    const maxVolume = Math.max(...(analytics.message_volume || []).map((v: any) => v.count), 1);
    const maxHourly = Math.max(...(analytics.hourly_distribution || []).map((v: any) => v.count), 1);

    function formatDate(dateStr: string): string {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch {
            return dateStr;
        }
    }

    return (
        <div className="space-y-6">
            {/* Period Selector */}
            <div className="flex gap-2">
                {(['7d', '30d', '90d'] as const).map((p) => (
                    <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            period === p ? 'bg-brand-600 text-white' : 'bg-white text-surface-700 border border-surface-200'
                        }`}
                    >
                        {p === '7d' ? 'Last 7 days' : p === '30d' ? 'Last 30 days' : 'Last 90 days'}
                    </button>
                ))}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-surface-600 text-sm">Total Messages</p>
                            <p className="text-3xl font-bold text-surface-900 mt-2">{analytics.total_messages.toLocaleString()}</p>
                        </div>
                        <MessageSquare className="w-12 h-12 text-brand-100" />
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-surface-600 text-sm">Active Chats</p>
                            <p className="text-3xl font-bold text-surface-900 mt-2">{analytics.active_chats}</p>
                        </div>
                        <MessageSquare className="w-12 h-12 text-blue-100" />
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-surface-600 text-sm">Top Contact</p>
                            <p className="text-xl font-bold text-surface-900 mt-2 truncate">{analytics.top_contact}</p>
                        </div>
                        <Users className="w-12 h-12 text-purple-100" />
                    </div>
                </div>
            </div>

            {/* Message Volume Chart */}
            {analytics.message_volume && analytics.message_volume.length > 0 && (
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <h3 className="font-semibold text-surface-900 mb-4">Message Volume</h3>
                    <div className="flex items-end gap-2 h-40">
                        {analytics.message_volume.map((item: any, i: number) => (
                            <div key={i} className="flex flex-col items-center gap-2" style={{ flex: '1 1 0', maxWidth: '60px' }}>
                                <div
                                    className="w-full bg-brand-600 rounded-t-lg transition-all"
                                    style={{ height: `${Math.max((item.count / maxVolume) * 150, 2)}px` }}
                                    title={`${formatDate(item.date)}: ${item.count} messages`}
                                />
                                <span className="text-xs text-surface-600 text-center truncate w-full">{formatDate(item.date)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Hourly Distribution */}
            {analytics.hourly_distribution && analytics.hourly_distribution.length > 0 && (
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <h3 className="font-semibold text-surface-900 mb-4">Messages by Hour</h3>
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
                    <div className="flex justify-between text-xs text-surface-600 mt-2">
                        <span>00:00</span>
                        <span>12:00</span>
                        <span>23:00</span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Contacts */}
                {analytics.top_contacts && analytics.top_contacts.length > 0 && (
                    <div className="bg-white rounded-xl border border-surface-200 p-6">
                        <h3 className="font-semibold text-surface-900 mb-4">Top Contacts</h3>
                        <div className="space-y-3">
                            {analytics.top_contacts.map((contact: any, i: number) => (
                                <div key={i} className="flex items-center justify-between">
                                    <span className="text-surface-700 truncate">{contact.name}</span>
                                    <span className="text-sm text-surface-500 font-medium">{contact.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Message Type Breakdown */}
                {analytics.message_types && analytics.message_types.length > 0 && (
                    <div className="bg-white rounded-xl border border-surface-200 p-6">
                        <h3 className="font-semibold text-surface-900 mb-4">Message Types</h3>
                        <div className="space-y-3">
                            {analytics.message_types.map((type: any, i: number) => (
                                <div key={i}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm text-surface-700 capitalize">{type.type}</span>
                                        <span className="text-sm text-surface-500 font-medium">{type.count}</span>
                                    </div>
                                    <div className="w-full bg-surface-200 rounded-full h-2">
                                        <div
                                            className="bg-brand-600 h-2 rounded-full"
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
