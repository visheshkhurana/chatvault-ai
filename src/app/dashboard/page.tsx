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
// Rememora - Dashboard Page
// Sidebar layout with grouped navigation
// ============================================================

interface BridgeStatus {
    connected: boolean;
    phone?: string;
    name?: string;
}

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState<TabType>('home');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ connected: false });

    useEffect(() => {
        const checkBridge = async () => {
            try {
                const res = await fetch(BRIDGE_URL + '/status');
                const data = await res.json();
                setBridgeStatus({ connected: data.connected, phone: data.phone, name: data.name });
            } catch (e) { setBridgeStatus({ connected: false }); }
        };
        checkBridge();
        const interval = setInterval(checkBridge, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const initDashboard = async () => {
            await checkAuth();
        };
        initDashboard();
    }, []);

    async function checkAuth() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = '/login';
            return null;
        }
        setUser(user);
        return user;
    }

    async function handleSignOut() {
        await supabase.auth.signOut();
        window.location.href = '/login';
    }

    const renderSection = () => {
        switch (activeTab) {
            case 'home':
                return <HomeSection onNavigate={setActiveTab} />;
            case 'search':
                return <SearchSection />;
            case 'assistant':
                return <AssistantSection />;
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
                return <HomeSection onNavigate={setActiveTab} />;
        }
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex-shrink-0 z-20">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                            <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900">Rememora</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        {bridgeStatus.connected ? (
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span>
                                <span className="text-sm text-green-600 font-medium hidden sm:inline">
                                    {bridgeStatus.name || bridgeStatus.phone || 'Connected'}
                                </span>
                            </div>
                        ) : (
                            <a href="/dashboard/connect" className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-medium">
                                <span className="w-2.5 h-2.5 bg-orange-400 rounded-full"></span>
                                <span className="hidden sm:inline">Connect WhatsApp</span>
                            </a>
                        )}
                        <span className="text-sm text-gray-500 hidden md:inline">{user?.email}</span>
                        <button onClick={handleSignOut} className="text-gray-500 hover:text-gray-700" title="Sign out">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Main layout: Sidebar + Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar — desktop only */}
                <DashboardSidebar
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    collapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                />

                {/* Content area */}
                <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
                    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6">
                        {renderSection()}
                    </div>
                </main>
            </div>

            {/* Mobile bottom tab bar */}
            <MobileTabBar
                activeTab={activeTab}
                onTabChange={setActiveTab}
            />
        </div>
    );
}
