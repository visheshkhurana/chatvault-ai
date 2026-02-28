'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Heart, TrendingUp, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';

interface ContactInsight {
    id: string;
    name: string;
    relationship_score: number;
    last_message_at: string;
    message_count: number;
    weekly_trend: number;
    pending_commitments: number;
    needs_attention: boolean;
    attention_reason?: string;
    top_topics?: string[];
    sentiment?: string;
    communication_pattern?: string;
}

export default function ContactInsightsSection() {
    const [contacts, setContacts] = useState<ContactInsight[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'all' | 'attention'>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        loadContacts();
    }, []);

    async function loadContacts() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/contact-insights', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setContacts(data.contacts || []);
        } catch (err) {
            console.error('Failed to load contact insights:', err);
        }
        setLoading(false);
    }

    async function analyzeContact(contactId: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/contact-insights/${contactId}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            await loadContacts();
        } catch (err) {
            console.error('Failed to analyze contact:', err);
        }
    }

    const getRoleColor = (score: number) => {
        if (score >= 80) return 'bg-green-500';
        if (score >= 60) return 'bg-blue-500';
        if (score >= 40) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    const filteredContacts = activeTab === 'attention'
        ? contacts.filter(c => c.needs_attention)
        : contacts;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => setActiveTab('all')}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        activeTab === 'all'
                            ? 'bg-brand-600 text-white'
                            : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                    }`}
                >
                    All Contacts ({contacts.length})
                </button>
                <button
                    onClick={() => setActiveTab('attention')}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        activeTab === 'attention'
                            ? 'bg-brand-600 text-white'
                            : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                    }`}
                >
                    Needs Attention ({contacts.filter(c => c.needs_attention).length})
                </button>
            </div>

            {filteredContacts.length === 0 ? (
                <div className="bg-white rounded-xl border border-surface-200 p-6 sm:p-12 text-center">
                    <Users className="w-8 h-8 text-surface-300 mx-auto mb-3" />
                    <p className="text-surface-600 font-medium">
                        {activeTab === 'attention' ? 'All contacts are doing well' : 'No contacts found'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredContacts.map((contact) => (
                        <div key={contact.id} className="bg-white rounded-xl border border-surface-200 overflow-hidden">
                            {/* Main Card */}
                            <div
                                onClick={() => setExpandedId(expandedId === contact.id ? null : contact.id)}
                                className="p-4 cursor-pointer hover:bg-surface-50 transition-colors"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-semibold text-surface-900">{contact.name}</h3>
                                            {contact.needs_attention && (
                                                <AlertCircle className="w-4 h-4 text-red-500" />
                                            )}
                                        </div>
                                        <p className="text-xs text-surface-400">
                                            Last message: {new Date(contact.last_message_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-surface-900">
                                            {contact.message_count} messages
                                        </p>
                                    </div>
                                </div>

                                {/* Relationship Score Bar */}
                                <div className="mb-3">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs text-surface-500 font-medium">Relationship Score</label>
                                        <span className="text-sm font-bold text-surface-900">{contact.relationship_score}%</span>
                                    </div>
                                    <div className="w-full bg-surface-100 rounded-full h-2">
                                        <div
                                            className={`h-full rounded-full ${getRoleColor(contact.relationship_score)} transition-all`}
                                            style={{ width: `${contact.relationship_score}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Trend & Commitments */}
                                <div className="flex gap-4 text-xs">
                                    <div className="flex items-center gap-1">
                                        {contact.weekly_trend > 0 ? (
                                            <TrendingUp className="w-3 h-3 text-green-600" />
                                        ) : (
                                            <TrendingDown className="w-3 h-3 text-red-600" />
                                        )}
                                        <span className={contact.weekly_trend > 0 ? 'text-green-600' : 'text-red-600'}>
                                            {Math.abs(contact.weekly_trend)}% this week
                                        </span>
                                    </div>
                                    {contact.pending_commitments > 0 && (
                                        <div className="flex items-center gap-1 text-amber-600">
                                            <Heart className="w-3 h-3" />
                                            {contact.pending_commitments} pending
                                        </div>
                                    )}
                                </div>

                                {/* Attention Reason */}
                                {contact.needs_attention && contact.attention_reason && (
                                    <div className="mt-3 p-2 bg-red-50 rounded-lg border border-red-100">
                                        <p className="text-xs text-red-700">{contact.attention_reason}</p>
                                    </div>
                                )}
                            </div>

                            {/* Expanded View */}
                            {expandedId === contact.id && (
                                <div className="border-t border-surface-200 p-4 bg-surface-50">
                                    {contact.top_topics && contact.top_topics.length > 0 && (
                                        <div className="mb-3">
                                            <p className="text-xs font-semibold text-surface-900 mb-2">Top Topics</p>
                                            <div className="flex flex-wrap gap-2">
                                                {contact.top_topics.map((topic, i) => (
                                                    <span key={i} className="text-xs bg-white border border-surface-200 px-2 py-1 rounded">
                                                        {topic}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {contact.sentiment && (
                                        <div className="mb-3">
                                            <p className="text-xs font-semibold text-surface-900 mb-1">Sentiment</p>
                                            <p className="text-sm text-surface-700">{contact.sentiment}</p>
                                        </div>
                                    )}
                                    {contact.communication_pattern && (
                                        <div className="mb-3">
                                            <p className="text-xs font-semibold text-surface-900 mb-1">Communication Pattern</p>
                                            <p className="text-sm text-surface-700">{contact.communication_pattern}</p>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => analyzeContact(contact.id)}
                                        className="w-full mt-3 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
                                    >
                                        Analyze Contact
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
