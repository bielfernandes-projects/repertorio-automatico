import React from 'react';
import { useAppStore } from '../../lib/store';
import { ListMusic, Music, User } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    focusedBlockId,
    setActiveSetlistId
  } = useAppStore();

  // Hide bottom nav in focused block view (immersive mode)
  if (focusedBlockId) return null;

  const handleTabClick = (tab: 'setlists' | 'catalog' | 'profile') => {
    // If clicking setlists tab while inside a setlist detail, exit back to list
    if (tab === 'setlists') {
      setActiveSetlistId(null);
    }
    setActiveTab(tab);
  };

  return (
    <nav
      id="bottom-navigation-bar"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#090714]/95 backdrop-blur-lg border-t border-zinc-200 dark:border-purple-900/40 w-full max-w-7xl mx-auto shadow-2xl transition-colors"
    >
      <div className="flex items-center justify-around sm:justify-center sm:gap-12 h-16 px-4">
        <button
          id="nav-tab-setlists"
          onClick={() => handleTabClick('setlists')}
          aria-label="Setlists"
          className={`relative p-3 sm:px-6 rounded-2xl transition-all duration-200 active:scale-90 flex items-center justify-center ${
            activeTab === 'setlists'
              ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 shadow-inner'
              : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
          }`}
        >
          <ListMusic className="w-6 h-6 stroke-[2]" />
          <span className="hidden sm:inline font-bold text-xs ml-2">Setlists</span>
          {activeTab === 'setlists' && (
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-purple-600 dark:bg-purple-400 rounded-full" />
          )}
        </button>

        <button
          id="nav-tab-catalog"
          onClick={() => handleTabClick('catalog')}
          aria-label="Catálogo"
          className={`relative p-3 sm:px-6 rounded-2xl transition-all duration-200 active:scale-90 flex items-center justify-center ${
            activeTab === 'catalog'
              ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 shadow-inner'
              : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
          }`}
        >
          <Music className="w-6 h-6 stroke-[2]" />
          <span className="hidden sm:inline font-bold text-xs ml-2">Catálogo</span>
          {activeTab === 'catalog' && (
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-purple-600 dark:bg-purple-400 rounded-full" />
          )}
        </button>

        <button
          id="nav-tab-profile"
          onClick={() => handleTabClick('profile')}
          aria-label="Perfil"
          className={`relative p-3 sm:px-6 rounded-2xl transition-all duration-200 active:scale-90 flex items-center justify-center ${
            activeTab === 'profile'
              ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 shadow-inner'
              : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
          }`}
        >
          <User className="w-6 h-6 stroke-[2]" />
          <span className="hidden sm:inline font-bold text-xs ml-2">Perfil</span>
          {activeTab === 'profile' && (
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-purple-600 dark:bg-purple-400 rounded-full" />
          )}
        </button>
      </div>
    </nav>
  );
};
