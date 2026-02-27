'use client';

import { useState } from 'react';
import { Bell, CheckSquare, Calendar } from 'lucide-react';
import RemindersSection from './RemindersSection';
import CommitmentsSection from './CommitmentsSection';
import CalendarSection from './CalendarSection';

type SubTab = 'reminders' | 'commitments' | 'calendar';

const subTabs: { key: SubTab; label: string; icon: typeof Bell }[] = [
  { key: 'reminders', label: 'Reminders', icon: Bell },
  { key: 'commitments', label: 'Commitments', icon: CheckSquare },
  { key: 'calendar', label: 'Calendar', icon: Calendar },
];

export default function ActionsSection() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('reminders');

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Sub-tab navigation */}
        <div className="flex gap-1 bg-surface-100 rounded-xl p-1 mb-8">
          {subTabs.map((tab) => {
            const isActive = activeSubTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveSubTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white shadow-sm text-surface-900'
                    : 'text-surface-500 hover:text-surface-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Sub-tab content */}
        {activeSubTab === 'reminders' && <RemindersSection />}
        {activeSubTab === 'commitments' && <CommitmentsSection />}
        {activeSubTab === 'calendar' && <CalendarSection />}
      </div>
    </div>
  );
}
