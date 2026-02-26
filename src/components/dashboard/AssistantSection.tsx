'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Send, Loader2, Sparkles, Wifi, WifiOff,
  Search, CheckCircle2, MessageCircle, Zap,
  ArrowUp,
} from 'lucide-react';
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isConnected = bridgeStatus === 'connected';
  const userName = userNameProp || userEmail?.split('@')[0] || '';
  const firstName = userName.split(' ')[0];

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

  // Auto-resize textarea
  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

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

    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Welcome State */}
        {!hasMessages && (
          <div className="flex items-center justify-center min-h-full px-4 py-8">
            <div className="w-full max-w-xl">
              {/* Hero */}
              <div className="text-center mb-8">
                <div className="relative inline-flex mb-5">
                  <div className="w-16 h-16 bg-gradient-to-br from-brand-400 to-brand-600 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/25">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center ${isConnected ? 'bg-emerald-400' : 'bg-surface-300'}`}>
                    {isConnected ? (
                      <Wifi className="w-2.5 h-2.5 text-white" />
                    ) : (
                      <WifiOff className="w-2.5 h-2.5 text-white" />
                    )}
                  </div>
                </div>

                <h2 className="text-xl font-bold text-surface-900 mb-1">
                  {firstName ? `Hey ${firstName}!` : 'Welcome to Rememora'}
                </h2>
                <p className="text-surface-500 text-sm max-w-sm mx-auto">
                  I can search your WhatsApp conversations, track commitments, and summarize chats.
                </p>
              </div>

              {/* Connection status */}
              {!isConnected && (
                <div className="mb-6 mx-auto max-w-sm">
                  <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
                    <WifiOff className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800">WhatsApp not connected</p>
                      <p className="text-amber-600 text-xs mt-0.5">Connect in Settings to get started</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Feature cards */}
              <div className="grid grid-cols-2 gap-2.5 mb-6 max-w-sm mx-auto">
                {[
                  { icon: Search, label: 'Search', desc: 'Find any message', color: 'text-blue-600 bg-blue-50' },
                  { icon: CheckCircle2, label: 'Commitments', desc: 'Track promises', color: 'text-brand-600 bg-brand-50' },
                  { icon: MessageCircle, label: 'Summarize', desc: 'Chat summaries', color: 'text-violet-600 bg-violet-50' },
                  { icon: Zap, label: 'Insights', desc: 'Smart analysis', color: 'text-amber-600 bg-amber-50' },
                ].map((f) => (
                  <div key={f.label} className="flex items-center gap-2.5 px-3 py-2.5 bg-white border border-surface-100 rounded-xl">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${f.color}`}>
                      <f.icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-surface-800">{f.label}</p>
                      <p className="text-[10px] text-surface-400">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Suggestion chips */}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(s.text)}
                      className="px-3.5 py-2 bg-white border border-surface-200 rounded-full text-xs font-medium text-surface-600 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700 transition-all hover:shadow-sm"
                    >
                      <span className="mr-1">{s.icon}</span> {s.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        {hasMessages && (
          <div className="px-4 py-4 space-y-4 max-w-3xl mx-auto w-full">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'flex gap-2.5'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div>
                    {msg.role === 'assistant' && msg.responseData?.intent && (
                      <div className="mb-1">
                        <IntentBadge intent={msg.responseData.intent} />
                      </div>
                    )}
                    <div className={`px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-brand-600 text-white rounded-2xl rounded-br-md shadow-sm'
                        : 'bg-white border border-surface-100 text-surface-800 rounded-2xl rounded-tl-md shadow-sm'
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
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-white border border-surface-100 px-4 py-3 rounded-2xl rounded-tl-md shadow-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-surface-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-surface-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-surface-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Quick actions row when conversation is active */}
      {hasMessages && suggestions.length > 0 && (
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto max-w-3xl mx-auto w-full">
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

      {/* Input bar */}
      <div className="px-4 pb-4 pt-2 max-w-3xl mx-auto w-full">
        <div className="relative flex items-end bg-white border border-surface-200 rounded-2xl shadow-sm focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-500/20 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your conversations..."
            rows={1}
            className="flex-1 px-4 py-3 bg-transparent text-sm text-surface-800 placeholder-surface-400 focus:outline-none resize-none max-h-[120px]"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className={`m-1.5 w-8 h-8 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
              input.trim()
                ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
                : 'bg-surface-100 text-surface-300'
            }`}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-center text-[10px] text-surface-300 mt-1.5">
          Rememora searches your synced WhatsApp messages
        </p>
      </div>
    </div>
  );
}
