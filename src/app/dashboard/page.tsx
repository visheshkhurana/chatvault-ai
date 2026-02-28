'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageSquare, LogOut, Bell, ChevronDown } from 'lucide-react';
import { TabType } from '@/types/dashboard';

import DashboardSidebar from '@/components/DashboardSidebar';
import MobileTabBar from '@/components/MobileTabBar';
import OnboardingFlow from '@/components/OnboardingFlow';
// HomeSection no longer used — Home tab now renders AssistantSection (chatbot)
import MessagesSection from '@/components/dashboard/MessagesSection';
import ActionsSection from '@/components/dashboard/ActionsSection';
import PeopleSection from '@/components/dashboard/PeopleSection';
import AssistantSection from '@/components/dashboard/AssistantSection';
import SettingsSection from '@/components/dashboard/SettingsSection';
import ReferralSection from '@/components/dashboard/ReferralSection';

interface BridgeStatus {
  connected: boolean;
  phone?: string;
  name?: string;
}

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

const TAB_TITLES: Record<string, { title: string; subtitle: string }> = {
  home: { title: 'Home', subtitle: 'Chat with Rememora' },
  messages: { title: 'Messages', subtitle: 'Chats, files & search' },
  actions: { title: 'Actions', subtitle: 'Reminders & tasks' },
  people: { title: 'People', subtitle: 'Contact intelligence' },
  assistant: { title: 'AI Assistant', subtitle: 'Ask anything' },
  settings: { title: 'Settings', subtitle: 'Preferences & connection' },
  referrals: { title: 'Refer Friends', subtitle: 'Earn free Pro days' },
};

function resolveTab(tab: TabType): TabType {
  const map: Record<string, TabType> = {
    chats: 'messages', files: 'messages', search: 'messages',
    summaries: 'messages', reminders: 'actions', commitments: 'actions',
    contacts: 'people', sentiment: 'people', labels: 'messages',
    analytics: 'home', reports: 'home', templates: 'actions',
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
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ connected: false });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveTab(getTabFromHash());
    const handleHashChange = () => setActiveTab(getTabFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTabChange = useCallback((tab: TabType) => {
    const resolved = resolveTab(tab);
    setActiveTab(resolved);
    window.location.hash = resolved;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleTabChange('home');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTabChange]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/login'; return; }
      setUser(session.user);
      setUserName(session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '');
    };
    checkAuth();
  }, []);

  // Check onboarding status
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/onboarding', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!data.completed) setShowOnboarding(true);
        }
      } catch {}
    };
    if (user) checkOnboarding();
  }, [user]);

  useEffect(() => {
    const checkBridge = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(BRIDGE_URL + '/status');
        if (res.ok) {
          const data = await res.json();
          setBridgeStatus({ connected: data.connected, phone: data.phone, name: data.name });
        }
      } catch {}
    };
    checkBridge();
    const interval = setInterval(checkBridge, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const userInitials = userName
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const tabInfo = TAB_TITLES[activeTab] || TAB_TITLES.home;

  const renderSection = () => {
    switch (activeTab) {
      case 'home': return <AssistantSection bridgeStatus={bridgeStatus.connected ? 'connected' : 'disconnected'} userEmail={user?.email} userName={userName} />;
      case 'messages': return <MessagesSection />;
      case 'actions': return <ActionsSection />;
      case 'people': return <PeopleSection />;
      case 'assistant': return <AssistantSection bridgeStatus={bridgeStatus.connected ? 'connected' : 'disconnected'} userEmail={user?.email} userName={userName} />;
      case 'settings': return <SettingsSection />;
      case 'referrals': return <ReferralSection />;
      default: return <AssistantSection bridgeStatus={bridgeStatus.connected ? 'connected' : 'disconnected'} userEmail={user?.email} userName={userName} />;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 flex">
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
          {/* Desktop top bar */}
          <header className="hidden md:flex h-14 bg-white border-b border-surface-200 px-6 items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <h1 className="text-base font-bold text-surface-900">{tabInfo.title}</h1>
              <span className="text-sm text-surface-400 hidden lg:inline">{tabInfo.subtitle}</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Notification bell */}
              <button
                onClick={() => handleTabChange('actions')}
                className="relative w-8 h-8 rounded-lg border border-surface-200 flex items-center justify-center text-surface-400 hover:text-surface-600 hover:border-surface-300 transition-colors"
                title="View actions & reminders"
              >
                <Bell className="w-4 h-4" />
              </button>

              {/* User avatar + dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-1 rounded-lg hover:bg-surface-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                    {userInitials}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-surface-400" />
                </button>
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-surface-200 rounded-xl shadow-lg py-1 z-50">
                    <div className="px-4 py-3 border-b border-surface-100">
                      <p className="text-sm font-semibold text-surface-900">{userName}</p>
                      <p className="text-xs text-surface-400 truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={() => { handleTabChange('settings'); setShowUserMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-surface-600 hover:bg-surface-50 transition-colors"
                    >
                      Settings
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Mobile top bar */}
          <header className="md:hidden bg-white border-b border-surface-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-surface-900 text-sm">Rememora</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTabChange('actions')}
                className="w-8 h-8 rounded-lg border border-surface-200 flex items-center justify-center text-surface-400"
              >
                <Bell className="w-4 h-4" />
              </button>
              <button onClick={handleLogout} className="p-2 text-surface-400 hover:text-surface-600">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-hidden">
            {renderSection()}
          </div>
        </div>
      </main>
      <MobileTabBar activeTab={activeTab} onTabChange={handleTabChange} />
      {showOnboarding && (
        <OnboardingFlow
          onComplete={() => setShowOnboarding(false)}
          onSkip={() => setShowOnboarding(false)}
          bridgeConnected={bridgeStatus.connected}
          onNavigate={(tab) => { setShowOnboarding(false); handleTabChange(tab as TabType); }}
        />
      )}
    </div>
  );
}
