import React from 'react';
import { Files, FileText, Link2, Network, Sparkles } from 'lucide-react';

export type MobileTab = 'files' | 'note' | 'links' | 'graph' | 'ask';

interface MobileTabBarProps {
  activeTab: MobileTab;
  hasActiveNote: boolean;
  onSelectTab: (tab: MobileTab) => void;
}

const TABS: Array<{ id: MobileTab; label: string; icon: React.ElementType }> = [
  { id: 'files', label: 'Files', icon: Files },
  { id: 'note', label: 'Note', icon: FileText },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'ask', label: 'Ask', icon: Sparkles },
];

/**
 * Bottom navigation shown only below the `md` breakpoint. Gives touch users
 * access to panes and actions that are otherwise reachable only via keyboard
 * shortcuts (Cmd/Ctrl+K/G/J) or the desktop three-column layout.
 */
export const MobileTabBar: React.FC<MobileTabBarProps> = ({ activeTab, hasActiveNote, onSelectTab }) => {
  return (
    <nav
      id="mobile-tab-bar"
      className="md:hidden fixed bottom-0 inset-x-0 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md pb-safe select-none z-50"
    >
      <div className="grid grid-cols-5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isDisabled = id === 'links' && !hasActiveNote;
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              id={`mobile-tab-${id}`}
              disabled={isDisabled}
              onClick={() => onSelectTab(id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[10px] font-medium transition-colors ${
                isDisabled
                  ? 'text-zinc-700'
                  : isActive
                  ? 'text-violet-300'
                  : 'text-zinc-500 active:text-zinc-300'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive && !isDisabled ? 'text-violet-400' : ''}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
