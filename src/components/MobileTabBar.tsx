'use client';

import React, { useState } from 'react';
import {
  Bot,
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
  FileBarChart,
  Settings,
} from 'lucide-react';
import { TabType } from '@/types/dashboard';

interface MobileTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

interface MoreMenuItem {
  icon: React.ElementType;
  label: string;
  tab: TabType;
  group: string;
}

const MobileTabBar: React.FC<MobileTabBarProps> = ({ activeTab, onTabChange }) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const mainTabs: Array<{ icon: React.ElementType; label: string; tab: TabType | 'more' }> = [
    { icon: Bot, label: 'Home', tab: 'home' },
    { icon: Search, label: 'Search', tab: 'search' },
    { icon: MessageCircle, label: 'Chats', tab: 'chats' },
    { icon: Brain, label: 'AI', tab: 'assistant' },
    { icon: MoreHorizontal, label: 'More', tab: 'more' },
  ];

  const moreItems: MoreMenuItem[] = [
    { icon: Paperclip, label: 'Files', tab: 'attachments', group: 'Messages' },
    { icon: FileText, label: 'Summaries', tab: 'summaries', group: 'Messages' },
    { icon: Users, label: 'Contacts', tab: 'contacts', group: 'People' },
    { icon: Smile, label: 'Sentiment', tab: 'sentiment', group: 'People' },
    { icon: Tag, label: 'Labels', tab: 'labels', group: 'Organize' },
    { icon: Clock, label: 'Reminders', tab: 'reminders', group: 'Organize' },
    { icon: CheckSquare, label: 'Commitments', tab: 'commitments', group: 'Organize' },
    { icon: Layout, label: 'Templates', tab: 'templates', group: 'Organize' },
    { icon: BarChart3, label: 'Analytics', tab: 'analytics', group: 'Insights' },
    { icon: FileBarChart, label: 'Reports', tab: 'reports', group: 'Insights' },
    { icon: Settings, label: 'Settings', tab: 'settings', group: 'Settings' },
  ];

  const grouped = moreItems.reduce<Array<{ group: string; items: MoreMenuItem[] }>>((acc, item) => {
    const existing = acc.find((g) => g.group === item.group);
    if (existing) existing.items.push(item);
    else acc.push({ group: item.group, items: [item] });
    return acc;
  }, []);

  const handleMoreItem = (tab: TabType) => {
    onTabChange(tab);
    setIsMoreOpen(false);
  };

  return (
    <>
      {/* Tab Bar */}
      <div className="flex md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-slate-200 z-30 pb-safe">
        <div className="flex w-full items-center justify-around px-1">
          {mainTabs.map((tab, i) => {
            const isMore = tab.tab === 'more';
            const isActive = !isMore && activeTab === tab.tab;
            const Icon = tab.icon;
            return (
              <button
                key={i}
                onClick={() => isMore ? setIsMoreOpen(!isMoreOpen) : onTabChange(tab.tab as TabType)}
                className={`flex flex-col items-center justify-center py-2 px-3 transition-colors relative
                  ${isActive ? 'text-emerald-600' : isMore && isMoreOpen ? 'text-emerald-600' : 'text-slate-400'}
                `}
              >
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-emerald-500 rounded-full" />
                )}
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] mt-1 font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* More Sheet */}
      {isMoreOpen && (
        <>
          <div
            className="flex md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={() => setIsMoreOpen(false)}
          />
          <div className="flex md:hidden fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 max-h-[70vh] overflow-y-auto pb-safe">
            {/* Handle bar */}
            <div className="w-full">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-slate-300 rounded-full" />
              </div>
              <div className="px-5 py-3 flex items-center justify-between border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-900">More Options</h2>
                <button
                  onClick={() => setIsMoreOpen(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="px-4 py-4 space-y-5">
                {grouped.map((group, gi) => (
                  <div key={gi}>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">
                      {group.group}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {group.items.map((item, ii) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.tab;
                        return (
                          <button
                            key={ii}
                            onClick={() => handleMoreItem(item.tab)}
                            className={`flex flex-col items-center justify-center py-3 px-1 rounded-xl transition-all
                              ${isActive
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                : 'text-slate-500 hover:bg-slate-50 border border-transparent'
                              }`}
                          >
                            <Icon size={20} className="mb-1.5" />
                            <span className="text-[11px] font-medium">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default MobileTabBar;
