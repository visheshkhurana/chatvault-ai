'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageCircle, Sparkles, ThumbsUp, ThumbsDown, Copy, Loader2, X } from 'lucide-react';

interface Suggestion {
    id: string;
    contact_name: string;
    context: string;
    suggested_replies: string[];
    rating?: number;
    is_dismissed: boolean;
}

export default function ResponseSuggestionsSection() {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        loadSuggestions();
    }, []);

    async function loadSuggestions() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/response-suggestions', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setSuggestions(data.suggestions || []);
        } catch (err) {
            console.error('Failed to load suggestions:', err);
        }
        setLoading(false);
    }

    async function copySuggestion(suggestionId: string, text: string) {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(suggestionId);
            setTimeout(() => setCopiedId(null), 2000);

            // Track usage
            const session = await supabase.auth.getSession();
            await fetch(`/api/response-suggestions/${suggestionId}/use`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    async function dismissSuggestion(suggestionId: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/response-suggestions/${suggestionId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            setSuggestions(suggestions.filter(s => s.id !== suggestionId));
        } catch (err) {
            console.error('Failed to dismiss suggestion:', err);
        }
    }

    async function rateSuggestion(suggestionId: string, rating: number) {
        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/response-suggestions/${suggestionId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({ rating }),
            });
            setSuggestions(suggestions.map(s =>
                s.id === suggestionId ? { ...s, rating } : s
            ));
        } catch (err) {
            console.error('Failed to rate suggestion:', err);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    const activeSuggestions = suggestions.filter(s => !s.is_dismissed);

    if (activeSuggestions.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-surface-200 p-6 sm:p-12 text-center">
                <Sparkles className="w-8 h-8 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-600 font-medium">No suggestions at the moment</p>
                <p className="text-surface-400 text-sm mt-1">Suggestions appear when you have unread messages</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-600" />
                AI Response Suggestions
            </h2>

            <div className="space-y-3">
                {activeSuggestions.map((suggestion) => (
                    <div key={suggestion.id} className="bg-white rounded-xl border border-surface-200 p-4">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <MessageCircle className="w-4 h-4 text-brand-600" />
                                    <h3 className="font-semibold text-surface-900">{suggestion.contact_name}</h3>
                                </div>
                                <p className="text-sm text-surface-600 mb-2">{suggestion.context}</p>
                            </div>
                            <button
                                onClick={() => dismissSuggestion(suggestion.id)}
                                className="flex-shrink-0 p-2 hover:bg-surface-100 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4 text-surface-400 hover:text-surface-600" />
                            </button>
                        </div>

                        {/* Suggested Replies */}
                        <div className="space-y-2 mb-3">
                            {suggestion.suggested_replies.map((reply, i) => (
                                <div
                                    key={i}
                                    className="bg-surface-50 border border-surface-100 rounded-lg p-3 group"
                                >
                                    <p className="text-sm text-surface-700 mb-2">{reply}</p>
                                    <button
                                        onClick={() => copySuggestion(suggestion.id, reply)}
                                        className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-brand-700 bg-brand-50 rounded hover:bg-brand-100 transition-colors group-hover:visible"
                                    >
                                        <Copy className="w-3 h-3" />
                                        {copiedId === suggestion.id ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Rating Stars */}
                        {suggestion.rating !== undefined && (
                            <div className="flex items-center gap-2 text-xs text-surface-500">
                                <span>Found helpful?</span>
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            onClick={() => rateSuggestion(suggestion.id, star)}
                                            className={`p-1.5 rounded transition-colors ${
                                                suggestion.rating && suggestion.rating >= star
                                                    ? 'text-yellow-500 hover:text-yellow-600'
                                                    : 'text-surface-300 hover:text-yellow-400'
                                            }`}
                                        >
                                            ★
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
