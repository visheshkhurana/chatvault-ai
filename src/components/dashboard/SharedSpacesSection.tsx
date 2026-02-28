'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Share2, Link, Plus, UserPlus, Loader2, Trash2 } from 'lucide-react';

interface SharedSpace {
    id: string;
    name: string;
    type: 'family' | 'team' | 'custom';
    description?: string;
    member_count: number;
    recent_activity?: string;
    invite_code?: string;
}

export default function SharedSpacesSection() {
    const [spaces, setSpaces] = useState<SharedSpace[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSpace, setSelectedSpace] = useState<SharedSpace | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showJoinForm, setShowJoinForm] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        type: 'family' as 'family' | 'team' | 'custom',
        description: '',
    });

    useEffect(() => {
        loadSpaces();
    }, []);

    async function loadSpaces() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/shared-spaces', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setSpaces(data.spaces || []);
        } catch (err) {
            console.error('Failed to load spaces:', err);
        }
        setLoading(false);
    }

    async function createSpace() {
        if (!formData.name.trim()) return;

        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/shared-spaces', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            setSpaces([...spaces, data.space]);
            setFormData({ name: '', type: 'family', description: '' });
            setShowCreateForm(false);
        } catch (err) {
            console.error('Failed to create space:', err);
        }
    }

    async function joinSpace() {
        if (!inviteCode.trim()) return;

        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/shared-spaces/join', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({ invite_code: inviteCode }),
            });
            const data = await response.json();
            setSpaces([...spaces, data.space]);
            setInviteCode('');
            setShowJoinForm(false);
        } catch (err) {
            console.error('Failed to join space:', err);
        }
    }

    async function deleteSpace(spaceId: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/shared-spaces/${spaceId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            setSpaces(spaces.filter(s => s.id !== spaceId));
            setSelectedSpace(null);
        } catch (err) {
            console.error('Failed to delete space:', err);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-brand-600" />
                    Shared Spaces
                </h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Create
                    </button>
                    <button
                        onClick={() => setShowJoinForm(!showJoinForm)}
                        className="px-4 py-2 bg-surface-100 text-surface-700 rounded-lg text-sm font-medium hover:bg-surface-200 flex items-center gap-2"
                    >
                        <UserPlus className="w-4 h-4" />
                        Join
                    </button>
                </div>
            </div>

            {/* Create Form */}
            {showCreateForm && (
                <div className="bg-white rounded-xl border border-surface-200 p-4 space-y-3">
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Space name..."
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                    />
                    <select
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                    >
                        <option value="family">Family</option>
                        <option value="team">Team</option>
                        <option value="custom">Custom</option>
                    </select>
                    <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Description (optional)"
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white h-20 resize-none"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={createSpace}
                            className="flex-1 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
                        >
                            Create Space
                        </button>
                        <button
                            onClick={() => setShowCreateForm(false)}
                            className="flex-1 px-3 py-2 bg-surface-100 text-surface-700 rounded-lg text-sm font-medium hover:bg-surface-200"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Join Form */}
            {showJoinForm && (
                <div className="bg-white rounded-xl border border-surface-200 p-4 space-y-3">
                    <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        placeholder="Invite code..."
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={joinSpace}
                            className="flex-1 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
                        >
                            Join Space
                        </button>
                        <button
                            onClick={() => setShowJoinForm(false)}
                            className="flex-1 px-3 py-2 bg-surface-100 text-surface-700 rounded-lg text-sm font-medium hover:bg-surface-200"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Spaces List */}
            {spaces.length === 0 ? (
                <div className="bg-white rounded-xl border border-surface-200 p-12 text-center">
                    <Users className="w-8 h-8 text-surface-300 mx-auto mb-3" />
                    <p className="text-surface-600 font-medium">No shared spaces yet</p>
                    <p className="text-surface-400 text-sm mt-1">Create a space or join one with an invite code</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {spaces.map((space) => (
                        <div
                            key={space.id}
                            onClick={() => setSelectedSpace(selectedSpace?.id === space.id ? null : space)}
                            className="bg-white rounded-xl border border-surface-200 p-4 cursor-pointer hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <h3 className="font-semibold text-surface-900">{space.name}</h3>
                                    <span className="inline-block text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded mt-1 capitalize">
                                        {space.type}
                                    </span>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteSpace(space.id);
                                    }}
                                    className="p-1 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                </button>
                            </div>

                            {space.description && (
                                <p className="text-sm text-surface-600 mb-2">{space.description}</p>
                            )}

                            <div className="flex items-center gap-4 text-xs text-surface-500 mb-2">
                                <div className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {space.member_count} members
                                </div>
                                {space.recent_activity && (
                                    <span>{space.recent_activity}</span>
                                )}
                            </div>

                            {/* Expanded Details */}
                            {selectedSpace?.id === space.id && (
                                <div className="mt-3 pt-3 border-t border-surface-200 space-y-2">
                                    {space.invite_code && (
                                        <div className="bg-surface-50 rounded-lg p-2">
                                            <p className="text-xs font-semibold text-surface-900 mb-1">Invite Code</p>
                                            <div className="flex items-center justify-between">
                                                <code className="text-xs text-surface-700">{space.invite_code}</code>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(space.invite_code || '');
                                                    }}
                                                    className="p-1 hover:bg-brand-50 rounded transition-colors"
                                                >
                                                    <Link className="w-3 h-3 text-brand-600" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <button className="w-full px-3 py-2 bg-brand-50 text-brand-700 rounded-lg text-sm font-medium hover:bg-brand-100 flex items-center justify-center gap-2">
                                        <Share2 className="w-4 h-4" />
                                        Share Items
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
