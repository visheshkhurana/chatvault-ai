'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { FolderOpen, Loader2, Sparkles, Plus, Trash2, Tag, Brain } from 'lucide-react';

interface Label {
    id: string;
    name: string;
    color: string;
    icon: string;
    is_smart: boolean;
    chat_ids: string[];
    chatCount?: number;
}

export default function LabelsSection() {
    const [labels, setLabels] = useState<Label[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('#10b981');
    const [categorizing, setCategorizing] = useState(false);
    const [suggestions, setSuggestions] = useState<any[]>([]);

    useEffect(() => { loadLabels(); }, []);

    async function loadLabels() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const res = await fetch('/api/labels', { headers: { 'Authorization': `Bearer ${session.data.session?.access_token}` } });
            const data = await res.json();
            setLabels(Array.isArray(data) ? data : (data.labels || []));
        } catch (err) { console.error(err); }
        setLoading(false);
    }

    async function createLabel() {
        if (!newName.trim()) return;
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/labels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ name: newName, color: newColor }),
            });
            setNewName(''); setShowForm(false);
            loadLabels();
        } catch (err) { console.error(err); }
    }

    async function deleteLabel(id: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/labels', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            loadLabels();
        } catch (err) { console.error(err); }
    }

    async function autoCategorize() {
        setCategorizing(true);
        try {
            const session = await supabase.auth.getSession();
            const res = await fetch('/api/labels/auto-categorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
            });
            const data = await res.json();
            setSuggestions(data.suggestions || []);
        } catch (err) { console.error(err); }
        setCategorizing(false);
    }

    const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#6366f1'];

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <FolderOpen className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-surface-900">Labels & Folders</h2>
                        <p className="text-sm text-surface-500">Organize your chats into custom categories</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={autoCategorize} disabled={categorizing} className="px-4 py-2 border border-surface-200 rounded-xl text-sm font-medium text-surface-700 hover:bg-surface-50 flex items-center gap-2">
                        {categorizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Auto-Categorize
                    </button>
                    <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 flex items-center gap-2">
                        <Plus className="w-4 h-4" /> New Label
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="bg-white border border-surface-200 rounded-xl p-5 mb-6">
                    <div className="space-y-3">
                        <input value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder="Label name" className="w-full px-3 py-2.5 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-surface-600">Color:</span>
                            <div className="flex gap-2">
                                {COLORS.map((c) => (
                                    <button key={c} onClick={() => setNewColor(c)} className={`w-7 h-7 rounded-full border-2 ${newColor === c ? 'border-surface-900 scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={createLabel} className="px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700">Create</button>
                            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-surface-200 rounded-xl text-sm text-surface-600 hover:bg-surface-50">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Suggestions */}
            {suggestions.length > 0 && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mb-6">
                    <h3 className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-2"><Brain className="w-4 h-4" /> AI Suggestions</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {suggestions.map((s: any, i: number) => (
                            <div key={i} className="bg-white rounded-lg p-3 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-surface-800">{s.chatTitle}</p>
                                    <div className="flex gap-1 mt-1">{s.suggestedLabels?.map((l: string, j: number) => (
                                        <span key={j} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs">{l}</span>
                                    ))}</div>
                                </div>
                                <span className="text-xs text-surface-400">{(s.confidence * 100).toFixed(0)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-surface-400" /></div>
            ) : labels.length === 0 ? (
                <div className="text-center py-16 text-surface-400">
                    <Tag className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No labels yet</p>
                    <p className="text-sm">Create labels to organize your chats, or let AI auto-categorize them</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {labels.map((l) => (
                        <div key={l.id} className="bg-white border border-surface-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: l.color }} />
                                    <h3 className="font-semibold text-surface-900">{l.name}</h3>
                                </div>
                                <button onClick={() => deleteLabel(l.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-surface-400 hover:text-red-500" /></button>
                            </div>
                            <p className="text-sm text-surface-500">{l.chatCount || l.chat_ids?.length || 0} chats</p>
                            {l.is_smart && <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full mt-2 inline-block">Smart Label</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
