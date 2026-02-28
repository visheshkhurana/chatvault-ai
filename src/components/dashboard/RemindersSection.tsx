'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, Plus, Loader2, CheckSquare, Clock, AlertTriangle, Brain, Sparkles } from 'lucide-react';

interface Reminder {
    id: string;
    chat_id: string;
    text: string;
    due_at: string;
    status: string;
    isOverdue?: boolean;
    created_at: string;
}

export default function RemindersSection() {
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [showForm, setShowForm] = useState(false);
    const [newText, setNewText] = useState('');
    const [newDueAt, setNewDueAt] = useState('');
    const [extracting, setExtracting] = useState(false);
    const [extracted, setExtracted] = useState<any[]>([]);
    const [chats, setChats] = useState<any[]>([]);
    const [extractChatId, setExtractChatId] = useState('');

    useEffect(() => {
        loadReminders();
        async function loadChats() {
            const { data } = await supabase.from('chats').select('id, title').order('last_message_at', { ascending: false });
            setChats(data || []);
        }
        loadChats();
    }, []);

    useEffect(() => { loadReminders(); }, [statusFilter]);

    async function loadReminders() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const res = await fetch(`/api/reminders?status=${statusFilter}`, { headers: { 'Authorization': `Bearer ${session.data.session?.access_token}` } });
            const data = await res.json();
            setReminders(data.reminders || []);
        } catch (err) { console.error(err); }
        setLoading(false);
    }

    async function createReminder() {
        if (!newText.trim() || !newDueAt) return;
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ text: newText, dueAt: new Date(newDueAt).toISOString() }),
            });
            setNewText(''); setNewDueAt(''); setShowForm(false);
            loadReminders();
        } catch (err) { console.error(err); }
    }

    async function markDone(id: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/reminders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ id, status: 'done' }),
            });
            loadReminders();
        } catch (err) { console.error(err); }
    }

    async function extractReminders() {
        if (!extractChatId) return;
        setExtracting(true);
        try {
            const session = await supabase.auth.getSession();
            const res = await fetch('/api/reminders/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ chatId: extractChatId }),
            });
            const data = await res.json();
            setExtracted(data.extracted || []);
        } catch (err) { console.error(err); }
        setExtracting(false);
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Bell className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-surface-900">Reminders</h2>
                        <p className="text-sm text-surface-500">Track follow-ups and deadlines from your conversations</p>
                    </div>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Reminder
                </button>
            </div>

            {showForm && (
                <div className="bg-white border border-surface-200 rounded-xl p-5 mb-6">
                    <div className="space-y-3">
                        <input value={newText} onChange={(e: any) => setNewText(e.target.value)} placeholder="What do you need to remember?" className="w-full px-3 py-2.5 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        <div className="flex gap-3">
                            <input type="datetime-local" value={newDueAt} onChange={(e: any) => setNewDueAt(e.target.value)} className="flex-1 px-3 py-2.5 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                            <button onClick={createReminder} className="px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Extract */}
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2"><Brain className="w-4 h-4 text-purple-600" /><span className="text-sm font-semibold text-purple-700">AI Extract Reminders</span></div>
                <div className="flex gap-3">
                    <select value={extractChatId} onChange={(e: any) => setExtractChatId(e.target.value)} className="flex-1 px-3 py-2 border border-purple-200 rounded-xl text-sm bg-white">
                        <option value="">Select a chat to scan...</option>
                        {chats.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    <button onClick={extractReminders} disabled={extracting || !extractChatId} className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
                        {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Extract
                    </button>
                </div>
                {extracted.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {extracted.map((e: any, i: number) => (
                            <div key={i} className="bg-white rounded-lg p-3 flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-surface-800">{e.text}</p>
                                    <p className="text-xs text-surface-400">{e.suggestedDueAt ? new Date(e.suggestedDueAt).toLocaleDateString() : 'No date'} • {(e.confidence * 100).toFixed(0)}% confidence</p>
                                </div>
                                <button onClick={() => { setNewText(e.text); setNewDueAt(e.suggestedDueAt?.substring(0, 16) || ''); setShowForm(true); }} className="px-3 py-2 bg-brand-600 text-white rounded-lg text-xs hover:bg-brand-700">Add</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Filter */}
            <div className="flex gap-1 bg-surface-100 rounded-xl p-0.5 w-fit mb-6">
                {['pending', 'overdue', 'done'].map((s) => (
                    <button key={s} onClick={() => setStatusFilter(s)} className={`px-4 py-2 rounded-lg text-xs font-medium capitalize ${statusFilter === s ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500'}`}>{s}</button>
                ))}
            </div>

            {loading ? (
                <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-surface-400" /></div>
            ) : reminders.length === 0 ? (
                <div className="text-center py-16 text-surface-400">
                    <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No {statusFilter} reminders</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {reminders.map((r) => (
                        <div key={r.id} className={`bg-white border rounded-xl p-4 flex items-center justify-between ${r.isOverdue ? 'border-red-200 bg-red-50' : 'border-surface-200'}`}>
                            <div className="flex items-center gap-3">
                                {r.isOverdue ? <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" /> : <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />}
                                <div>
                                    <p className={`text-sm font-medium ${r.status === 'done' ? 'line-through text-surface-400' : 'text-surface-900'}`}>{r.text}</p>
                                    <p className="text-xs text-surface-400">Due: {new Date(r.due_at).toLocaleString()}</p>
                                </div>
                            </div>
                            {r.status !== 'done' && (
                                <button onClick={() => markDone(r.id)} className="px-3 py-2 bg-brand-100 text-brand-700 rounded-lg text-xs font-medium hover:bg-brand-200 flex items-center gap-1">
                                    <CheckSquare className="w-3 h-3" /> Done
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
