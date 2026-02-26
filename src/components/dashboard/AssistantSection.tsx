'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Bot, Send, Loader2, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { SearchSourcesCard, CommitmentsCard, SummaryCard, IntentBadge } from './ChatResponseCards';

// ============================================================
// Rememora AI Assistant — Primary Chat Interface
// ============================================================

interface ResponseData {
        type: 'search' | 'commitments' | 'summary' | 'message';
        reply: string;
        sources?: any[];
        commitments?: any[];
        summary?: { text: string; keyTopics: string[]; actionItems: string[] };
        intent?: string;
}

interface ChatMessage {
        role: 'user' | 'assistant';
        content: string;
        responseData?: ResponseData;
}

interface Suggestion {
        text: string;
        icon: string;
}

interface AssistantSectionProps {
        bridgeStatus?: string;
        userEmail?: string;
        userName?: string;
}

export default function AssistantSection({ bridgeStatus, userEmail, userName: userNameProp }: AssistantSectionProps) {
        const [messages, setMessages] = useState<ChatMessage[]>([]);
        const [input, setInput] = useState('');
        const [loading, setLoading] = useState(false);
        const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
        const messagesEndRef = useRef<HTMLDivElement>(null);
        const inputRef = useRef<HTMLInputElement>(null);

    const isConnected = bridgeStatus === 'connected';
        const userName = userNameProp || userEmail?.split('@')[0] || '';

    // Auto-scroll on new messages
    useEffect(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // Auto-focus input
    useEffect(() => {
                inputRef.current?.focus();
    }, []);

    // Fetch suggestions on mount
    useEffect(() => {
                fetchSuggestions();
    }, []);

    async function fetchSuggestions() {
                try {
                                const session = await supabase.auth.getSession();
                                if (!session.data.session?.access_token) return;
                                const res = await fetch('/api/suggestions', {
                                                    headers: { 'Authorization': `Bearer ${session.data.session.access_token}` },
                                });
                                if (res.ok) {
                                                    const data = await res.json();
                                                    setSuggestions(data.suggestions || []);
                                }
                } catch {
                                setSuggestions([
                                    { text: 'Show my commitments', icon: '✅' },
                                    { text: 'What did I discuss recently?', icon: '🔍' },
                                    { text: 'Help', icon: '⚡' },
                                                ]);
                }
    }

    async function sendMessage(e?: React.FormEvent, overrideText?: string) {
                if (e) e.preventDefault();
                const text = overrideText || input.trim();
                if (!text || loading) return;

            const userMsg: ChatMessage = { role: 'user', content: text };
                const updated = [...messages, userMsg];
                setMessages(updated);
                setInput('');
                setLoading(true);

            try {
                            const session = await supabase.auth.getSession();
                            const apiMessages = updated.map(m => ({ role: m.role, content: m.content }));
                            const response = await fetch('/api/chat-assistant', {
                                                method: 'POST',
                                                headers: {
                                                                        'Content-Type': 'application/json',
                                                                        'Authorization': `Bearer ${session.data.session?.access_token}`,
                                                },
                                                body: JSON.stringify({ messages: apiMessages }),
                            });

                    const data = await response.json();
                            const responseData: ResponseData = {
                                                type: data.type || 'message',
                                                reply: data.reply || 'Sorry, I could not generate a response.',
                                                sources: data.sources,
                                                commitments: data.commitments,
                                                summary: data.summary,
                                                intent: data.intent,
                            };

                    setMessages([...updated, {
                                        role: 'assistant',
                                        content: responseData.reply,
                                        responseData,
                    }]);
            } catch (err) {
                            setMessages([...updated, {
                                                role: 'assistant',
                                                content: 'An error occurred. Please try again.',
                            }]);
            }
                setLoading(false);
    }

    function handleSuggestionClick(text: string) {
                setInput(text);
                sendMessage(undefined, text);
    }

    return (
                <div className="flex flex-col h-[calc(100vh-180px)]">
                    {/* Chat Messages */}
                            <div className="flex-1 overflow-y-auto space-y-4 mb-4 bg-surface-50 rounded-xl p-4">
                                {/* Welcome State */}
                                {messages.length === 0 && (
                                        <div className="text-center py-12 text-surface-400">
                                                                <div className="w-16 h-16 mx-auto mb-4 bg-brand-100 rounded-2xl flex items-center justify-center">
                                                                                            <Sparkles className="w-8 h-8 text-brand-600" />
                                                                </div>
                                                                <p className="text-lg font-semibold text-surface-800 mb-1">
                                                                    {userName ? `Hi ${userName}!` : 'Welcome to Rememora'}
                                                                </p>
                                                                <p className="text-sm text-surface-500 mb-2">
                                                                                            Ask me anything about your WhatsApp conversations.
                                                                </p>
                                            {/* Connection status */}
                                                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-6 ${
                                                                        isConnected ? 'bg-brand-50 text-brand-700' : 'bg-yellow-50 text-yellow-700'
                                        }`}>
                                                                    {isConnected ? (
                                                                            <><Wifi className="w-3 h-3" /> WhatsApp Connected</>
                                                                        ) : (
                                                                            <><WifiOff className="w-3 h-3" /> Connect WhatsApp to get started</>
                                                                        )}
                                                                </div>
                                        
                                            {/* Suggestion Chips */}
                                                                <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto">
                                                                    {suggestions.map((s, i) => (
                                                                            <button
                                                                                                                    key={i}
                                                                                                                    onClick={() => handleSuggestionClick(s.text)}
                                                                                                                    className="px-3 py-1.5 bg-white border border-surface-200 rounded-full text-xs text-surface-600 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700 transition-colors"
                                                                                                                >
                                                                                {s.icon} {s.text}
                                                                                </button>
                                                                        ))}
                                                                </div>
                                        </div>
                                            )}
                            
                                {/* Messages */}
                                {messages.map((msg, i) => (
                                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                                <div className={`max-w-[80%]`}>
                                                                    {msg.role === 'assistant' && msg.responseData?.intent && (
                                                                            <div className="mb-1">
                                                                                                                <IntentBadge intent={msg.responseData.intent} />
                                                                                </div>
                                                                                            )}
                                                                                            <div className={`px-4 py-3 rounded-2xl text-sm ${
                                                                            msg.role === 'user'
                                                                                ? 'bg-brand-600 text-white rounded-br-md'
                                                                                : 'bg-white border border-surface-200 text-surface-800 rounded-bl-md'
                                        }`}>
                                                                                                                            <div className="whitespace-pre-wrap">{msg.content}</div>
                                                                                                {msg.role === 'assistant' && msg.responseData && (
                                                                                <>
                                                                                    {msg.responseData.type === 'search' && msg.responseData.sources && msg.responseData.sources.length > 0 && (
                                                                                                                                <SearchSourcesCard sources={msg.responseData.sources} />
                                                                                                                            )}
                                                                                    {msg.responseData.type === 'commitments' && msg.responseData.commitments && msg.responseData.commitments.length > 0 && (
                                                                                                                                <CommitmentsCard commitments={msg.responseData.commitments} />
                                                                                                                            )}
                                                                                    {msg.responseData.type === 'summary' && msg.responseData.summary && (
                                                                                                                                <SummaryCard summary={msg.responseData.summary} />
                                                                                                                            )}
                                                                                    </>
                                                                            )}
                                                                                                </div>
                                                                </div>
                                        </div>
                                    ))}
                            
                                {/* Typing indicator */}
                                {loading && (
                                        <div className="flex justify-start">
                                                                <div className="bg-white border border-surface-200 px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-2">
                                                                                            <span className="flex gap-1">
                                                                                                                            <span className="w-2 h-2 bg-surface-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                                                                                                            <span className="w-2 h-2 bg-surface-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                                                                                                            <span className="w-2 h-2 bg-surface-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                                                                                </span>
                                                                </div>
                                        </div>
                                            )}
                                            <div ref={messagesEndRef} />
                            </div>
                
                    {/* Quick actions row when conversation is active */}
                    {messages.length > 0 && suggestions.length > 0 && (
                                    <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                                        {suggestions.slice(0, 4).map((s, i) => (
                                                                <button
                                                                                                key={i}
                                                                                                onClick={() => handleSuggestionClick(s.text)}
                                                                                                className="px-2.5 py-1 bg-white border border-surface-200 rounded-full text-[11px] text-surface-500 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700 whitespace-nowrap flex-shrink-0 transition-colors"
                                                                                            >
                                                                    {s.icon} {s.text}
                                                                </button>
                                                            ))}
                                    </div>
                            )}
                
                    {/* Input */}
                            <form onSubmit={sendMessage} className="flex gap-3">
                                            <input
                                                                    ref={inputRef}
                                                                    type="text"
                                                                    value={input}
                                                                    onChange={(e) => setInput(e.target.value)}
                                                                    placeholder="Ask about your conversations..."
                                                                    className="flex-1 px-4 py-3 rounded-xl border border-surface-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                                                                    disabled={loading}
                                                                />
                                            <button
                                                                    type="submit"
                                                                    disabled={loading || !input.trim()}
                                                                    className="px-5 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
                                                                >
                                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                            </button>
                            </form>
                                </div>
                                  );
                                  }
