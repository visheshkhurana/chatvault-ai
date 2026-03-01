'use client';

import { useState } from 'react';
import {
  Bot, MessageSquare, CheckCircle, Users, MoreHorizontal, X,
  Sparkles, Mic, BookOpen, Heart, Brain, BarChart3, Cake, Globe, Reply, Zap,
  Settings, Gift, Handshake,
} from 'lucide-react';
import { TabType } from '@/types/dashboard';

interface MobileTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const primaryTabs: { key: TabType; label: string; icon: typeof Bot }[] = [
  { key: 'home', label: 'Home', icon: Bot },
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'actions', label: 'Actions', icon: CheckCircle },
  { key: 'people', label: 'People', icon: Users },
];

const moreTabs: { key: TabType; label: string; icon: typeof Bot }[] = [
  { key: 'memories', label: 'Memories', icon: Sparkles },
  { key: 'voice-notes', label: 'Voice Notes', icon: Mic },
  { key: 'knowledge-base', label: 'Knowledge Base', icon: BookOpen },
  { key: 'contact-insights', label: 'Contact Insights', icon: Heart },
  { key: 'emotional-insights', label: 'Emotional Insights', icon: Brain },
  { key: 'weekly-recap', label: 'Weekly Recap', icon: BarChart3 },
  { key: 'birthdays', label: 'Special Dates', icon: Cake },
  { key: 'shared-spaces', label: 'Shared Spaces', icon: Globe },
  { key: 'response-suggestions', label: 'Smart Replies', icon: Reply },
  { key: 'agentic-tasks', label: 'Tasks', icon: Zap },
  { key: 'referrals', label: 'Refer Friends', icon: Gift },  { key: 'relationships', label: 'Relationships', icon: Handshake },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const moreTabKeys = new Set(moreTabs.map(t => t.key));

export default function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  const [showMore, setShowMore] = useState(false);
  const isMoreActive = moreTabKeys.has(activeTab);

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="absolute bottom-16 left-2 right-2 bg-white rounded-2xl shadow-2xl border border-surface-200 p-3 max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 pb-2 border-b border-surface-100 mb-2">
              <span className="text-sm font-bold text-surface-900">More Features</span>
              <button onClick={() => setShowMore(false)} className="p-1 text-surface-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {moreTabs.map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => { onTabChange(tab.key); setShowMore(false); }}
                    className={'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all '
                      + (isActive ? 'bg-brand-50 text-brand-600' : 'text-surface-500 hover:bg-surface-50 active:bg-surface-100')}
                  >
                    <tab.icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium text-center leading-tight">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-surface-200 z-50 safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-1.5">
          {primaryTabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={'relative flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg transition-all min-w-0 min-h-[44px] '
                  + (isActive
                    ? 'text-brand-600'
                    : 'text-surface-400 active:text-surface-600')}
              >
                <tab.icon className={'w-5 h-5 transition-all ' + (isActive ? 'scale-105' : '')} />
                <span className={'text-[10px] font-medium truncate ' + (isActive ? 'text-brand-600' : 'text-surface-400')}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className="absolute -bottom-1.5 w-6 h-0.5 bg-brand-500 rounded-full" />
                )}
              </button>
            );
          })}
          {/* More button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className={'relative flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg transition-all min-w-0 min-h-[44px] '
              + (isMoreActive ? 'text-brand-600' : 'text-surface-400 active:text-surface-600')}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className={'text-[10px] font-medium ' + (isMoreActive ? 'text-brand-600' : 'text-surface-400')}>More</span>
            {isMoreActive && (
              <div className="absolute -bottom-1.5 w-6 h-0.5 bg-brand-500 rounded-full" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
