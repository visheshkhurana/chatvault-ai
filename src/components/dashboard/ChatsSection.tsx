'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Chat {
    id: string;
    title: string;
    chat_type: string;
    category: string | null;
    last_message_at: string;
    participant_count: number;
}

interface Message {
    id: string;
    sender_name: string;
    text_content: string;
    message_type: string;
    timestamp: string;
    chat_id: string;
}

export default function ChatsSection() {
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);

    useEffect(() => {
        loadChats();
    }, []);

    async function loadChats() {
        const { data } = await supabase
          .from('chats')
          .select('*')
          .order('last_message_at', { ascending: false });
        setChats(data || []);
    }

    async function loadChatMessages(chatId: string) {
        setSelectedChat(chatId);
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('timestamp', { ascending: false })
          .limit(100);
        setMessages(data || []);
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
                <div className="p-4 border-b border-surface-100">
                    <h3 className="font-semibold text-surface-900">Conversations</h3>
                </div>
                <div className="divide-y divide-surface-100 max-h-[600px] overflow-y-auto">
                    {chats.map((chat: any) => (
                        <button
                            key={chat.id}
                            onClick={() => loadChatMessages(chat.id)}
                            className={`w-full text-left p-4 hover:bg-surface-50 transition-colors ${
                                selectedChat === chat.id ? 'bg-brand-50' : ''
                            }`}
                        >
                            <p className="font-medium text-surface-900">{chat.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-surface-500">{chat.chat_type}</span>
                                {chat.category && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                      {chat.category}
                                    </span>
                                )}
                                {chat.last_message_at && (
                                    <span className="text-xs text-surface-400">
                                      {new Date(chat.last_message_at).toLocaleDateString()}
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="md:col-span-2 bg-white rounded-xl border border-surface-200 overflow-hidden">
                <div className="p-4 border-b border-surface-100">
                    <h3 className="font-semibold text-surface-900">Messages</h3>
                </div>
                <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                    {messages.length === 0 ? (
                        <p className="text-surface-500 text-center py-8">Select a chat to view messages</p>
                    ) : (
                        messages.map((msg: any) => (
                            <div key={msg.id} className="p-3 bg-surface-50 rounded-lg">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium text-surface-900">{msg.sender_name}</span>
                                    <span className="text-xs text-surface-400">
                                      {new Date(msg.timestamp).toLocaleString()}
                                    </span>
                                    {msg.message_type !== 'text' && (
                                        <span className="text-xs bg-surface-200 text-surface-600 px-2 py-0.5 rounded">
                                          {msg.message_type}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-surface-700">{msg.text_content || `[${msg.message_type}]`}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
