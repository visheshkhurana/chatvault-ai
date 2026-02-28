'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Mic, Search, Play, FileAudio, Loader2 } from 'lucide-react';

interface VoiceNote {
    id: string;
    sender: string;
    chat_id: string;
    chat_name: string;
    date: string;
    duration: number;
    transcription?: string;
    is_transcribed: boolean;
}

export default function VoiceNotesSection() {
    const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [transcribingId, setTranscribingId] = useState<string | null>(null);
    const [chats, setChats] = useState<{ id: string; title: string }[]>([]);

    useEffect(() => {
        loadChatsAndNotes();
    }, []);

    async function loadChatsAndNotes() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();

            // Load chats
            const { data: chatsData } = await supabase
                .from('chats')
                .select('id, title')
                .order('title');
            setChats(chatsData || []);

            // Load voice notes
            const response = await fetch('/api/voice-notes', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setVoiceNotes(data.notes || []);
        } catch (err) {
            console.error('Failed to load voice notes:', err);
        }
        setLoading(false);
    }

    async function transcribeNote(noteId: string) {
        setTranscribingId(noteId);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch(`/api/voice-notes/${noteId}/transcribe`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setVoiceNotes(voiceNotes.map(n =>
                n.id === noteId
                    ? { ...n, is_transcribed: true, transcription: data.transcription }
                    : n
            ));
        } catch (err) {
            console.error('Failed to transcribe note:', err);
        }
        setTranscribingId(null);
    }

    const filteredNotes = voiceNotes.filter(note => {
        const matchesSearch = !searchTerm ||
            note.transcription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            note.sender.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesChat = !selectedChat || note.chat_id === selectedChat;
        return matchesSearch && matchesChat;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="space-y-4">
            {/* Search and Filter */}
            <div className="space-y-3">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search transcriptions..."
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-surface-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                </div>

                <select
                    value={selectedChat || ''}
                    onChange={(e) => setSelectedChat(e.target.value || null)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                >
                    <option value="">All Chats</option>
                    {chats.map((chat) => (
                        <option key={chat.id} value={chat.id}>{chat.title}</option>
                    ))}
                </select>
            </div>

            {filteredNotes.length === 0 ? (
                <div className="bg-white rounded-xl border border-surface-200 p-12 text-center">
                    <Mic className="w-8 h-8 text-surface-300 mx-auto mb-3" />
                    <p className="text-surface-600 font-medium">
                        {voiceNotes.length === 0 ? 'No voice notes' : 'No matching voice notes'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredNotes.map((note) => (
                        <div key={note.id} className="bg-white rounded-xl border border-surface-200 overflow-hidden">
                            <div
                                onClick={() => setExpandedId(expandedId === note.id ? null : note.id)}
                                className="p-4 cursor-pointer hover:bg-surface-50 transition-colors"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileAudio className="w-5 h-5 text-brand-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="font-medium text-surface-900">{note.sender}</p>
                                            <span className="text-xs text-surface-500 font-medium">
                                                {formatDuration(note.duration)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-surface-600 mb-1">{note.chat_name}</p>
                                        <p className="text-xs text-surface-400">
                                            {new Date(note.date).toLocaleDateString()}
                                        </p>
                                        {note.is_transcribed && note.transcription && (
                                            <p className="text-sm text-surface-700 mt-2 line-clamp-2">{note.transcription}</p>
                                        )}
                                    </div>
                                    <button className="flex-shrink-0 p-2 hover:bg-brand-50 rounded-lg transition-colors">
                                        <Play className="w-4 h-4 text-brand-600" />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded View */}
                            {expandedId === note.id && (
                                <div className="border-t border-surface-200 p-4 bg-surface-50">
                                    {note.is_transcribed && note.transcription ? (
                                        <div>
                                            <p className="text-xs font-semibold text-surface-900 mb-2">Transcription</p>
                                            <p className="text-sm text-surface-700 leading-relaxed">{note.transcription}</p>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => transcribeNote(note.id)}
                                            disabled={transcribingId === note.id}
                                            className="w-full px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {transcribingId === note.id ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Transcribing...
                                                </>
                                            ) : (
                                                <>
                                                    <Mic className="w-4 h-4" />
                                                    Transcribe
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
