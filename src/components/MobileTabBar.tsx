'use client';

import { Bot, MessageSquare, CheckCircle, Users } from 'lucide-react';
import { TabType } from '@/types/dashboard';

interface MobileTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { key: TabType; label: string; icon: typeof Bot }[] = [
  { key: 'home', label: 'Home', icon: Bot },
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'actions', label: 'Actions', icon: CheckCircle },
  { key: 'people', label: 'People', icon: Users },
];

export default function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-surface-200 z-50 safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1.5">
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={'relative flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-lg transition-all min-w-0 '
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
      </div>
    </div>
  );
}
