'use client';

import { Home, MessageSquare, CheckCircle, Users, Bot } from 'lucide-react';
import { TabType } from '@/types/dashboard';

interface MobileTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { key: TabType; label: string; icon: typeof Home }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'actions', label: 'Actions', icon: CheckCircle },
  { key: 'people', label: 'People', icon: Users },
  { key: 'assistant', label: 'AI', icon: Bot },
];

export default function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1">
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={'flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg transition-colors min-w-0 '
                + (isActive
                  ? 'text-emerald-600'
                  : 'text-gray-400 active:text-gray-600')}
            >
              <tab.icon className={'transition-all ' + (isActive ? 'w-5 h-5' : 'w-5 h-5')} />
              <span className={'text-[10px] font-medium truncate ' + (isActive ? 'text-emerald-600' : 'text-gray-400')}>
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute bottom-0 w-8 h-0.5 bg-emerald-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
