'use client';

import { useState, useEffect } from 'react';
import { supabase, getInternalUserId } from '@/lib/supabase';
import { Users, Search, Phone, ArrowLeft } from 'lucide-react';
import { formatPhone, getDisplayName, getInitials } from '@/lib/format-contact';

interface Contact {
  id: string;
  name: string;
  phone: string;
  last_seen?: string;
  tags?: string[];
}

function avatarColor(name: string): string {
  const colors = [
    'bg-brand-100 text-brand-700',
    'bg-blue-100 text-blue-700',
    'bg-violet-100 text-violet-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function PeopleSection() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Contact | null>(null);

  useEffect(() => { loadContacts(); }, []);

  async function loadContacts() {
    setLoading(true);
    const userId = await getInternalUserId();
    if (!userId) return;
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .order('display_name', { ascending: true });
    setContacts((data || []).map((c: any) => ({
      id: c.id,
      name: getDisplayName(c.display_name, c.wa_id),
      phone: c.wa_id,
      last_seen: c.updated_at,
      tags: c.tags,
    })));
    setLoading(false);
  }

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex">
      <div className={'border-r border-surface-100 overflow-y-auto '
        + (selected ? 'hidden md:block md:w-80' : 'w-full md:w-80')}>
        <div className="p-4 border-b border-surface-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input type="text" placeholder="Search contacts..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white" />
          </div>
          <p className="text-xs text-surface-400 mt-2">{contacts.length} contacts</p>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-500 text-sm">No contacts found</p>
          </div>
        ) : (
          filtered.map(contact => {
            const initials = getInitials(contact.name);
            return (
              <button key={contact.id} onClick={() => setSelected(contact)}
                className={'w-full text-left px-4 py-3.5 border-b border-surface-50 hover:bg-surface-50 transition-colors '
                  + (selected?.id === contact.id ? 'bg-brand-50/50' : '')}>
                <div className="flex items-center gap-3">
                  <div className={'w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ' + avatarColor(contact.name)}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-surface-900 text-sm truncate">{contact.name}</p>
                    <p className="text-xs text-surface-400">{formatPhone(contact.phone)}</p>
                  </div>
                  {/* message count not tracked in contacts table */}
                </div>
              </button>
            );
          })
        )}
      </div>

      {selected ? (
        <div className="flex-1 p-6 overflow-y-auto">
          <button onClick={() => setSelected(null)} className="md:hidden flex items-center gap-1 text-sm text-brand-600 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="max-w-lg">
            <div className="flex items-center gap-4 mb-6">
              <div className={'w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl ' + avatarColor(selected.name)}>
                {getInitials(selected.name)}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-surface-900">{selected.name}</h2>
                <p className="text-sm text-surface-500 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {formatPhone(selected.phone)}
                </p>
              </div>
            </div>
            <div className="mb-6">
              <div className="bg-surface-50 rounded-xl p-4 inline-block">
                <p className="text-xs text-surface-500 mb-1">Last Active</p>
                <p className="text-sm font-medium text-surface-900">{selected.last_seen ? new Date(selected.last_seen).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>
            {selected.tags && selected.tags.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-surface-700 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.map((tag, i) => (
                    <span key={i} className="px-2.5 py-1 bg-brand-50 text-brand-700 text-xs rounded-full font-medium">{tag}</span>
                  ))}
                </div>
              </div>
            )}
            {/* notes not stored in contacts table yet */}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-surface-400 bg-surface-50/30">
          <div className="text-center">
            <Users className="w-16 h-16 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Select a contact to view details</p>
          </div>
        </div>
      )}
    </div>
  );
}
