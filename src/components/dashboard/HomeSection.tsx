'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Users,
  Bell,
  AlertTriangle,
  Search,
  MessageCirclePlus,
  Sparkles,
  BarChart3,
  Loader2,
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

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      setLoading(true);

      // Fetch all stats in parallel
      const [msgResult, chatResult, contactResult, pendingResult, overdueResult] =
        await Promise.all([
          supabase.from('messages').select('id', { count: 'exact', head: true }),
          supabase.from('chats').select('id', { count: 'exact', head: true }),
          supabase.from('contacts').select('id', { count: 'exact', head: true }),
          supabase
            .from('reminders')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('reminders')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'overdue'),
        ]);

      setStats({
        totalMessages: msgResult.count || 0,
        activeChats: chatResult.count || 0,
        contacts: contactResult.count || 0,
        pendingReminders: pendingResult.count || 0,
        overdueReminders: overdueResult.count || 0,
      });

      // Fetch recent activity
      const { data: messages } = await supabase
        .from('messages')
        .select('id, sender_name, text_content, message_type, timestamp, chat_id')
        .order('timestamp', { ascending: false })
        .limit(10);

      setRecentActivity(messages || []);
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const truncateText = (text: string, length: number = 60) => {
    return text.length > length ? text.substring(0, length) + '...' : text;
  };

  // Stat card component
  const StatCard = ({
    icon: Icon,
    label,
    value,
    color,
  }: {
    icon: React.ReactNode;
    label: string;
    value: number;
    color: string;
  }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`${color} p-3 rounded-lg`}>{Icon}</div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
        <p className="text-gray-600 text-sm mt-1">{formatDate()}</p>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<MessageSquare className="w-6 h-6 text-white" />}
          label="Total Messages"
          value={stats.totalMessages}
          color="bg-green-500"
        />
        <StatCard
          icon={<MessageSquare className="w-6 h-6 text-white" />}
          label="Active Chats"
          value={stats.activeChats}
          color="bg-blue-500"
        />
        <StatCard
          icon={<Users className="w-6 h-6 text-white" />}
          label="Contacts"
          value={stats.contacts}
          color="bg-purple-500"
        />
        <StatCard
          icon={<Bell className="w-6 h-6 text-white" />}
          label="Pending Reminders"
          value={stats.pendingReminders}
          color="bg-amber-500"
        />
      </div>

      {/* Overdue Reminders Alert */}
      {stats.overdueReminders > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Overdue Reminders</p>
              <p className="text-sm text-red-700 mt-1">
                You have {stats.overdueReminders} overdue reminder
                {stats.overdueReminders !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('reminders')}
            className="text-sm font-semibold text-red-600 hover:text-red-700 whitespace-nowrap"
          >
            View Reminders
          </button>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => onNavigate('search')}
          className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-2 hover:bg-gray-50 transition"
        >
          <Search className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium text-gray-700">Search Messages</span>
        </button>
        <button
          onClick={() => onNavigate('chats')}
          className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-2 hover:bg-gray-50 transition"
        >
          <MessageCirclePlus className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-medium text-gray-700">New Chat</span>
        </button>
        <button
          onClick={() => onNavigate('assistant')}
          className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-2 hover:bg-gray-50 transition"
        >
          <Sparkles className="w-5 h-5 text-purple-600" />
          <span className="text-sm font-medium text-gray-700">AI Assistant</span>
        </button>
        <button
          onClick={() => onNavigate('reports')}
          className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-2 hover:bg-gray-50 transition"
        >
          <BarChart3 className="w-5 h-5 text-amber-600" />
          <span className="text-sm font-medium text-gray-700">View Reports</span>
        </button>
      </div>

      {/* Recent Activity Feed */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        </div>
        {recentActivity.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {recentActivity.map((message) => (
              <div key={message.id} className="p-4 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {message.sender_name}
                    </p>
                    <p className="text-sm text-gray-600 mt-1 break-words">
                      {truncateText(message.text_content)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 whitespace-nowrap ml-2">
                      {formatRelativeTime(message.timestamp)}
                    </p>
                    {message.message_type && (
                      <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                        {message.message_type}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No recent activity</p>
          </div>
        )}
      </div>
    </div>
  );
}
