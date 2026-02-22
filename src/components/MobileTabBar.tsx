'use client';

import React, { useState } from 'react';
import {
  Home,
  Search,
  Brain,
  MessageCircle,
  MoreHorizontal,
  X,
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
} from 'lucide-react';
import { TabType } from '@/types/dashboard';

interface MobileTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

interface MoreMenuItem {
  icon: React.ReactNode;
  label: string;
  tab: TabType;
  group: string;
}

const MobileTabBar: React.FC<MobileTabBarProps> = ({ activeTab, onTabChange }) => {
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);

  const mainTabs: Array<{ icon: React.ReactNode; label: string; tab: TabType }> = [
    { icon: <Home size={24} />, label: 'Home', tab: 'home' },
    { icon: <Search size={24} />, label: 'Search', tab: 'search' },
    { icon: <MessageCircle size={24} />, label: 'Chats', tab: 'chats' },
    { icon: <Brain size={24} />, label: 'AI', tab: 'assistant' },
    { icon: <MoreHorizontal size={24} />, label: 'More', tab: 'home' },
  ];

  const moreMenuItems: MoreMenuItem[] = [
    // Messages group
    { icon: <Paperclip size={24} />, label: 'Files', tab: 'attachments', group: 'Messages' },
    { icon: <FileText size={24} />, label: 'Summaries', tab: 'summaries', group: 'Messages' },
    // People group
    { icon: <Users size={24} />, label: 'Contacts', tab: 'contacts', group: 'People' },
    { icon: <Smile size={24} />, label: 'Sentiment', tab: 'sentiment', group: 'People' },
    // Organize group
    { icon: <Tag size={24} />, label: 'Labels', tab: 'labels', group: 'Organize' },
    { icon: <Clock size={24} />, label: 'Reminders', tab: 'reminders', group: 'Organize' },
    { icon: <CheckSquare size={24} />, label: 'Commitments', tab: 'commitments', group: 'Organize' },
    { icon: <Layout size={24} />, label: 'Templates', tab: 'templates', group: 'Organize' },
    // Insights group
    { icon: <BarChart3 size={24} />, label: 'Analytics', tab: 'analytics', group: 'Insights' },
    { icon: <FileJson size={24} />, label: 'Reports', tab: 'reports', group: 'Insights' },
    // Settings
    { icon: <Settings size={24} />, label: 'Settings', tab: 'settings', group: 'Settings' },
  ];

  const handleTabChange = (tab: TabType) => {
    onTabChange(tab);
  };

  const handleMoreItemClick = (tab: TabType) => {
    handleTabChange(tab);
    setIsMoreSheetOpen(false);
  };

  const handleMoreButtonClick = () => {
    setIsMoreSheetOpen(!isMoreSheetOpen);
  };

  // Group menu items by category
  const groupedMenuItems = moreMenuItems.reduce(
    (acc, item) => {
      const groupIndex = acc.findIndex((g) => g.group === item.group);
      if (groupIndex === -1) {
        acc.push({ group: item.group, items: [item] });
      } else {
        acc[groupIndex].items.push(item);
      }
      return acc;
    },
    [] as Array<{ group: string; items: MoreMenuItem[] }>
  );

  return (
    <>
      {/* Mobile Tab Bar */}
      <div className="flex md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-15 pb-safe">
        <div className="flex w-full items-center justify-around px-2">
          {mainTabs.map((tab, index) => {
            const isMore = tab.tab === 'home' && tab.label === 'More';
            const isActive = !isMore && activeTab === tab.tab;

            return isMore ? (
              <button
                key={index}
                onClick={handleMoreButtonClick}
                className={`flex flex-col items-center justify-center py-2 px-3 transition-colors ${
                  isMoreSheetOpen ? 'text-green-600' : 'text-gray-400'
                }`}
                aria-label="More options"
              >
                <div>{tab.icon}</div>
                <span className="text-xs mt-1 font-medium">{tab.label}</span>
              </button>
            ) : (
              <button
                key={index}
                onClick={() => handleTabChange(tab.tab)}
                className={`flex flex-col items-center justify-center py-2 px-3 transition-colors ${
                  isActive ? 'text-green-600' : 'text-gray-400'
                }`}
                aria-label={tab.label}
              >
                <div>{tab.icon}</div>
                <span className="text-xs mt-1 font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* More Sheet Backdrop and Content */}
      {isMoreSheetOpen && (
        <>
          {/* Backdrop */}
          <div
            className="flex md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsMoreSheetOpen(false)}
            aria-hidden="true"
          />

          {/* Bottom Sheet */}
          <div className="flex md:hidden fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-lg z-50 max-h-96 overflow-y-auto pb-safe">
            {/* Sheet Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 rounded-t-2xl w-full px-4 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">More Options</h2>
              <button
                onClick={() => setIsMoreSheetOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close sheet"
              >
                <X size={24} className="text-gray-600" />
              </button>
            </div>

            {/* Sheet Content - Grouped Grid */}
            <div className="w-full px-4 py-4">
              {groupedMenuItems.map((group, groupIndex) => (
                <div key={groupIndex} className="mb-6">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">
                    {group.group}
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    {group.items.map((item, itemIndex) => (
                      <button
                        key={itemIndex}
                        onClick={() => handleMoreItemClick(item.tab)}
                        className={`flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-colors ${
                          activeTab === item.tab
                            ? 'bg-green-100 text-green-600'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        aria-label={item.label}
                      >
                        <div className="mb-2">{item.icon}</div>
                        <span className="text-xs font-medium text-center line-clamp-2">
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default MobileTabBar;
