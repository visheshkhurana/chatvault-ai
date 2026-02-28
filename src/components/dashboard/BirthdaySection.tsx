'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Gift, Cake, Heart, Bell, Plus, Calendar, Loader2, Trash2 } from 'lucide-react';

interface BirthdayEntry {
    id: string;
    name: string;
    date: string;
    type: 'birthday' | 'anniversary';
    days_until: number;
    reminder_enabled: boolean;
    suggested_message?: string;
}

export default function BirthdaySection() {
    const [entries, setEntries] = useState<BirthdayEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        date: '',
        type: 'birthday' as 'birthday' | 'anniversary',
    });

    useEffect(() => {
        loadEntries();
    }, []);

    async function loadEntries() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/birthdays', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            // Sort by days_until
            const sorted = (data.entries || []).sort((a: BirthdayEntry, b: BirthdayEntry) => a.days_until - b.days_until);
            setEntries(sorted);
        } catch (err) {
            console.error('Failed to load entries:', err);
        }
        setLoading(false);
    }

    async function addEntry() {
        if (!formData.name.trim() || !formData.date) return;

        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/birthdays', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            const newEntries = [...entries, data.entry];
            const sorted = newEntries.sort((a: BirthdayEntry, b: BirthdayEntry) => a.days_until - b.days_until);
            setEntries(sorted);
            setFormData({ name: '', date: '', type: 'birthday' });
            setShowAddForm(false);
        } catch (err) {
            console.error('Failed to add entry:', err);
        }
    }

    async function toggleReminder(entryId: string, enabled: boolean) {
        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/birthdays/${entryId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({ reminder_enabled: !enabled }),
            });
            setEntries(entries.map(e =>
                e.id === entryId ? { ...e, reminder_enabled: !enabled } : e
            ));
        } catch (err) {
            console.error('Failed to toggle reminder:', err);
        }
    }

    async function deleteEntry(entryId: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/birthdays/${entryId}`, {
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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    const upcomingEntries = entries.filter(e => e.days_until <= 30);
    const laterEntries = entries.filter(e => e.days_until > 30);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
                    <Gift className="w-5 h-5 text-brand-600" />
                    Birthdays & Anniversaries
                </h2>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Add Date
                </button>
            </div>

            {/* Add Form */}
            {showAddForm && (
                <div className="bg-white rounded-xl border border-surface-200 p-4 space-y-3">
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Name..."
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                        />
                        <select
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                            className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                        >
                            <option value="birthday">Birthday</option>
                            <option value="anniversary">Anniversary</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={addEntry}
                            className="flex-1 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
                        >
                            Add
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

            {entries.length === 0 ? (
                <div className="bg-white rounded-xl border border-surface-200 p-6 sm:p-12 text-center">
                    <Calendar className="w-8 h-8 text-surface-300 mx-auto mb-3" />
                    <p className="text-surface-600 font-medium">No dates added yet</p>
                    <p className="text-surface-400 text-sm mt-1">Add birthdays and anniversaries to get reminders</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Upcoming */}
                    {upcomingEntries.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-surface-500 mb-2 uppercase">Upcoming (Next 30 days)</p>
                            <div className="space-y-2">
                                {upcomingEntries.map(entry => (
                                    <div key={entry.id} className="bg-white rounded-xl border border-surface-200 p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-semibold text-surface-900">{entry.name}</h3>
                                                    {entry.type === 'birthday' ? (
                                                        <Cake className="w-4 h-4 text-amber-600" />
                                                    ) : (
                                                        <Heart className="w-4 h-4 text-rose-600" />
                                                    )}
                                                </div>
                                                <p className="text-sm text-surface-600">
                                                    {entry.days_until === 0 ? "Today!" : `In ${entry.days_until} day${entry.days_until !== 1 ? 's' : ''}`}
                                                </p>
                                                <p className="text-xs text-surface-400 mt-1">
                                                    {new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => deleteEntry(entry.id)}
                                                className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4 text-red-600" />
                                            </button>
                                        </div>

                                        {entry.suggested_message && (
                                            <div className="mb-2 p-2 bg-surface-50 rounded-lg border border-surface-100">
                                                <p className="text-xs font-semibold text-surface-900 mb-1">Suggested Message</p>
                                                <p className="text-xs text-surface-700 italic">{entry.suggested_message}</p>
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => toggleReminder(entry.id, entry.reminder_enabled)}
                                                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                                    entry.reminder_enabled
                                                        ? 'bg-blue-50 text-blue-700'
                                                        : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                                                }`}
                                            >
                                                <Bell className="w-3 h-3" />
                                                {entry.reminder_enabled ? 'On' : 'Off'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Later */}
                    {laterEntries.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-surface-500 mb-2 uppercase">Later</p>
                            <div className="space-y-2">
                                {laterEntries.map(entry => (
                                    <div key={entry.id} className="bg-white rounded-xl border border-surface-200 p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-semibold text-surface-900">{entry.name}</h3>
                                                    {entry.type === 'birthday' ? (
                                                        <Cake className="w-4 h-4 text-amber-600" />
                                                    ) : (
                                                        <Heart className="w-4 h-4 text-rose-600" />
                                                    )}
                                                </div>
                                                <p className="text-sm text-surface-600">
                                                    In {entry.days_until} days
                                                </p>
                                                <p className="text-xs text-surface-400 mt-1">
                                                    {new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => deleteEntry(entry.id)}
                                                className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4 text-red-600" />
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => toggleReminder(entry.id, entry.reminder_enabled)}
                                                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                                    entry.reminder_enabled
                                                        ? 'bg-blue-50 text-blue-700'
                                                        : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                                                }`}
                                            >
                                                <Bell className="w-3 h-3" />
                                                {entry.reminder_enabled ? 'On' : 'Off'}
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
