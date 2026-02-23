'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { MessageSquare, LogOut } from 'lucide-react';
import { TabType } from '@/types/dashboard';

import DashboardSidebar from '@/components/DashboardSidebar';
import MobileTabBar from '@/components/MobileTabBar';

import HomeSection from '@/components/dashboard/HomeSection';
import MessagesSection from '@/components/dashboard/MessagesSection';
import ActionsSection from '@/components/dashboard/ActionsSection';
import PeopleSection from '@/components/dashboard/PeopleSection';
import AssistantSection from '@/components/dashboard/AssistantSection';
import SettingsSection from '@/components/dashboard/SettingsSection';

interface BridgeStatus {
  connected: boolean;
  phone?: string;
  name?: string;
}

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

// Map legacy tab names to new ones
function resolveTab(tab: TabType): TabType {
  const map: Record<string, TabType> = {
    chats: 'messages',
    files: 'messages',
    search: 'messages',
    summaries: 'messages',
    reminders: 'actions',
    commitments: 'actions',
    contacts: 'people',
    sentiment: 'people',
    labels: 'messages',
    analytics: 'home',
    reports: 'home',
    templates: 'actions',
  };
  return map[tab] || tab;
}

function getTabFromHash(): TabType {
  if (typeof window === 'undefined') return 'home';
  const hash = window.location.hash.replace('#', '');
  if (!hash) return 'home';
  return resolveTab(hash as TabType);
}

export default function DashboardPage() {
  const supabase = createClientComponentClient();
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ connected: false });

  useEffect(() => {
    setActiveTab(getTabFromHash());
    const handleHashChange = () => setActiveTab(getTabFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = useCallback((tab: TabType) => {
    const resolved = resolveTab(tab);
    setActiveTab(resolved);
    window.location.hash = resolved;
  }, []);

  // Cmd+K shortcut to open assistant
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleTabChange('assistant');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTabChange]);

  // Check auth
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/login';
        return;
      }
      setUser(session.user);
      setUserName(session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '');
    };
    checkAuth();
  }, [supabase]);

  // Check bridge status
  useEffect(() => {
    const checkBridge = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(BRIDGE_URL + '/api/status/' + session.user.id);
        if (res.ok) {
          const data = await res.json();
          setBridgeStatus({ connected: data.connected, phone: data.phone, name: data.name });
        }
      } catch {}
    };
    checkBridge();
    const interval = setInterval(checkBridge, 30000);
    return () => clearInterval(interval);
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const renderSection = () => {
    switch (activeTab) {
      case 'home':
        return <HomeSection onNavigate={handleTabChange} />;
      case 'messages':
        return <MessagesSection />;
      case 'actions':
        return <ActionsSection />;
      case 'people':
        return <PeopleSection />;
      case 'assistant':
        return <AssistantSection />;
      case 'settings':
        return <SettingsSection />;
      default:
        return <HomeSection onNavigate={handleTabChange} />;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        userName={userName}
        bridgeStatus={bridgeStatus}
      />

      <main className="flex-1 overflow-hidden">
        <div className="h-screen flex flex-col">
          <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between md:hidden">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              <span className="font-semibold text-gray-900">Rememora</span>
            </div>
            <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-gray-600">
              <LogOut className="w-4 h-4" />
            </button>
          </header>

          <div className="flex-1 overflow-hidden">
            {renderSection()}
          </div>
        </div>
      </main>

      <MobileTabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
