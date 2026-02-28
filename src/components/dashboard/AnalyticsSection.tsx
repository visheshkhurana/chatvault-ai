'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
    MessageSquare, Users, Loader2, TrendingUp, TrendingDown,
    Clock, Target, Send, Inbox, Flame, BarChart3, ArrowUpRight,
    ArrowDownRight, Minus, Calendar, Zap, CheckCircle2
} from 'lucide-react';

interface AnalyticsData {
    period: string;
    startDate: string;
    endDate: string;
    totalMessages: number;
    sentMessages: number;
    receivedMessages: number;
    uniqueContacts: number;
    activeDays: number;
    maxStreak: number;
    changePercent: number;
    previousPeriodMessages: number;
    commitmentStats: {
        pending: number;
        completed: number;
        total: number;
    };
    message_volume: Array<{ date: string; count: number }>;
    hourly_distribution: Array<{ hour: number; count: number }>;
    top_contacts: Array<{ contactId: string; messageCount: number; name: string }>;
    chat_activity: Array<{ chatId: string; messageCount: number; title: string }>;
    message_types: Array<{ type: string; count: number }>;
    responseTimeStats: {
        average: number;
        median: number;
        min: number;
        max: number;
        count: number;
    };
    activityHeatmap: Array<{ dayOfWeek: number; hour: number; count: number }>;
    weeklyTrend: Array<{ week: number; count: number; startDate: string }>;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = ['12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p'];

function formatResponseTime(minutes: number): string {
    if (minutes < 1) return '<1 min';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
}

function TrendBadge({ value, suffix = '' }: { value: number; suffix?: string }) {
    if (value === 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-xs text-surface-500 font-medium">
                <Minus className="w-3 h-3" /> No change
            </span>
        );
    }
    const isPositive = value > 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(value)}{suffix}
        </span>
    );
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
                headers: { 'Authorization': `Bearer ${session.data.session?.access_token}` },
            });
            const data = await response.json();
            if (data.success !== false) {
                setAnalytics({
                    period: data.period || period,
                    startDate: data.startDate || '',
                    endDate: data.endDate || '',
                    totalMessages: data.totalMessages || 0,
                    sentMessages: data.sentMessages || 0,
                    receivedMessages: data.receivedMessages || 0,
                    uniqueContacts: data.uniqueContacts || 0,
                    activeDays: data.activeDays || 0,
                    maxStreak: data.maxStreak || 0,
                    changePercent: data.changePercent || 0,
                    previousPeriodMessages: data.previousPeriodMessages || 0,
                    commitmentStats: data.commitmentStats || { pending: 0, completed: 0, total: 0 },
                    message_volume: data.messageVolume || [],
                    hourly_distribution: data.hourlyDistribution || [],
                    top_contacts: data.topContacts || [],
                    chat_activity: data.chatActivity || [],
                    message_types: data.messageTypeBreakdown || [],
                    responseTimeStats: data.responseTimeStats || { average: 0, median: 0, min: 0, max: 0, count: 0 },
                    activityHeatmap: data.activityHeatmap || [],
                    weeklyTrend: data.weeklyTrend || [],
                });
            }
        } catch (err) {
            console.error('Failed to load analytics:', err);
        }
        setLoading(false);
    }

    const heatmapData = useMemo(() => {
        if (!analytics?.activityHeatmap) return [];
        return analytics.activityHeatmap;
    }, [analytics?.activityHeatmap]);

    const maxHeatmapValue = useMemo(() => {
        return Math.max(...heatmapData.map(d => d.count), 1);
    }, [heatmapData]);

    if (loading || !analytics) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    const maxVolume = Math.max(...(analytics.message_volume || []).map(v => v.count), 1);
    const maxHourly = Math.max(...(analytics.hourly_distribution || []).map(v => v.count), 1);
    const sentRatio = analytics.totalMessages > 0 ? Math.round((analytics.sentMessages / analytics.totalMessages) * 100) : 0;

    function formatDate(dateStr: string): string {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch { return dateStr; }
    }

    function getHeatmapColor(count: number): string {
        if (count === 0) return 'bg-surface-100';
        const intensity = count / maxHeatmapValue;
        if (intensity < 0.25) return 'bg-brand-100';
        if (intensity < 0.5) return 'bg-brand-200';
        if (intensity < 0.75) return 'bg-brand-400';
        return 'bg-brand-600';
    }

    return (
        <div className="space-y-6">
            {/* Header with Period Selector */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-brand-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-surface-900">Analytics</h2>
                        <p className="text-sm text-surface-500">Your communication patterns</p>
                    </div>
                </div>
                <div className="flex bg-surface-100 rounded-xl p-0.5">
                    {(['7d', '30d', '90d'] as const).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                period === p ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500 hover:text-surface-700'
                            }`}
                        >
                            {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '90 days'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Primary Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-surface-200 p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <MessageSquare className="w-4 h-4 text-brand-500" />
                        <p className="text-surface-500 text-xs font-medium uppercase tracking-wide">Messages</p>
                    </div>
                    <p className="text-2xl font-bold text-surface-900">{analytics.totalMessages.toLocaleString()}</p>
                    <div className="mt-1">
                        <TrendBadge value={analytics.changePercent} suffix="% vs prev" />
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-surface-200 p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <Users className="w-4 h-4 text-purple-500" />
                        <p className="text-surface-500 text-xs font-medium uppercase tracking-wide">Contacts</p>
                    </div>
                    <p className="text-2xl font-bold text-surface-900">{analytics.uniqueContacts}</p>
                    <p className="text-xs text-surface-400 mt-1">unique conversations</p>
                </div>

                <div className="bg-white rounded-xl border border-surface-200 p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-4 h-4 text-amber-500" />
                        <p className="text-surface-500 text-xs font-medium uppercase tracking-wide">Avg Response</p>
                    </div>
                    <p className="text-2xl font-bold text-surface-900">
                        {formatResponseTime(analytics.responseTimeStats.average)}
                    </p>
                    <p className="text-xs text-surface-400 mt-1">median: {formatResponseTime(analytics.responseTimeStats.median)}</p>
                </div>

                <div className="bg-white rounded-xl border border-surface-200 p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <Flame className="w-4 h-4 text-orange-500" />
                        <p className="text-surface-500 text-xs font-medium uppercase tracking-wide">Streak</p>
                    </div>
                    <p className="text-2xl font-bold text-surface-900">{analytics.maxStreak} days</p>
                    <p className="text-xs text-surface-400 mt-1">{analytics.activeDays} active days</p>
                </div>
            </div>

            {/* Secondary Stats - Sent/Received + Commitments */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-surface-200 p-5">
                    <h3 className="font-semibold text-surface-900 mb-4 text-sm">Message Flow</h3>
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <Send className="w-3.5 h-3.5 text-brand-500" />
                                <span className="text-xs text-surface-500">Sent</span>
                            </div>
                            <p className="text-lg font-bold text-surface-900">{analytics.sentMessages.toLocaleString()}</p>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <Inbox className="w-3.5 h-3.5 text-blue-500" />
                                <span className="text-xs text-surface-500">Received</span>
                            </div>
                            <p className="text-lg font-bold text-surface-900">{analytics.receivedMessages.toLocaleString()}</p>
                        </div>
                        <div className="w-24 flex-shrink-0">
                            <div className="h-3 bg-surface-100 rounded-full overflow-hidden flex">
                                <div className="bg-brand-500 h-full rounded-l-full" style={{ width: `${sentRatio}%` }} />
                                <div className="bg-blue-400 h-full rounded-r-full" style={{ width: `${100 - sentRatio}%` }} />
                            </div>
                            <div className="flex justify-between text-xs text-surface-400 mt-1">
                                <span>{sentRatio}%</span>
                                <span>{100 - sentRatio}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-surface-200 p-5">
                    <h3 className="font-semibold text-surface-900 mb-4 text-sm">Commitments</h3>
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <Target className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-xs text-surface-500">Pending</span>
                            </div>
                            <p className="text-lg font-bold text-amber-600">{analytics.commitmentStats.pending}</p>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                <span className="text-xs text-surface-500">Completed</span>
                            </div>
                            <p className="text-lg font-bold text-green-600">{analytics.commitmentStats.completed}</p>
                        </div>
                        <div className="w-24 flex-shrink-0">
                            {analytics.commitmentStats.total > 0 ? (
                                <>
                                    <div className="h-3 bg-surface-100 rounded-full overflow-hidden">
                                        <div
                                            className="bg-green-500 h-full rounded-full"
                                            style={{ width: `${Math.round((analytics.commitmentStats.completed / analytics.commitmentStats.total) * 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-surface-400 mt-1 text-center">
                                        {Math.round((analytics.commitmentStats.completed / analytics.commitmentStats.total) * 100)}% done
                                    </p>
                                </>
                            ) : (
                                <p className="text-xs text-surface-400 text-center">No commitments</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Message Volume Chart */}
            {analytics.message_volume && analytics.message_volume.length > 0 && (
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <h3 className="font-semibold text-surface-900 mb-1 text-sm">Daily Message Volume</h3>
                    <p className="text-xs text-surface-400 mb-4">Messages per day over the selected period</p>
                    <div className="flex items-end gap-[2px] h-36">
                        {analytics.message_volume.map((item, i) => (
                            <div
                                key={i}
                                className="flex-1 group relative"
                                style={{ minWidth: '3px' }}
                            >
                                <div
                                    className="w-full bg-brand-500 hover:bg-brand-600 rounded-t transition-all cursor-pointer"
                                    style={{ height: `${Math.max((item.count / maxVolume) * 130, 2)}px` }}
                                />
                                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-surface-900 text-white text-xs rounded-lg whitespace-nowrap z-10 shadow-lg">
                                    {formatDate(item.date)}: {item.count} messages
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between text-xs text-surface-400 mt-2">
                        <span>{formatDate(analytics.message_volume[0]?.date)}</span>
                        <span>{formatDate(analytics.message_volume[analytics.message_volume.length - 1]?.date)}</span>
                    </div>
                </div>
            )}

            {/* Activity Heatmap */}
            {heatmapData.length > 0 && (
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <h3 className="font-semibold text-surface-900 mb-1 text-sm">Activity Heatmap</h3>
                    <p className="text-xs text-surface-400 mb-4">When you're most active (day × hour)</p>
                    <div className="overflow-x-auto">
                        <div className="min-w-[600px]">
                            {/* Hour labels */}
                            <div className="flex gap-[2px] mb-1 ml-10">
                                {HOUR_LABELS.filter((_, i) => i % 3 === 0).map((label, i) => (
                                    <div key={i} className="text-[10px] text-surface-400" style={{ width: `${(3 / 24) * 100}%` }}>
                                        {label}
                                    </div>
                                ))}
                            </div>
                            {/* Heatmap grid */}
                            {DAY_NAMES.map((day, dayIdx) => (
                                <div key={dayIdx} className="flex items-center gap-[2px] mb-[2px]">
                                    <span className="text-[10px] text-surface-500 w-8 text-right mr-2 flex-shrink-0">{day}</span>
                                    {Array.from({ length: 24 }, (_, hourIdx) => {
                                        const cell = heatmapData.find(d => d.dayOfWeek === dayIdx && d.hour === hourIdx);
                                        const count = cell?.count || 0;
                                        return (
                                            <div
                                                key={hourIdx}
                                                className={`flex-1 h-4 rounded-sm ${getHeatmapColor(count)} transition-colors cursor-pointer`}
                                                title={`${day} ${hourIdx}:00 — ${count} messages`}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                            {/* Legend */}
                            <div className="flex items-center gap-2 mt-3 ml-10">
                                <span className="text-[10px] text-surface-400">Less</span>
                                <div className="w-3 h-3 rounded-sm bg-surface-100" />
                                <div className="w-3 h-3 rounded-sm bg-brand-100" />
                                <div className="w-3 h-3 rounded-sm bg-brand-200" />
                                <div className="w-3 h-3 rounded-sm bg-brand-400" />
                                <div className="w-3 h-3 rounded-sm bg-brand-600" />
                                <span className="text-[10px] text-surface-400">More</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Hourly Distribution */}
            {analytics.hourly_distribution && analytics.hourly_distribution.length > 0 && (
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <h3 className="font-semibold text-surface-900 mb-1 text-sm">Hourly Distribution</h3>
                    <p className="text-xs text-surface-400 mb-4">Message count by hour of day</p>
                    <div className="flex items-end gap-1 h-28">
                        {analytics.hourly_distribution.map((item, i) => (
                            <div key={i} className="flex-1 group relative">
                                <div
                                    className="w-full bg-blue-500 hover:bg-blue-600 rounded-t-sm transition-all cursor-pointer"
                                    style={{ height: `${Math.max((item.count / maxHourly) * 100, 1)}px` }}
                                />
                                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-900 text-white text-xs rounded-lg whitespace-nowrap z-10">
                                    {item.hour}:00 — {item.count}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between text-xs text-surface-400 mt-2">
                        <span>12 AM</span>
                        <span>6 AM</span>
                        <span>12 PM</span>
                        <span>6 PM</span>
                        <span>11 PM</span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Contacts */}
                {analytics.top_contacts && analytics.top_contacts.length > 0 && (
                    <div className="bg-white rounded-xl border border-surface-200 p-6">
                        <h3 className="font-semibold text-surface-900 mb-4 text-sm">Top Contacts</h3>
                        <div className="space-y-3">
                            {analytics.top_contacts.slice(0, 8).map((contact, i) => {
                                const pct = Math.round((contact.messageCount / analytics.totalMessages) * 100);
                                return (
                                    <div key={i}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-600">
                                                    {(contact.name || '?')[0].toUpperCase()}
                                                </div>
                                                <span className="text-sm text-surface-700 truncate max-w-[150px]">{contact.name}</span>
                                            </div>
                                            <span className="text-xs text-surface-500 font-medium">{contact.messageCount} ({pct}%)</span>
                                        </div>
                                        <div className="w-full bg-surface-100 rounded-full h-1.5">
                                            <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Most Active Chats */}
                {analytics.chat_activity && analytics.chat_activity.length > 0 && (
                    <div className="bg-white rounded-xl border border-surface-200 p-6">
                        <h3 className="font-semibold text-surface-900 mb-4 text-sm">Most Active Chats</h3>
                        <div className="space-y-3">
                            {analytics.chat_activity.slice(0, 8).map((chat, i) => {
                                const pct = Math.round((chat.messageCount / analytics.totalMessages) * 100);
                                return (
                                    <div key={i}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm text-surface-700 truncate max-w-[200px]">{chat.title}</span>
                                            <span className="text-xs text-surface-500 font-medium">{chat.messageCount} ({pct}%)</span>
                                        </div>
                                        <div className="w-full bg-surface-100 rounded-full h-1.5">
                                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Message Type Breakdown */}
            {analytics.message_types && analytics.message_types.length > 0 && (
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <h3 className="font-semibold text-surface-900 mb-4 text-sm">Message Types</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {analytics.message_types.map((type, i) => {
                            const pct = Math.round((type.count / analytics.totalMessages) * 100);
                            const typeIcons: Record<string, string> = {
                                text: '💬', image: '🖼️', video: '🎬', audio: '🎵',
                                document: '📄', sticker: '🏷️', location: '📍', contact: '👤',
                                voice: '🎙️', gif: '🎞️',
                            };
                            return (
                                <div key={i} className="bg-surface-50 rounded-xl p-4 text-center">
                                    <span className="text-xl">{typeIcons[type.type] || '📨'}</span>
                                    <p className="text-sm font-semibold text-surface-900 mt-1 capitalize">{type.type}</p>
                                    <p className="text-xs text-surface-500">{type.count.toLocaleString()} ({pct}%)</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Response Time Details */}
            {analytics.responseTimeStats.count > 0 && (
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <h3 className="font-semibold text-surface-900 mb-4 text-sm">Response Time Analysis</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                            <p className="text-xs text-surface-500 mb-1">Average</p>
                            <p className="text-lg font-bold text-surface-900">{formatResponseTime(analytics.responseTimeStats.average)}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-surface-500 mb-1">Median</p>
                            <p className="text-lg font-bold text-surface-900">{formatResponseTime(analytics.responseTimeStats.median)}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-surface-500 mb-1">Fastest</p>
                            <p className="text-lg font-bold text-green-600">{formatResponseTime(analytics.responseTimeStats.min)}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-surface-500 mb-1">Slowest</p>
                            <p className="text-lg font-bold text-amber-600">{formatResponseTime(analytics.responseTimeStats.max)}</p>
                        </div>
                    </div>
                    <p className="text-xs text-surface-400 text-center mt-3">Based on {analytics.responseTimeStats.count} reply pairs</p>
                </div>
            )}
        </div>
    );
}
