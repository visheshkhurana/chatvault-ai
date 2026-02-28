'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Heart, Smile, Frown, TrendingUp, AlertTriangle, BarChart3, Loader2 } from 'lucide-react';

interface EmotionalInsight {
    id: string;
    overall_sentiment: string;
    sentiment_scores: {
        positive: number;
        neutral: number;
        negative: number;
    };
    per_contact?: Array<{
        contact_name: string;
        sentiment: string;
        emotion_score: number;
    }>;
    health_indicators: Array<{
        relationship: string;
        status: 'thriving' | 'healthy' | 'needs_attention' | 'at_risk';
        score: number;
    }>;
    emotional_alerts?: Array<{
        type: string;
        message: string;
        triggered_at: string;
    }>;
}

export default function EmotionalInsightsSection() {
    const [insights, setInsights] = useState<EmotionalInsight | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadInsights();
    }, []);

    async function loadInsights() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/emotional-insights', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setInsights(data.insights);
        } catch (err) {
            console.error('Failed to load emotional insights:', err);
        }
        setLoading(false);
    }

    const getSentimentIcon = (sentiment: string) => {
        switch (sentiment?.toLowerCase()) {
            case 'positive':
                return <Smile className="w-5 h-5 text-green-600" />;
            case 'negative':
                return <Frown className="w-5 h-5 text-red-600" />;
            default:
                return <Heart className="w-5 h-5 text-blue-600" />;
        }
    };

    const getHealthColor = (status: string) => {
        switch (status) {
            case 'thriving':
                return 'bg-emerald-50 border-emerald-200 text-emerald-700';
            case 'healthy':
                return 'bg-green-50 border-green-200 text-green-700';
            case 'needs_attention':
                return 'bg-yellow-50 border-yellow-200 text-yellow-700';
            case 'at_risk':
                return 'bg-red-50 border-red-200 text-red-700';
            default:
                return 'bg-surface-50 border-surface-200 text-surface-700';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    if (!insights) {
        return (
            <div className="bg-white rounded-xl border border-surface-200 p-12 text-center">
                <Heart className="w-8 h-8 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-600 font-medium">No emotional insights yet</p>
                <p className="text-surface-400 text-sm mt-1">More data will help us understand your relationships</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
                <Heart className="w-5 h-5 text-brand-600" />
                Emotional Intelligence
            </h2>

            {/* Overall Sentiment Chart */}
            <div className="bg-white rounded-xl border border-surface-200 p-6">
                <h3 className="font-semibold text-surface-900 mb-4 text-sm">Overall Sentiment</h3>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            {getSentimentIcon(insights.overall_sentiment)}
                            <span className="font-semibold text-surface-900 capitalize">
                                {insights.overall_sentiment}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Sentiment Bars */}
                <div className="space-y-3">
                    {[
                        { label: 'Positive', value: insights.sentiment_scores.positive, color: 'bg-green-500' },
                        { label: 'Neutral', value: insights.sentiment_scores.neutral, color: 'bg-blue-500' },
                        { label: 'Negative', value: insights.sentiment_scores.negative, color: 'bg-red-500' },
                    ].map((item) => (
                        <div key={item.label}>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs text-surface-600 font-medium">{item.label}</label>
                                <span className="text-sm font-semibold text-surface-900">{Math.round(item.value * 100)}%</span>
                            </div>
                            <div className="w-full bg-surface-100 rounded-full h-2">
                                <div
                                    className={`h-full rounded-full ${item.color} transition-all`}
                                    style={{ width: `${item.value * 100}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Per-Contact Emotion Breakdown */}
            {insights.per_contact && insights.per_contact.length > 0 && (
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <h3 className="font-semibold text-surface-900 mb-4 text-sm">Per-Contact Sentiment</h3>
                    <div className="space-y-3">
                        {insights.per_contact.map((contact, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-surface-50 rounded-lg">
                                <div className="flex items-center gap-3 flex-1">
                                    {getSentimentIcon(contact.sentiment)}
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-surface-900">{contact.contact_name}</p>
                                        <p className="text-xs text-surface-500 capitalize">{contact.sentiment}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-surface-900">{Math.round(contact.emotion_score * 100)}%</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Communication Health */}
            {insights.health_indicators && insights.health_indicators.length > 0 && (
                <div className="bg-white rounded-xl border border-surface-200 p-6">
                    <h3 className="font-semibold text-surface-900 mb-4 text-sm">Communication Health</h3>
                    <div className="space-y-2">
                        {insights.health_indicators.map((indicator, i) => (
                            <div
                                key={i}
                                className={`p-3 rounded-lg border flex items-center justify-between ${getHealthColor(indicator.status)}`}
                            >
                                <div className="flex items-center gap-2">
                                    {indicator.status === 'thriving' && <TrendingUp className="w-4 h-4" />}
                                    {indicator.status === 'needs_attention' && <AlertTriangle className="w-4 h-4" />}
                                    <span className="text-sm font-medium">{indicator.relationship}</span>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-semibold capitalize">{indicator.status.replace('_', ' ')}</p>
                                    <p className="text-xs opacity-75">{Math.round(indicator.score * 100)}%</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Emotional Alerts */}
            {insights.emotional_alerts && insights.emotional_alerts.length > 0 && (
                <div className="bg-red-50 rounded-xl border border-red-200 p-6">
                    <h3 className="font-semibold text-red-900 mb-4 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Emotional Alerts
                    </h3>
                    <div className="space-y-2">
                        {insights.emotional_alerts.map((alert, i) => (
                            <div key={i} className="bg-white rounded-lg p-3 border border-red-100">
                                <div className="flex items-start gap-2 mb-1">
                                    <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-red-900 capitalize">{alert.type.replace('_', ' ')}</p>
                                        <p className="text-xs text-red-700 mt-0.5">{alert.message}</p>
                                        <p className="text-xs text-red-500 mt-1">
                                            {new Date(alert.triggered_at).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Summary Card */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 p-6">
                <h3 className="font-semibold text-purple-900 mb-2 text-sm">Insights</h3>
                <p className="text-sm text-purple-800 leading-relaxed">
                    Your relationships show a {insights.overall_sentiment} sentiment trend. Focus on the relationships marked
                    "needs attention" to strengthen your emotional connections.
                </p>
            </div>
        </div>
    );
}
