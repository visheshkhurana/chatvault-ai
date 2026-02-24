'use client';

import React from 'react';
import {
  Home, MessageCircle, ListChecks, Users, Sparkles, Settings,
  ChevronLeft, ChevronRight, Command, Wifi, WifiOff,
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

const navItems: NavItem[] = [
  { icon: Home, label: 'Home', tab: 'home', description: 'Your daily brief' },
  { icon: MessageCircle, label: 'Messages', tab: 'messages', description: 'Chats, files & search' },
  { icon: ListChecks, label: 'Actions', tab: 'actions', description: 'Reminders & tasks' },
  { icon: Users, label: 'People', tab: 'people', description: 'Contact intelligence' },
  { icon: Sparkles, label: 'Assistant', tab: 'assistant', description: 'AI-powered search' },
];

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeTab, onTabChange, collapsed, onToggleCollapse, userName, bridgeStatus,
}) => {
  return (
    <aside className={'hidden md:flex flex-col flex-shrink-0 bg-slate-950 border-r border-slate-800/50 transition-all duration-300 ease-in-out relative ' + (collapsed ? 'w-[72px]' : 'w-[240px]')}>
      {/* Search / Cmd+K */}
      {!collapsed && (
        <div className="px-4 pt-4 pb-2">
          <button
            onClick={() => onTabChange('assistant')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700 transition-colors text-sm"
          >
            <Command className="w-4 h-4" />
            <span>Search anything...</span>
            <kbd className="ml-auto text-[10px] bg-slate-800 px-1.5 py-0.5 rounded font-mono">\u2318K</kbd>
          </button>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors z-10"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.tab;
          return (
            <button
              key={item.tab}
              onClick={() => onTabChange(item.tab)}
              className={'w-full flex items-center gap-3 rounded-lg transition-all duration-200 ' + (collapsed ? 'px-3 py-3 justify-center ' : 'px-3 py-2.5 ') + (isActive ? 'bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-400 -ml-px' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900')}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="flex-shrink-0 w-5 h-5" />
              {!collapsed && (
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[13px] font-semibold leading-tight">{item.label}</span>
                  {item.description && (
                    <span className="text-[11px] text-slate-500 leading-tight">{item.description}</span>
                  )}
                </div>
              )}
              {!collapsed && item.badge && item.badge > 0 && (
                <span className="ml-auto text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bridge status - clickable, navigates to settings */}
      {!collapsed && (
        <div className="px-4 pb-2">
          <button
            onClick={() => onTabChange('settings')}
            className={'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors hover:opacity-80 ' + (bridgeStatus?.connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-900 text-slate-500 hover:text-slate-300 hover:bg-slate-800')}
            title={bridgeStatus?.connected ? 'WhatsApp connected' : 'Click to connect WhatsApp'}
          >
            {bridgeStatus?.connected ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span>{bridgeStatus?.connected ? 'WhatsApp connected' : 'WhatsApp disconnected'}</span>
            {!bridgeStatus?.connected && (
              <span className="ml-auto text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">Connect</span>
            )}
          </button>
        </div>
      )}

      {/* Settings */}
      <div className={collapsed ? 'px-3 pb-4' : 'px-3 pb-4'}>
        <button
          onClick={() => onTabChange('settings')}
          className={'w-full flex items-center gap-3 rounded-lg transition-colors ' + (collapsed ? 'px-3 py-3 justify-center ' : 'px-3 py-2.5 ') + (activeTab === 'settings' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900')}
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
