'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Loader2, X, Plus } from 'lucide-react';

interface Contact {
    id: string;
    display_name: string;
    wa_id: string;
    message_count: number;
    tags: string[];
    notes: string;
}

export default function ContactsSection() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [editingTags, setEditingTags] = useState(false);
    const [newTag, setNewTag] = useState('');

    useEffect(() => {
        loadContacts();
    }, [searchQuery]);

    async function loadContacts() {
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch(`/api/contacts?search=${encodeURIComponent(searchQuery)}`, {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setContacts(data.contacts || []);
        } catch (err) {
            console.error('Failed to load contacts:', err);
        }
    }

    async function loadContactDetails(contactId: string) {
        setDetailsLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch(`/api/contacts/${contactId}`, {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setSelectedContact(data.contact);
        } catch (err) {
            console.error('Failed to load contact details:', err);
        }
        setDetailsLoading(false);
    }

    async function addTag() {
        if (!selectedContact || !newTag.trim()) return;
        try {
            const session = await supabase.auth.getSession();
            const updatedTags = [...(selectedContact.tags || []), newTag];
            await fetch(`/api/contacts/${selectedContact.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({ tags: updatedTags }),
            });
            setSelectedContact({ ...selectedContact, tags: updatedTags });
            setNewTag('');
        } catch (err) {
            console.error('Failed to add tag:', err);
        }
    }

    async function removeTag(tag: string) {
        if (!selectedContact) return;
        try {
            const session = await supabase.auth.getSession();
            const updatedTags = (selectedContact.tags || []).filter((t: any) => t !== tag);
            await fetch(`/api/contacts/${selectedContact.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({ tags: updatedTags }),
            });
            setSelectedContact({ ...selectedContact, tags: updatedTags });
        } catch (err) {
            console.error('Failed to remove tag:', err);
        }
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Contacts List */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-green-600" />
                        Contacts
                    </h3>
                </div>
                <div className="p-4 border-b border-gray-100">
                    <input
                        type="text"
                        placeholder="Search contacts..."
                        value={searchQuery}
                        onChange={(e: any) => setSearchQuery(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                </div>
                <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                    {contacts.map((contact: any) => (
                        <button
                            key={contact.id}
                            onClick={() => loadContactDetails(contact.id)}
                            className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                                selectedContact?.id === contact.id ? 'bg-green-50' : ''
                            }`}
                        >
                            <p className="font-medium text-gray-900">{contact.display_name}</p>
                            <p className="text-xs text-gray-500 mt-1">{contact.wa_id}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{contact.message_count} messages</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Contact Details */}
            <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
                {detailsLoading ? (
                    <div className="p-6 flex items-center justify-center min-h-[400px]">
                        <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
                    </div>
                ) : selectedContact ? (
                    <div className="p-6 space-y-6">
                        {/* Contact Info */}
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-3">Contact Information</h3>
                            <div className="space-y-2">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase">Name</p>
                                    <p className="text-gray-900">{selectedContact.display_name}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase">WhatsApp ID</p>
                                    <p className="text-gray-900 font-mono text-sm">{selectedContact.wa_id}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase">Messages</p>
                                    <p className="text-gray-900">{selectedContact.message_count}</p>
                                </div>
                            </div>
                        </div>

                        {/* Tags */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-gray-900">Tags</h3>
                                <button
                                    onClick={() => setEditingTags(!editingTags)}
                                    className="text-sm text-green-600 hover:text-green-700 font-medium"
                                >
                                    {editingTags ? 'Done' : 'Edit'}
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {(selectedContact.tags || []).map((tag: any) => (
                                    <div key={tag} className="flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                                        {tag}
                                        {editingTags && (
                                            <button
                                                onClick={() => removeTag(tag)}
                                                className="hover:text-green-900"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {editingTags && (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newTag}
                                        onChange={(e: any) => setNewTag(e.target.value)}
                                        placeholder="Add new tag..."
                                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                    />
                                    <button
                                        onClick={addTag}
                                        className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
                            <textarea
                                value={selectedContact.notes || ''}
                                readOnly
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 text-gray-600 min-h-[100px] focus:outline-none"
                                placeholder="No notes yet"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="p-6 flex items-center justify-center min-h-[400px] text-gray-500">
                        Select a contact to view details
                    </div>
                )}
            </div>
        </div>
    );
}
