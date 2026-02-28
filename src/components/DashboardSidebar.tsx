'use client';

import React, { useState } from 'react';
import {
  Bot, MessageCircle, ListChecks, Users, Settings, Gift,
  ChevronLeft, ChevronRight, ChevronDown, Command, Wifi, WifiOff, MessageSquare,
  Sparkles, Mic, BookOpen, Heart, BarChart3, Cake, Globe, Reply, Zap, Brain,
} from 'lucide-react';
import { TabType } from '@/types/dashboard';

interface BridgeStatus {
  connected: boolean;
  phone?: string;
  name?: string;
}

interface DashboardSidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  userName?: string;
  bridgeStatus?: BridgeStatus;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  tab: TabType;
  description?: string;
  badge?: number;
}

const primaryNavItems: NavItem[] = [
  { icon: Bot, label: 'Home', tab: 'home', description: 'Chat with Rememora' },
  { icon: MessageCircle, label: 'Messages', tab: 'messages', description: 'Chats, files & search' },
  { icon: ListChecks, label: 'Actions', tab: 'actions', description: 'Reminders & tasks' },
  { icon: Users, label: 'People', tab: 'people', description: 'Contact intelligence' },
];

const featureNavItems: NavItem[] = [
  { icon: Sparkles, label: 'Memories', tab: 'memories', description: 'This Day in your chats' },
  { icon: Mic, label: 'Voice Notes', tab: 'voice-notes', description: 'Transcriptions & search' },
  { icon: BookOpen, label: 'Knowledge Base', tab: 'knowledge-base', description: 'Your personal wiki' },
  { icon: Heart, label: 'Contact Insights', tab: 'contact-insights', description: 'Relationship intel' },
  { icon: Brain, label: 'Emotional Insights', tab: 'emotional-insights', description: 'Conversation health' },
  { icon: BarChart3, label: 'Weekly Recap', tab: 'weekly-recap', description: 'Your week in review' },
  { icon: Cake, label: 'Special Dates', tab: 'birthdays', description: 'Birthdays & more' },
  { icon: Globe, label: 'Shared Spaces', tab: 'shared-spaces', description: 'Family & team' },
  { icon: Reply, label: 'Smart Replies', tab: 'response-suggestions', description: 'AI suggestions' },
  { icon: Zap, label: 'Tasks', tab: 'agentic-tasks', description: 'Automated actions' },
];

const featureTabs = new Set(featureNavItems.map(i => i.tab));

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeTab, onTabChange, collapsed, onToggleCollapse, userName, bridgeStatus,
}) => {
  const [featuresExpanded, setFeaturesExpanded] = useState(() => featureTabs.has(activeTab));

  const renderNavItem = (item: NavItem) => {
    const isActive = activeTab === item.tab;
    return (
      <button
        key={item.tab}
        onClick={() => onTabChange(item.tab)}
        className={'w-full flex items-center gap-3 rounded-lg transition-all duration-200 group '
          + (collapsed ? 'px-3 py-3 justify-center ' : 'px-3 py-2.5 ')
          + (isActive
            ? 'bg-brand-500/10 text-brand-400 border-l-2 border-brand-400 -ml-px'
            : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800')}
        title={collapsed ? item.label : undefined}
      >
        <item.icon className="flex-shrink-0 w-5 h-5" />
        {!collapsed && (
          <div className="flex flex-col items-start min-w-0">
            <span className="text-[13px] font-semibold leading-tight">{item.label}</span>
            {item.description && (
              <span className={'text-[11px] leading-tight mt-px ' + (isActive ? 'text-brand-500/70' : 'text-surface-600 group-hover:text-surface-500')}>
                {item.description}
              </span>
            )}
          </div>
        )}
        {!collapsed && item.badge && item.badge > 0 && (
          <span className="ml-auto text-[10px] bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className={'hidden md:flex flex-col flex-shrink-0 bg-surface-900 border-r border-surface-800/50 transition-all duration-300 ease-in-out relative ' + (collapsed ? 'w-[72px]' : 'w-[260px]')}>

      {/* Logo + Brand */}
      {!collapsed ? (
        <div className="px-4 pt-5 pb-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-brand-400 to-brand-600 rounded-[10px] flex items-center justify-center shadow-lg shadow-brand-500/20 flex-shrink-0">
            <MessageSquare className="w-[18px] h-[18px] text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">Rememora</span>
        </div>
      ) : (
        <div className="flex justify-center pt-5 pb-3">
          <div className="w-9 h-9 bg-gradient-to-br from-brand-400 to-brand-600 rounded-[10px] flex items-center justify-center shadow-lg shadow-brand-500/20">
            <MessageSquare className="w-[18px] h-[18px] text-white" />
          </div>
        </div>
      )}

      {/* Search / Cmd+K */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <button
            onClick={() => onTabChange('home')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-800 border border-surface-700 text-surface-400 hover:text-surface-300 hover:border-surface-600 hover:bg-surface-800/80 transition-all text-sm"
          >
            <Command className="w-4 h-4" />
            <span>Search anything...</span>
            <kbd className="ml-auto text-[10px] bg-surface-900 px-1.5 py-0.5 rounded font-mono text-surface-500">{'\u2318'}K</kbd>
          </button>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="absolute -right-3 top-7 w-6 h-6 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-white hover:bg-surface-700 transition-colors z-10"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Primary nav items */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-700">
        {primaryNavItems.map(renderNavItem)}

        {/* Features section divider + expandable */}
        {!collapsed ? (
          <div className="pt-3">
            <button
              onClick={() => setFeaturesExpanded(!featuresExpanded)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-surface-500 uppercase tracking-wider hover:text-surface-300 transition-colors"
            >
              <span>Features</span>
              <ChevronDown className={'w-3 h-3 transition-transform ' + (featuresExpanded ? 'rotate-0' : '-rotate-90')} />
            </button>
            {featuresExpanded && (
              <div className="space-y-0.5 mt-1">
                {featureNavItems.map(renderNavItem)}
              </div>
            )}
          </div>
        ) : (
          <div className="pt-3 space-y-0.5">
            {featureNavItems.slice(0, 4).map(renderNavItem)}
          </div>
        )}
      </nav>

      {/* Bridge status */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <button
            onClick={() => onTabChange('settings')}
            className={'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs cursor-pointer transition-all '
              + (bridgeStatus?.connected
                ? 'bg-brand-500/10 text-brand-400 hover:bg-brand-500/15'
                : 'bg-surface-800 text-surface-500 hover:text-surface-300 hover:bg-surface-800/80')}
            title={bridgeStatus?.connected ? 'WhatsApp connected' : 'Click to connect WhatsApp'}
          >
            {bridgeStatus?.connected ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span>{bridgeStatus?.connected ? 'WhatsApp connected' : 'WhatsApp disconnected'}</span>
            {!bridgeStatus?.connected && (
              <span className="ml-auto text-[10px] bg-brand-600 text-white px-1.5 py-0.5 rounded font-semibold">Connect</span>
            )}
          </button>
        </div>
      )}

      {/* Refer Friends */}
      <div className={'px-3 ' + (collapsed ? 'pb-1' : 'pb-1')}>
        <button
          onClick={() => onTabChange('referrals')}
          className={'w-full flex items-center gap-3 rounded-lg transition-colors '
            + (collapsed ? 'px-3 py-3 justify-center ' : 'px-3 py-2.5 ')
            + (activeTab === 'referrals'
              ? 'bg-brand-500/10 text-brand-400'
              : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800')}
          title={collapsed ? 'Refer Friends' : undefined}
        >
          <Gift className="w-5 h-5" />
          {!collapsed && <span className="text-[13px] font-semibold">Refer Friends</span>}
        </button>
      </div>

      {/* Settings */}
      <div className={'px-3 ' + (collapsed ? 'pb-4' : 'pb-4')}>
        <button
          onClick={() => onTabChange('settings')}
          className={'w-full flex items-center gap-3 rounded-lg transition-colors '
            + (collapsed ? 'px-3 py-3 justify-center ' : 'px-3 py-2.5 ')
            + (activeTab === 'settings'
              ? 'bg-brand-500/10 text-brand-400'
              : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800')}
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings className="w-5 h-5" />
          {!collapsed && <span className="text-[13px] font-semibold">Settings</span>}
        </button>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
