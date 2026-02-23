'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  AlertCircle, CheckCircle, MessageSquare, Paperclip,
  Users, Clock, ArrowRight, Sparkles, Calendar,
  TrendingUp, Bell
} from 'lucide-react';
import { TabType } from '@/types/dashboard';

interface HomeProps {
  onNavigate: (tab: TabType) => void;
}

interface Stats {
  totalChats: number;
  totalMessages: number;
  totalContacts: number;
  totalFiles: number;
  overdueReminders: number;
  pendingCommitments: number;
  upcomingReminders: number;
}

interface RecentItem {
  id: string;
  type: 'message' | 'reminder' | 'commitment' | 'file';
  title: string;
  subtitle: string;
  time: string;
  urgent?: boolean;
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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeSection({ onNavigate }: HomeProps) {
  const supabase = createClientComponentClient();
  const [stats, setStats] = useState<Stats>({
    totalChats: 0, totalMessages: 0, totalContacts: 0,
    totalFiles: 0, overdueReminders: 0, pendingCommitments: 0,
    upcomingReminders: 0
  });
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) return;
    const userId = session.session.user.id;
    setUserName(session.session.user.user_metadata?.full_name || session.session.user.email?.split('@')[0] || '');

    const now = new Date().toISOString();

    const [chatsRes, msgsRes, contactsRes, filesRes, remindersRes, commitmentsRes, upcomingRes] = await Promise.all([
      supabase.from('chats').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('messages').select('id', { count: 'exact', head: true }),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('attachments').select('id', { count: 'exact', head: true }),
      supabase.from('reminders').select('*').eq('user_id', userId).eq('status', 'active').lt('remind_at', now),
      supabase.from('commitments').select('*').eq('user_id', userId).eq('status', 'pending'),
      supabase.from('reminders').select('*').eq('user_id', userId).eq('status', 'active').gte('remind_at', now).order('remind_at').limit(5),
    ]);

    setStats({
      totalChats: chatsRes.count || 0,
      totalMessages: msgsRes.count || 0,
      totalContacts: contactsRes.count || 0,
      totalFiles: filesRes.count || 0,
      overdueReminders: remindersRes.data?.length || 0,
      pendingCommitments: commitmentsRes.data?.length || 0,
      upcomingReminders: upcomingRes.data?.length || 0,
    });

    const items: RecentItem[] = [];

    (remindersRes.data || []).forEach(r => {
      items.push({
        id: r.id,
        type: 'reminder',
        title: r.title || 'Untitled reminder',
        subtitle: 'Overdue',
        time: r.remind_at,
        urgent: true
      });
    });

    (commitmentsRes.data || []).slice(0, 5).forEach(c => {
      items.push({
        id: c.id,
        type: 'commitment',
        title: c.description || 'Commitment',
        subtitle: 'Pending',
        time: c.due_date || c.created_at,
      });
    });

    (upcomingRes.data || []).forEach(r => {
      items.push({
        id: r.id,
        type: 'reminder',
        title: r.title || 'Upcoming',
        subtitle: 'Scheduled',
        time: r.remind_at,
      });
    });

    items.sort((a, b) => {
      if (a.urgent && !b.urgent) return -1;
      if (!a.urgent && b.urgent) return 1;
      return new Date(a.time).getTime() - new Date(b.time).getTime();
    });

    setRecentItems(items.slice(0, 10));
    setLoading(false);
  }

  const attentionCount = stats.overdueReminders + stats.pendingCommitments;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {getGreeting()}{userName ? ', ' + userName : ''}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {attentionCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <h2 className="font-semibold text-amber-900">Needs Attention</h2>
              <span className="ml-auto bg-amber-200 text-amber-800 text-xs font-medium px-2 py-0.5 rounded-full">
                {attentionCount} item{attentionCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {stats.overdueReminders > 0 && (
                <button
                  onClick={() => onNavigate('actions')}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-amber-100 transition-colors text-left"
                >
                  <Clock className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-amber-900">
                    {stats.overdueReminders} overdue reminder{stats.overdueReminders !== 1 ? 's' : ''}
                  </span>
                  <ArrowRight className="w-4 h-4 text-amber-400 ml-auto" />
                </button>
              )}
              {stats.pendingCommitments > 0 && (
                <button
                  onClick={() => onNavigate('actions')}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-amber-100 transition-colors text-left"
                >
                  <CheckCircle className="w-4 h-4 text-orange-500" />
                  <span className="text-sm text-amber-900">
                    {stats.pendingCommitments} pending commitment{stats.pendingCommitments !== 1 ? 's' : ''}
                  </span>
                  <ArrowRight className="w-4 h-4 text-amber-400 ml-auto" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button onClick={() => onNavigate('messages')}
            className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-all text-left group">
            <MessageSquare className="w-5 h-5 text-emerald-500 mb-2" />
            <p className="text-2xl font-semibold text-gray-900">{stats.totalMessages.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">Messages</p>
          </button>
          <button onClick={() => onNavigate('messages')}
            className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-all text-left group">
            <Paperclip className="w-5 h-5 text-blue-500 mb-2" />
            <p className="text-2xl font-semibold text-gray-900">{stats.totalFiles.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">Files</p>
          </button>
          <button onClick={() => onNavigate('people')}
            className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-all text-left group">
            <Users className="w-5 h-5 text-violet-500 mb-2" />
            <p className="text-2xl font-semibold text-gray-900">{stats.totalContacts.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">Contacts</p>
          </button>
          <button onClick={() => onNavigate('actions')}
            className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-all text-left group">
            <Bell className="w-5 h-5 text-amber-500 mb-2" />
            <p className="text-2xl font-semibold text-gray-900">{stats.upcomingReminders}</p>
            <p className="text-xs text-gray-500 mt-0.5">Upcoming</p>
          </button>
        </div>

        {recentItems.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              Activity Feed
            </h2>
            <div className="space-y-2">
              {recentItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => onNavigate('actions')}
                  className={'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left '
                    + (item.urgent
                      ? 'border-red-200 bg-red-50 hover:bg-red-100'
                      : 'border-gray-100 bg-white hover:shadow-sm')}
                >
                  <div className={'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 '
                    + (item.type === 'reminder'
                      ? (item.urgent ? 'bg-red-100' : 'bg-blue-100')
                      : 'bg-orange-100')}>
                    {item.type === 'reminder'
                      ? <Clock className={'w-4 h-4 ' + (item.urgent ? 'text-red-600' : 'text-blue-600')} />
                      : <CheckCircle className="w-4 h-4 text-orange-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={'text-sm font-medium truncate '
                      + (item.urgent ? 'text-red-900' : 'text-gray-900')}>
                      {item.title}
                    </p>
                    <p className="text-xs text-gray-500">{item.subtitle} · {timeAgo(item.time)}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button onClick={() => onNavigate('messages')}
            className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-xl hover:shadow-md transition-all text-left">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Browse Messages</p>
              <p className="text-xs text-gray-500">{stats.totalChats} conversations</p>
            </div>
          </button>
          <button onClick={() => onNavigate('actions')}
            className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-xl hover:shadow-md transition-all text-left">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">View Actions</p>
              <p className="text-xs text-gray-500">Reminders & commitments</p>
            </div>
          </button>
          <button onClick={() => onNavigate('people')}
            className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-xl hover:shadow-md transition-all text-left">
            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">People</p>
              <p className="text-xs text-gray-500">{stats.totalContacts} contacts</p>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
}
