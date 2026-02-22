'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Brain, Bot, Send, Loader2 } from 'lucide-react';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export default function AssistantSection() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sources, setSources] = useState<any[]>([]);

    async function sendMessage(e: React.FormEvent) {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMsg: ChatMessage = { role: 'user', content: input };
        const updated = [...messages, userMsg];
        setMessages(updated);
        setInput('');
        setLoading(true);
        setSources([]);

        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/chat-assistant', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({ messages: updated }),
            });
            const data = await response.json();
            setMessages([...updated, { role: 'assistant', content: data.reply || 'Sorry, I could not generate a response.' }]);
            setSources(data.sources || []);
        } catch (err) {
            setMessages([...updated, { role: 'assistant', content: 'An error occurred. Please try again.' }]);
        }
        setLoading(false);
    }

    return (
        <div className="flex flex-col h-[calc(100vh-220px)]">
            <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                        <Brain className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">AI Assistant</h2>
                        <p className="text-sm text-gray-500">Chat with your WhatsApp data — ask anything about your conversations</p>
                    </div>
                </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 bg-gray-50 rounded-xl p-4">
                {messages.length === 0 && (
                    <div className="text-center py-16 text-gray-400">
                        <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">Start a conversation</p>
                        <p className="text-sm">Ask me anything about your WhatsApp messages, contacts, or conversations.</p>
                        <div className="mt-6 flex flex-wrap gap-2 justify-center">
                            {['What did I talk about with Mom last week?', 'Find all shared links', 'Summarize my group chats'].map((q) => (
                                <button key={q} onClick={() => setInput(q)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-gray-100">
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${
                            msg.role === 'user'
                                ? 'bg-green-600 text-white rounded-br-md'
                                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-md">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        </div>
                    </div>
                )}
            </div>

            {/* Sources */}
            {sources.length > 0 && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {sources.slice(0, 4).map((s: any, i: number) => (
                        <div key={i} className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 whitespace-nowrap flex-shrink-0">
                            📌 {s.senderName || 'Unknown'} • {s.text?.substring(0, 40)}...
                        </div>
                    ))}
                </div>
            )}

            {/* Input */}
            <form onSubmit={sendMessage} className="flex gap-3">
                <input
                    type="text"
                    value={input}
                    onChange={(e: any) => setInput(e.target.value)}
                    placeholder="Ask about your conversations..."
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
                <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="px-5 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                    <Send className="w-4 h-4" />
                </button>
            </form>
        </div>
    );
}
