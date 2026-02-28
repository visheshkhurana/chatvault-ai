'use client';

import { useState, useEffect } from 'react';
import { supabase, getInternalUserId } from '@/lib/supabase';
import {
  AlertCircle, CheckCircle, MessageSquare, Paperclip,
  Users, Clock, ArrowRight, Sparkles, Calendar,
  TrendingUp, Bell, Search, Bot, BarChart3
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
    const userId = await getInternalUserId();
    if (!userId) return;

    const { data: { session: s } } = await supabase.auth.getSession();
    setUserName(s?.user?.user_metadata?.full_name || s?.user?.email?.split('@')[0] || '');

    const now = new Date().toISOString();

    const [chatsRes, msgsRes, contactsRes, filesRes, remindersRes, commitmentsRes, upcomingRes] = await Promise.all([
      supabase.from('chats').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('attachments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
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
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold text-surface-900">
            {getGreeting()}{userName ? ', ' + userName : ''}
          </h1>
          <p className="text-surface-500 mt-0.5 text-sm">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Attention banner */}
        {attentionCount > 0 && (
          <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-amber-600" />
              </div>
              <h2 className="font-semibold text-amber-900 text-sm">Needs Attention</h2>
              <span className="ml-auto bg-amber-200 text-amber-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                {attentionCount} item{attentionCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1.5">
              {stats.overdueReminders > 0 && (
                <button
                  onClick={() => onNavigate('actions')}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-amber-100/80 transition-colors text-left group"
                >
                  <Clock className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-amber-900">
                    {stats.overdueReminders} overdue reminder{stats.overdueReminders !== 1 ? 's' : ''}
                  </span>
                  <ArrowRight className="w-4 h-4 text-amber-300 ml-auto group-hover:text-amber-500 transition-colors" />
                </button>
              )}
              {stats.pendingCommitments > 0 && (
                <button
                  onClick={() => onNavigate('actions')}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-amber-100/80 transition-colors text-left group"
                >
                  <CheckCircle className="w-4 h-4 text-orange-500" />
                  <span className="text-sm text-amber-900">
                    {stats.pendingCommitments} pending commitment{stats.pendingCommitments !== 1 ? 's' : ''}
                  </span>
                  <ArrowRight className="w-4 h-4 text-amber-300 ml-auto group-hover:text-amber-500 transition-colors" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: MessageSquare, label: 'Messages', value: stats.totalMessages, color: 'bg-brand-50 text-brand-600', tab: 'messages' as TabType },
            { icon: Paperclip, label: 'Files', value: stats.totalFiles, color: 'bg-blue-50 text-blue-600', tab: 'messages' as TabType },
            { icon: Users, label: 'Contacts', value: stats.totalContacts, color: 'bg-violet-50 text-violet-600', tab: 'people' as TabType },
            { icon: Bell, label: 'Upcoming', value: stats.upcomingReminders, color: 'bg-amber-50 text-amber-600', tab: 'actions' as TabType },
          ].map((stat) => (
            <button
              key={stat.label}
              onClick={() => onNavigate(stat.tab)}
              className="bg-white border border-surface-100 rounded-xl p-4 hover:shadow-md hover:border-surface-200 transition-all text-left group"
            >
              <div className={'w-8 h-8 rounded-lg flex items-center justify-center mb-3 ' + stat.color}>
                <stat.icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold text-surface-900 tracking-tight">{stat.value.toLocaleString()}</p>
              <p className="text-xs text-surface-400 mt-0.5 font-medium">{stat.label}</p>
            </button>
          ))}
        </div>

        {/* Two-column layout: Activity + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Activity Feed */}
          <div className="lg:col-span-3">
            {recentItems.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-surface-900 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-500" />
                  Activity
                </h2>
                <div className="space-y-2">
                  {recentItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => onNavigate('actions')}
                      className={'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group '
                        + (item.urgent
                          ? 'border-red-200/80 bg-red-50/50 hover:bg-red-50'
                          : 'border-surface-100 bg-white hover:shadow-sm hover:border-surface-200')}
                    >
                      <div className={'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 '
                        + (item.type === 'reminder'
                          ? (item.urgent ? 'bg-red-100' : 'bg-blue-100')
                          : 'bg-orange-100')}>
                        {item.type === 'reminder'
                          ? <Clock className={'w-4 h-4 ' + (item.urgent ? 'text-red-600' : 'text-blue-600')} />
                          : <CheckCircle className="w-4 h-4 text-orange-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={'text-sm font-medium truncate '
                          + (item.urgent ? 'text-red-900' : 'text-surface-900')}>
                          {item.title}
                        </p>
                        <p className="text-xs text-surface-400">{item.subtitle} · {timeAgo(item.time)}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-surface-300 flex-shrink-0 group-hover:text-surface-500 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recentItems.length === 0 && (
              <div className="bg-white border border-surface-100 rounded-xl p-8 text-center">
                <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-6 h-6 text-brand-500" />
                </div>
                <h3 className="text-sm font-semibold text-surface-900 mb-1">All caught up!</h3>
                <p className="text-xs text-surface-400">No pending items. Use the AI Assistant to search your messages.</p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="lg:col-span-2">
            <h2 className="text-sm font-semibold text-surface-900 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-500" />
              Quick Actions
            </h2>
            <div className="space-y-2">
              {[
                { icon: Bot, label: 'Ask AI Assistant', desc: 'Search with natural language', tab: 'assistant' as TabType, color: 'bg-brand-50 text-brand-600' },
                { icon: MessageSquare, label: 'Browse Chats', desc: stats.totalChats + ' conversations', tab: 'messages' as TabType, color: 'bg-emerald-50 text-emerald-600' },
                { icon: Calendar, label: 'View Actions', desc: 'Reminders & commitments', tab: 'actions' as TabType, color: 'bg-blue-50 text-blue-600' },
                { icon: Users, label: 'People', desc: stats.totalContacts + ' contacts', tab: 'people' as TabType, color: 'bg-violet-50 text-violet-600' },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={() => onNavigate(action.tab)}
                  className="w-full flex items-center gap-3 p-3.5 bg-white border border-surface-100 rounded-xl hover:shadow-md hover:border-surface-200 transition-all text-left group"
                >
                  <div className={'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ' + action.color}>
                    <action.icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900">{action.label}</p>
                    <p className="text-xs text-surface-400">{action.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-surface-300 group-hover:text-surface-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
