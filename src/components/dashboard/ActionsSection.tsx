'use client';

import { useState, useEffect } from 'react';
import { supabase, getInternalUserId } from '@/lib/supabase';
import { CheckCircle, Clock, AlertTriangle, Filter } from 'lucide-react';

interface ActionItem {
  id: string;
  type: 'reminder' | 'commitment';
  title: string;
  description?: string;
  status: string;
  due_date?: string;
  remind_at?: string;
  created_at: string;
  priority?: string;
}

function timeAgo(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd ago';
  return d.toLocaleDateString();
}

export default function ActionsSection() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => { loadActions(); }, []);

  async function loadActions() {
    setLoading(true);
    const userId = await getInternalUserId();
    if (!userId) return;
    

    const [remRes, comRes] = await Promise.all([
      supabase.from('reminders').select('*').eq('user_id', userId).order('remind_at', { ascending: true }),
      supabase.from('commitments').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    ]);

    const actions: ActionItem[] = [];
    (remRes.data || []).forEach(r => {
      actions.push({ id: r.id, type: 'reminder', title: r.title || 'Reminder', description: r.description, status: r.status || 'active', remind_at: r.remind_at, created_at: r.created_at, priority: r.priority });
    });
    (comRes.data || []).forEach(c => {
      actions.push({ id: c.id, type: 'commitment', title: c.description || 'Commitment', status: c.status || 'pending', due_date: c.due_date, created_at: c.created_at });
    });

    setItems(actions);
    setLoading(false);
  }

  const now = new Date();
  const filtered = items.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'overdue') {
      const d = item.remind_at || item.due_date;
      return d && new Date(d) < now && item.status !== 'done' && item.status !== 'completed';
    }
    if (filter === 'active') return item.status === 'active' || item.status === 'pending';
    if (filter === 'done') return item.status === 'done' || item.status === 'completed';
    return true;
  });

  const overdueCount = items.filter(i => {
    const d = i.remind_at || i.due_date;
    return d && new Date(d) < now && i.status !== 'done' && i.status !== 'completed';
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Actions</h1>
        <p className="text-sm text-gray-500 mb-6">Reminders and commitments from your conversations</p>

        {overdueCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-700 font-medium">{overdueCount} overdue item{overdueCount !== 1 ? 's' : ''}</span>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {['all', 'active', 'overdue', 'done'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors '
                + (filter === f ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No actions found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => {
              const dueDate = item.remind_at || item.due_date;
              const isOverdue = dueDate && new Date(dueDate) < now && item.status !== 'done' && item.status !== 'completed';
              const isDone = item.status === 'done' || item.status === 'completed';
              return (
                <div key={item.id + item.type}
                  className={'border rounded-lg p-4 transition-all '
                    + (isOverdue ? 'border-red-200 bg-red-50' : isDone ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-100 bg-white hover:shadow-sm')}>
                  <div className="flex items-start gap-3">
                    <div className={'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 '
                      + (isOverdue ? 'bg-red-100' : isDone ? 'bg-green-100' : 'bg-blue-100')}>
                      {isDone ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Clock className="w-4 h-4 text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={'text-xs px-2 py-0.5 rounded-full font-medium '
                          + (item.type === 'reminder' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700')}>
                          {item.type === 'reminder' ? 'Reminder' : 'Commitment'}
                        </span>
                        {isOverdue && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Overdue</span>}
                      </div>
                      <p className={'text-sm font-medium ' + (isDone ? 'line-through text-gray-400' : 'text-gray-900')}>{item.title}</p>
                      {item.description && <p className="text-xs text-gray-500 mt-1">{item.description}</p>}
                      <p className="text-xs text-gray-400 mt-1">{dueDate ? timeAgo(dueDate) : timeAgo(item.created_at)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
