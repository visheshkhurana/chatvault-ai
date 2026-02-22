'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Users,
  Bell,
  AlertTriangle,
  Search,
  Brain,
  BarChart3,
  Loader2,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TabType } from '@/types/dashboard';

interface HomeProps {
  onNavigate: (tab: TabType) => void;
}

interface Message {
  id: string;
  sender_name: string;
  text_content: string;
  message_type: string;
  timestamp: string;
  chat_id: string;
}

export default function HomeSection({ onNavigate }: HomeProps) {
  const [stats, setStats] = useState({
    totalMessages: 0,
    activeChats: 0,
    contacts: 0,
    pendingReminders: 0,
    overdueReminders: 0,
  });
  const [recentActivity, setRecentActivity] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    try {
      setLoading(true);
      const [msgResult, chatResult, contactResult, pendingResult, overdueResult] =
        await Promise.all([
          supabase.from('messages').select('id', { count: 'exact', head: true }),
          supabase.from('chats').select('id', { count: 'exact', head: true }),
          supabase.from('contacts').select('id', { count: 'exact', head: true }),
          supabase.from('reminders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('reminders').select('id', { count: 'exact', head: true }).eq('status', 'overdue'),
        ]);

      setStats({
        totalMessages: msgResult.count || 0,
        activeChats: chatResult.count || 0,
        contacts: contactResult.count || 0,
        pendingReminders: pendingResult.count || 0,
        overdueReminders: overdueResult.count || 0,
      });

      const { data: messages } = await supabase
        .from('messages')
        .select('id, sender_name, text_content, message_type, timestamp, chat_id')
        .order('timestamp', { ascending: false })
        .limit(8);

      setRecentActivity(messages || []);
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatDate = () =>
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const formatRelativeTime = (timestamp: string) => {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const truncate = (text: string, len = 65) =>
    text && text.length > len ? text.substring(0, len) + '…' : text || '';

  const formatNumber = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-sm text-slate-400">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Messages',
      value: stats.totalMessages,
      icon: MessageSquare,
      gradient: 'from-emerald-500 to-teal-600',
      bg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
    },
    {
      label: 'Chats',
      value: stats.activeChats,
      icon: TrendingUp,
      gradient: 'from-blue-500 to-indigo-600',
      bg: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
    {
      label: 'Contacts',
      value: stats.contacts,
      icon: Users,
      gradient: 'from-violet-500 to-purple-600',
      bg: 'bg-violet-50',
      iconColor: 'text-violet-600',
    },
    {
      label: 'Reminders',
      value: stats.pendingReminders,
      icon: Bell,
      gradient: 'from-amber-500 to-orange-600',
      bg: 'bg-amber-50',
      iconColor: 'text-amber-600',
    },
  ];

  const quickActions = [
    { label: 'Search Messages', icon: Search, tab: 'search' as TabType, color: 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
    { label: 'AI Assistant', icon: Brain, tab: 'assistant' as TabType, color: 'text-violet-600 bg-violet-50 border-violet-200 hover:bg-violet-100' },
    { label: 'Analytics', icon: BarChart3, tab: 'analytics' as TabType, color: 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100' },
    { label: 'Reminders', icon: Clock, tab: 'reminders' as TabType, color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100' },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
          Welcome back
        </h1>
        <p className="text-slate-500 text-sm mt-1">{formatDate()}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{card.label}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1.5">{formatNumber(card.value)}</p>
                </div>
                <div className={`${card.bg} p-2.5 rounded-xl`}>
                  <Icon size={20} className={card.iconColor} />
                </div>
              </div>
              {/* Decorative gradient bar */}
              <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${card.gradient}`} />
            </div>
          );
        })}
      </div>

      {/* Overdue Alert */}
      {stats.overdueReminders > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-semibold text-red-900 text-sm">
                {stats.overdueReminders} overdue reminder{stats.overdueReminders !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-red-600 mt-0.5">Needs your attention</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('reminders')}
            className="flex items-center gap-1 text-sm font-semibold text-red-600 hover:text-red-700 transition-colors"
          >
            View <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => onNavigate(action.tab)}
                className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 transition-all ${action.color}`}
              >
                <Icon size={18} />
                <span className="text-sm font-medium">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-500" />
            <h2 className="text-base font-semibold text-slate-900">Recent Activity</h2>
          </div>
          <button
            onClick={() => onNavigate('chats')}
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1"
          >
            View all <ArrowRight size={12} />
          </button>
        </div>

        {recentActivity.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {recentActivity.map((msg) => (
              <div key={msg.id} className="px-5 py-3.5 hover:bg-slate-50/80 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Avatar circle */}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold shadow-sm">
                      {(msg.sender_name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{msg.sender_name || 'Unknown'}</p>
                      <p className="text-sm text-slate-500 mt-0.5 truncate">{truncate(msg.text_content)}</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                    {formatRelativeTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No recent activity</p>
            <p className="text-xs text-slate-400 mt-1">Connect WhatsApp to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
