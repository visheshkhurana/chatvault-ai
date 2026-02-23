'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Search, MessageSquare, Phone } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  phone: string;
  message_count: number;
  last_seen?: string;
  tags?: string[];
  notes?: string;
}

function formatPhone(phone: string): string {
  if (!phone) return 'Unknown';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    const n = cleaned.slice(2);
    return '+91 ' + n.slice(0, 5) + ' ' + n.slice(5);
  }
  if (cleaned.length >= 10) {
    const last10 = cleaned.slice(-10);
    return '+' + cleaned.slice(0, -10) + ' ' + last10.slice(0, 5) + ' ' + last10.slice(5);
  }
  return phone;
}

function avatarColor(name: string): string {
  const colors = ['bg-emerald-100 text-emerald-700', 'bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700'];
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
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) return;
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', session.session.user.id)
      .order('name', { ascending: true });
    setContacts(data || []);
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
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex">
      <div className={'border-r border-gray-100 overflow-y-auto '
        + (selected ? 'hidden md:block md:w-80' : 'w-full md:w-80')}>
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search contacts..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <p className="text-xs text-gray-400 mt-2">{contacts.length} contacts</p>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No contacts found</p>
          </div>
        ) : (
          filtered.map(contact => (
            <button key={contact.id} onClick={() => setSelected(contact)}
              className={'w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors '
                + (selected?.id === contact.id ? 'bg-emerald-50' : '')}>
              <div className="flex items-center gap-3">
                <div className={'w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ' + avatarColor(contact.name)}>
                  {(contact.name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{contact.name || formatPhone(contact.phone)}</p>
                  <p className="text-xs text-gray-400">{formatPhone(contact.phone)}</p>
                </div>
                {contact.message_count > 0 && (
                  <span className="text-xs text-gray-400">{contact.message_count} msgs</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {selected ? (
        <div className="flex-1 p-6 overflow-y-auto">
          <button onClick={() => setSelected(null)} className="md:hidden text-sm text-emerald-600 mb-4">Back</button>
          <div className="max-w-lg">
            <div className="flex items-center gap-4 mb-6">
              <div className={'w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl ' + avatarColor(selected.name)}>
                {(selected.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selected.name || 'Unknown'}</h2>
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {formatPhone(selected.phone)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Messages</p>
                <p className="text-lg font-semibold text-gray-900">{selected.message_count || 0}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Last Seen</p>
                <p className="text-sm font-medium text-gray-900">{selected.last_seen ? new Date(selected.last_seen).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>
            {selected.notes && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-1">Notes</h3>
                <p className="text-sm text-gray-600">{selected.notes}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-gray-400">
          <div className="text-center">
            <Users className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a contact to view details</p>
          </div>
        </div>
      )}
    </div>
  );
}
