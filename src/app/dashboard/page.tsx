'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageSquare, LogOut } from 'lucide-react';
import { TabType } from '@/types/dashboard';

// Layout components
import DashboardSidebar from '@/components/DashboardSidebar';
import MobileTabBar from '@/components/MobileTabBar';

// Section components
import HomeSection from '@/components/dashboard/HomeSection';
import SearchSection from '@/components/dashboard/SearchSection';
import AssistantSection from '@/components/dashboard/AssistantSection';
import ChatsSection from '@/components/dashboard/ChatsSection';
import AttachmentsSection from '@/components/dashboard/AttachmentsSection';
import SummariesSection from '@/components/dashboard/SummariesSection';
import ContactsSection from '@/components/dashboard/ContactsSection';
import CommitmentsSection from '@/components/dashboard/CommitmentsSection';
import AnalyticsSection from '@/components/dashboard/AnalyticsSection';
import SettingsSection from '@/components/dashboard/SettingsSection';
import SentimentSection from '@/components/dashboard/SentimentSection';
import TemplatesSection from '@/components/dashboard/TemplatesSection';
import RemindersSection from '@/components/dashboard/RemindersSection';
import LabelsSection from '@/components/dashboard/LabelsSection';
import ReportsSection from '@/components/dashboard/ReportsSection';

// ============================================================
// Rememora — Dashboard
// ============================================================

interface BridgeStatus {
      connected: boolean;
      phone?: string;
      name?: string;
}

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

function getTabFromHash(): TabType {
      if (typeof window === 'undefined') return 'home';
      const hash = window.location.hash.replace('#', '');
      const validTabs: TabType[] = ['home', 'search', 'assistant', 'chats', 'attachments', 'summaries', 'contacts', 'sentiment', 'labels', 'reminders', 'commitments', 'templates', 'analytics', 'reports', 'settings'];
      return validTabs.includes(hash as TabType) ? (hash as TabType) : 'home';
}

export default function DashboardPage() {
      const [activeTab, setActiveTab] = useState<TabType>('home');
      const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
      const [user, setUser] = useState<any>(null);
      const [userName, setUserName] = useState<string>('');
      const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ connected: false });

  // Hash-based routing: read on mount and listen for changes
  useEffect(() => {
          setActiveTab(getTabFromHash());
          const handleHashChange = () => setActiveTab(getTabFromHash());
          window.addEventListener('hashchange', handleHashChange);
          return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Sync hash when tab changes
  const handleTabChange = (tab: TabType) => {
          setActiveTab(tab);
          window.location.hash = tab;
  };

  useEffect(() => {
          const checkBridge = async () => {
                    try {
                                const res = await fetch(BRIDGE_URL + '/status');
                                const data = await res.json();
                                setBridgeStatus((prev) => {
                                              if (prev.connected !== data.connected || prev.phone !== data.phone || prev.name !== data.name) {
                                                              return { connected: data.connected, phone: data.phone, name: data.name };
                                              }
                                              return prev;
                                });
                    } catch {
                                setBridgeStatus((prev) => {
                                              if (prev.connected) return { connected: false };
                                              return prev;
                                });
                    }
          };
          checkBridge();
          const interval = setInterval(checkBridge, 30000);
          return () => clearInterval(interval);
  }, []);

  useEffect(() => {
          checkAuth();
  }, []);

  async function checkAuth() {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) {
                    window.location.href = '/login';
                    return;
          }
          setUser(authUser);

        // Fetch display name from users table
        const { data: profile } = await supabase
            .from('users')
            .select('display_name')
            .eq('auth_id', authUser.id)
            .single();

        if (profile?.display_name && profile.display_name !== 'WhatsApp User') {
                  setUserName(profile.display_name.split(' ')[0]);
        } else {
                  // Fallback: try user metadata, then email prefix
            const metaName = authUser.user_metadata?.full_name || authUser.user_metadata?.name;
                  if (metaName) {
                              setUserName(metaName.split(' ')[0]);
                  } else {
                              setUserName(authUser.email?.split('@')[0] || '');
                  }
        }
  }

  async function handleSignOut() {
          await supabase.auth.signOut();
          window.location.href = '/login';
  }

  const renderSection = () => {
          switch (activeTab) {
              case 'home':
                          return <HomeSection onNavigate={handleTabChange} />;
              case 'search':
                          return <SearchSection />;
              case 'assistant':
                          return <AssistantSection bridgeStatus={bridgeStatus.connected ? 'connected' : 'disconnected'} userEmail={user?.email} userName={userName} />;
              case 'chats':
                          return <ChatsSection />;
              case 'attachments':
                          return <AttachmentsSection />;
              case 'summaries':
                          return <SummariesSection />;
              case 'contacts':
                          return <ContactsSection />;
              case 'sentiment':
                          return <SentimentSection />;
              case 'labels':
                          return <LabelsSection />;
              case 'reminders':
                          return <RemindersSection />;
              case 'commitments':
                          return <CommitmentsSection />;
              case 'templates':
                          return <TemplatesSection />;
              case 'analytics':
                          return <AnalyticsSection />;
              case 'reports':
                          return <ReportsSection />;
              case 'settings':
                          return <SettingsSection />;
              default:
                          return <HomeSection onNavigate={handleTabChange} />;
          }
  };

  return (
          <div className="h-screen flex flex-col bg-slate-50">
              {/* Header */}
                <header className="bg-white border-b border-slate-200 px-4 md:px-6 flex-shrink-0 z-20">
                        <div className="flex items-center justify-between h-14">
                                  <div className="flex items-center gap-2.5">
                                              <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
                                                            <MessageSquare className="w-4.5 h-4.5 text-white" />
                                              </div>div>
                                              <h1 className="text-lg font-bold text-slate-900 tracking-tight">Rememora</h1>h1>
                                  </div>div>
                        
                                  <div className="flex items-center gap-3">
                                      {bridgeStatus.connected ? (
                            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                            <span className="text-xs text-emerald-700 font-medium hidden sm:inline">
                                                {bridgeStatus.name || bridgeStatus.phone || 'Connected'}
                                            </span>span>
                            </div>div>
                          ) : (
                            <a
                                                href="/dashboard/connect"
                                                className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 hover:bg-amber-100 transition-colors"
                                              >
                                            <span className="w-2 h-2 bg-amber-400 rounded-full" />
                                            <span className="text-xs text-amber-700 font-medium hidden sm:inline">Connect WhatsApp</span>span>
                            </a>a>
                                              )}
                                              <span className="text-xs text-slate-400 hidden md:inline">{user?.email}</span>span>
                                              <button
                                                                onClick={handleSignOut}
                                                                className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-lg"
                                                                title="Sign out"
                                                              >
                                                            <LogOut className="w-4 h-4" />
                                              </button>button>
                                  </div>div>
                        </div>div>
                </header>header>
          
              {/* Main layout: Sidebar + Content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar — desktop only */}
                        <DashboardSidebar
                                      activeTab={activeTab}
                                      onTabChange={handleTabChange}
                                      collapsed={sidebarCollapsed}
                                      onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                                    />
                
                    {/* Content area */}
                        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
                                  <div className="max-w-6xl mx-auto px-4 md:px-8 py-6">
                                      {renderSection()}
                                  </div>div>
                        </main>main>
                </div>div>
          
              {/* Mobile bottom tab bar */}
                <MobileTabBar activeTab={activeTab} onTabChange={handleTabChange} />
          </div>div>
        );
}</div>
