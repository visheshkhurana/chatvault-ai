'use client';

import React from 'react';
import {
  Bot,
  Search,
  Brain,
  MessageCircle,
  Paperclip,
  FileText,
  Users,
  Smile,
  Tag,
  Clock,
  CheckSquare,
  Layout,
  BarChart3,
  FileBarChart,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { TabType } from '@/types/dashboard';

interface DashboardSidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  tab: TabType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Main',
    items: [
      { icon: Bot, label: 'Home', tab: 'home' },
    ],
  },
  {
    title: 'Search & AI',
    items: [
      { icon: Search, label: 'Search', tab: 'search' },
      { icon: Brain, label: 'AI Assistant', tab: 'assistant' },
    ],
  },
  {
    title: 'Messages',
    items: [
      { icon: MessageCircle, label: 'Chats', tab: 'chats' },
      { icon: Paperclip, label: 'Files', tab: 'attachments' },
      { icon: FileText, label: 'Summaries', tab: 'summaries' },
    ],
  },
  {
    title: 'People',
    items: [
      { icon: Users, label: 'Contacts', tab: 'contacts' },
      { icon: Smile, label: 'Sentiment', tab: 'sentiment' },
    ],
  },
  {
    title: 'Organize',
    items: [
      { icon: Tag, label: 'Labels', tab: 'labels' },
      { icon: Clock, label: 'Reminders', tab: 'reminders' },
      { icon: CheckSquare, label: 'Commitments', tab: 'commitments' },
      { icon: Layout, label: 'Templates', tab: 'templates' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { icon: BarChart3, label: 'Analytics', tab: 'analytics' },
      { icon: FileBarChart, label: 'Reports', tab: 'reports' },
    ],
  },
];

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapse,
}) => {
  return (
    <aside
      className={`hidden md:flex flex-col flex-shrink-0 bg-slate-900 transition-all duration-300 ease-in-out relative ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="absolute -right-3 top-6 z-10 w-6 h-6 bg-slate-700 border-2 border-slate-800 rounded-full flex items-center justify-center text-slate-300 hover:bg-slate-600 hover:text-white transition-colors shadow-md"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1 scrollbar-thin">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'pt-4' : ''}>
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                {group.title}
              </p>
            )}
            {collapsed && gi > 0 && (
              <div className="mx-3 mb-2 border-t border-slate-700/60" />
            )}
            {group.items.map((item, ii) => {
              const isActive = activeTab === item.tab;
              const Icon = item.icon;
              return (
                <button
                  key={ii}
                  onClick={() => onTabChange(item.tab)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 rounded-lg transition-all duration-150 group relative
                    ${collapsed ? 'justify-center px-2 py-2.5 mx-auto' : 'px-3 py-2'}
                    ${isActive
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-emerald-400 rounded-r-full" />
                  )}
                  <Icon size={19} className={isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'} />
                  {!collapsed && (
                    <span className={`text-[13px] font-medium ${isActive ? 'text-emerald-300' : ''}`}>
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Settings — pinned bottom */}
      <div className="border-t border-slate-700/60 p-2">
        <button
          onClick={() => onTabChange('settings')}
          title={collapsed ? 'Settings' : undefined}
          className={`w-full flex items-center gap-3 rounded-lg transition-all duration-150 group
            ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'}
            ${activeTab === 'settings'
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
        >
          <Settings size={19} className={activeTab === 'settings' ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'} />
          {!collapsed && (
            <span className={`text-[13px] font-medium ${activeTab === 'settings' ? 'text-emerald-300' : ''}`}>
              Settings
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
