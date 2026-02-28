'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BookOpen, Tag, Pin, Archive, Plus, Search, Loader2, Trash2 } from 'lucide-react';

interface KBEntry {
    id: string;
    title: string;
    content: string;
    category: string;
    tags?: string[];
    source?: string;
    is_pinned: boolean;
    is_archived: boolean;
}

const CATEGORIES = ['All', 'Recipes', 'Recommendations', 'Tips', 'Addresses', 'Links', 'Ideas', 'Health', 'Other'];

export default function KnowledgeBaseSection() {
    const [entries, setEntries] = useState<KBEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        category: 'Tips',
        tags: '',
        source: '',
    });

    useEffect(() => {
        loadEntries();
    }, []);

    async function loadEntries() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/knowledge-base', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setEntries(data.entries || []);
        } catch (err) {
            console.error('Failed to load knowledge base:', err);
        }
        setLoading(false);
    }

    async function addEntry() {
        if (!formData.title.trim() || !formData.content.trim()) return;

        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/knowledge-base', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({
                    title: formData.title,
                    content: formData.content,
                    category: formData.category,
                    tags: formData.tags.split(',').map(t => t.trim()).filter(t => t),
                    source: formData.source || null,
                }),
            });
            const data = await response.json();
            setEntries([...entries, data.entry]);
            setFormData({ title: '', content: '', category: 'Tips', tags: '', source: '' });
            setShowAddForm(false);
        } catch (err) {
            console.error('Failed to add entry:', err);
        }
    }

    async function togglePin(entryId: string) {
        const entry = entries.find(e => e.id === entryId);
        if (!entry) return;

        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/knowledge-base/${entryId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({ is_pinned: !entry.is_pinned }),
            });
            setEntries(entries.map(e =>
                e.id === entryId ? { ...e, is_pinned: !e.is_pinned } : e
            ));
        } catch (err) {
            console.error('Failed to toggle pin:', err);
        }
    }

    async function toggleArchive(entryId: string) {
        const entry = entries.find(e => e.id === entryId);
        if (!entry) return;

        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/knowledge-base/${entryId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({ is_archived: !entry.is_archived }),
            });
            setEntries(entries.map(e =>
                e.id === entryId ? { ...e, is_archived: !e.is_archived } : e
            ));
        } catch (err) {
            console.error('Failed to toggle archive:', err);
        }
    }

    async function deleteEntry(entryId: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/knowledge-base/${entryId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            setEntries(entries.filter(e => e.id !== entryId));
        } catch (err) {
            console.error('Failed to delete entry:', err);
        }
    }

    const filteredEntries = entries.filter(entry => {
        if (entry.is_archived) return false;
        const categoryMatch = selectedCategory === 'All' || entry.category === selectedCategory;
        const searchMatch = !searchTerm || entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.content.toLowerCase().includes(searchTerm.toLowerCase());
        return categoryMatch && searchMatch;
    });

    const pinnedEntries = filteredEntries.filter(e => e.is_pinned);
    const unpinnedEntries = filteredEntries.filter(e => !e.is_pinned);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-brand-600" />
                    Knowledge Base
                </h2>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Add Entry
                </button>
            </div>

            {/* Add Form */}
            {showAddForm && (
                <div className="bg-white rounded-xl border border-surface-200 p-4 space-y-3">
                    <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Title..."
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <textarea
                        value={formData.content}
                        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                        placeholder="Content..."
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 h-24 resize-none"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                        >
                            {CATEGORIES.slice(1).map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={formData.source}
                            onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                            placeholder="Source (optional)"
                            className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                        />
                    </div>
                    <input
                        type="text"
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        placeholder="Tags (comma-separated)"
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={addEntry}
                            className="flex-1 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
                        >
                            Save
                        </button>
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="flex-1 px-3 py-2 bg-surface-100 text-surface-700 rounded-lg text-sm font-medium hover:bg-surface-200"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Search and Filters */}
            <div className="space-y-3">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search entries..."
                        className="w-full pl-12 pr-4 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                selectedCategory === cat
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Entries */}
            {filteredEntries.length === 0 ? (
                <div className="bg-white rounded-xl border border-surface-200 p-6 sm:p-12 text-center">
                    <BookOpen className="w-8 h-8 text-surface-300 mx-auto mb-3" />
                    <p className="text-surface-600 font-medium">No entries in this category</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {pinnedEntries.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-surface-500 mb-2 uppercase">Pinned</p>
                            <div className="space-y-2">
                                {pinnedEntries.map(entry => (
                                    <div key={entry.id} className="bg-white rounded-xl border border-surface-200 p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <h4 className="font-medium text-surface-900">{entry.title}</h4>
                                                <span className="inline-block text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded mt-1">
                                                    {entry.category}
                                                </span>
                                            </div>
                                            <Pin className="w-4 h-4 text-brand-600 flex-shrink-0" />
                                        </div>
                                        <p className="text-sm text-surface-600 mb-2 line-clamp-2">{entry.content}</p>
                                        {entry.tags && entry.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {entry.tags.map((tag, i) => (
                                                    <span key={i} className="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {entry.source && (
                                            <p className="text-xs text-surface-400 mb-2">Source: {entry.source}</p>
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => togglePin(entry.id)}
                                                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-brand-700 bg-brand-50 rounded hover:bg-brand-100"
                                            >
                                                <Pin className="w-3 h-3" />
                                                Unpin
                                            </button>
                                            <button
                                                onClick={() => toggleArchive(entry.id)}
                                                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-surface-700 bg-surface-100 rounded hover:bg-surface-200"
                                            >
                                                <Archive className="w-3 h-3" />
                                                Archive
                                            </button>
                                            <button
                                                onClick={() => deleteEntry(entry.id)}
                                                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {unpinnedEntries.length > 0 && (
                        <div>
                            {pinnedEntries.length > 0 && (
                                <p className="text-xs font-semibold text-surface-500 mb-2 mt-4 uppercase">Other Entries</p>
                            )}
                            <div className="space-y-2">
                                {unpinnedEntries.map(entry => (
                                    <div key={entry.id} className="bg-white rounded-xl border border-surface-200 p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <h4 className="font-medium text-surface-900">{entry.title}</h4>
                                                <span className="inline-block text-xs bg-surface-100 text-surface-700 px-2 py-0.5 rounded mt-1">
                                                    {entry.category}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-surface-600 mb-2 line-clamp-2">{entry.content}</p>
                                        {entry.tags && entry.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {entry.tags.map((tag, i) => (
                                                    <span key={i} className="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {entry.source && (
                                            <p className="text-xs text-surface-400 mb-2">Source: {entry.source}</p>
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => togglePin(entry.id)}
                                                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-surface-700 bg-surface-100 rounded hover:bg-surface-200"
                                            >
                                                <Pin className="w-3 h-3" />
                                                Pin
                                            </button>
                                            <button
                                                onClick={() => toggleArchive(entry.id)}
                                                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-surface-700 bg-surface-100 rounded hover:bg-surface-200"
                                            >
                                                <Archive className="w-3 h-3" />
                                                Archive
                                            </button>
                                            <button
                                                onClick={() => deleteEntry(entry.id)}
                                                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
