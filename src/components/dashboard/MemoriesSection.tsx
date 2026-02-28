'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Clock, Heart, X, Loader2 } from 'lucide-react';

interface Memory {
    id: string;
    chat_id: string;
    chat_name: string;
    sender: string;
    message_snippet: string;
    timestamp: string;
    years_ago: number;
}

export default function MemoriesSection() {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [loading, setLoading] = useState(true);
    const [groupedMemories, setGroupedMemories] = useState<Record<number, Memory[]>>({});

    useEffect(() => {
        loadMemories();
    }, []);

    async function loadMemories() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/memories', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            const memList = data.memories || [];
            setMemories(memList);

            // Group by years_ago
            const grouped: Record<number, Memory[]> = {};
            memList.forEach((mem: Memory) => {
                if (!grouped[mem.years_ago]) {
                    grouped[mem.years_ago] = [];
                }
                grouped[mem.years_ago].push(mem);
            });
            setGroupedMemories(grouped);
        } catch (err) {
            console.error('Failed to load memories:', err);
        }
        setLoading(false);
    }

    async function dismissMemory(memoryId: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/memories/${memoryId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            setMemories(memories.filter(m => m.id !== memoryId));
            // Rebuild grouped
            const grouped: Record<number, Memory[]> = {};
            memories
                .filter(m => m.id !== memoryId)
                .forEach((mem: Memory) => {
                    if (!grouped[mem.years_ago]) {
                        grouped[mem.years_ago] = [];
                    }
                    grouped[mem.years_ago].push(mem);
                });
            setGroupedMemories(grouped);
        } catch (err) {
            console.error('Failed to dismiss memory:', err);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    if (memories.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-surface-200 p-6 sm:p-12 text-center">
                <Clock className="w-8 h-8 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-600 font-medium">No memories for today</p>
                <p className="text-surface-400 text-sm mt-1">Check back tomorrow!</p>
            </div>
        );
    }

    const sortedYears = Object.keys(groupedMemories)
        .map(Number)
        .sort((a, b) => b - a);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-brand-600" />
                    This Day in Your Chats
                </h2>
            </div>

            {sortedYears.map((yearsAgo) => (
                <div key={yearsAgo}>
                    <h3 className="font-semibold text-surface-700 mb-3 text-sm">
                        {yearsAgo} year{yearsAgo !== 1 ? 's' : ''} ago
                    </h3>
                    <div className="space-y-3">
                        {groupedMemories[yearsAgo].map((memory) => (
                            <div key={memory.id} className="bg-white rounded-xl border border-surface-200 p-4 hover:shadow-sm transition-shadow">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <h4 className="font-medium text-surface-900">{memory.chat_name}</h4>
                                            <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">
                                                {memory.sender}
                                            </span>
                                        </div>
                                        <p className="text-sm text-surface-600 line-clamp-2">{memory.message_snippet}</p>
                                        <p className="text-xs text-surface-400 mt-2">
                                            {new Date(memory.timestamp).toLocaleDateString()} at {new Date(memory.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => dismissMemory(memory.id)}
                                        className="flex-shrink-0 ml-2 p-2 hover:bg-surface-100 rounded-lg transition-colors"
                                        title="Dismiss"
                                    >
                                        <X className="w-4 h-4 text-surface-400 hover:text-surface-600" />
                                    </button>
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 transition-colors">
                                        <Heart className="w-3 h-3" />
                                        View
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
