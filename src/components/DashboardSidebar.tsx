'use client';

import React from 'react';
import {
  Home,
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
  FileJson,
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
  icon: React.ReactNode;
  label: string;
  tab: TabType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapse,
}) => {
  const navGroups: NavGroup[] = [
    {
      title: 'Main',
      items: [
        { icon: <Home size={20} />, label: 'Home', tab: 'home' },
      ],
    },
    {
      title: 'Search & AI',
      items: [
        { icon: <Search size={20} />, label: 'Search', tab: 'search' },
        { icon: <Brain size={20} />, label: 'AI Assistant', tab: 'assistant' },
      ],
    },
    {
      title: 'Messages',
      items: [
        { icon: <MessageCircle size={20} />, label: 'Chats', tab: 'chats' },
        { icon: <Paperclip size={20} />, label: 'Files', tab: 'attachments' },
        { icon: <FileText size={20} />, label: 'Summaries', tab: 'summaries' },
      ],
    },
    {
      title: 'People',
      items: [
        { icon: <Users size={20} />, label: 'Contacts', tab: 'contacts' },
        { icon: <Smile size={20} />, label: 'Sentiment', tab: 'sentiment' },
      ],
    },
    {
      title: 'Organize',
      items: [
        { icon: <Tag size={20} />, label: 'Labels', tab: 'labels' },
        { icon: <Clock size={20} />, label: 'Reminders', tab: 'reminders' },
        { icon: <CheckSquare size={20} />, label: 'Commitments', tab: 'commitments' },
        { icon: <Layout size={20} />, label: 'Templates', tab: 'templates' },
      ],
    },
    {
      title: 'Insights',
      items: [
        { icon: <BarChart3 size={20} />, label: 'Analytics', tab: 'analytics' },
        { icon: <FileJson size={20} />, label: 'Reports', tab: 'reports' },
      ],
    },
  ];

  const settingsItem: NavItem = {
    icon: <Settings size={20} />,
    label: 'Settings',
    tab: 'settings',
  };

  const NavItemComponent: React.FC<NavItem> = ({ icon, label, tab }) => {
    const isActive = activeTab === tab;

    return (
      <button
        onClick={() => onTabChange(tab)}
        title={collapsed ? label : ''}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
          isActive
            ? 'bg-green-600 text-white'
            : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <div className="flex-shrink-0">{icon}</div>
        {!collapsed && <span className="text-sm font-medium flex-1 text-left">{label}</span>}
      </button>
    );
  };

  return (
    <div
      className={`hidden md:flex flex-col fixed left-0 top-0 h-screen bg-white border-r border-gray-200 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
      style={{ width: collapsed ? '64px' : '250px' }}
    >
      {/* Header with toggle button */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!collapsed && <h1 className="text-lg font-bold text-gray-900">Rememora</h1>}
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation content */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="mb-6">
            {!collapsed && (
              <h2 className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {group.title}
              </h2>
            )}
            <nav className="space-y-2">
              {group.items.map((item, itemIndex) => (
                <NavItemComponent key={itemIndex} {...item} />
              ))}
            </nav>
          </div>
        ))}
      </div>

      {/* Settings at bottom */}
      <div className="border-t border-gray-200 p-3">
        <NavItemComponent {...settingsItem} />
      </div>
    </div>
  );
};

export default DashboardSidebar;
