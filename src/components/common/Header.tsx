import React from 'react';
import { useAppStore } from '../../lib/store';
import { StorageEngine } from '../../lib/storage';
import { ArrowLeft, Music, Share2, Plus } from 'lucide-react';

interface HeaderProps {
  onOpenInviteModal?: () => void;
  onOpenAddBlockModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenInviteModal, onOpenAddBlockModal }) => {
  const {
    activeTab,
    activeSetlistId,
    setActiveSetlistId,
    focusedBlockId,
    setFocusedBlockId
  } = useAppStore();

  const setlist = activeSetlistId ? StorageEngine.getSetlistById(activeSetlistId) : null;
  const focusedBlock = setlist && focusedBlockId ? setlist.blocks.find((b) => b.id === focusedBlockId) : null;

  // Header in focused block view
  if (focusedBlock) {
    return (
      <header className="sticky top-0 z-30 bg-zinc-100/95 dark:bg-black/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-900 px-4 sm:px-6 md:px-8 py-3.5 flex items-center justify-between">
        <button
          id="header-back-to-setlist"
          onClick={() => setFocusedBlockId(null)}
          className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/80 border border-purple-200 dark:border-purple-800/50 px-3 py-1.5 rounded-full transition-colors active:scale-95"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar ao setlist</span>
        </button>
        <div className="text-right truncate max-w-[200px] sm:max-w-xs">
          <span className="text-[10px] text-zinc-400 dark:text-purple-300/60 uppercase tracking-wider font-medium block">Bloco Focado</span>
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate block">{focusedBlock.name}</span>
        </div>
      </header>
    );
  }

  // Header in Setlist view
  if (activeSetlistId && setlist) {
    return (
      <header className="sticky top-0 z-30 bg-zinc-100/95 dark:bg-black/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-900 px-4 sm:px-6 md:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            id="header-back-to-setlists-list"
            onClick={() => setActiveSetlistId(null)}
            className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors active:scale-95"
            title="Voltar aos Setlists"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">{setlist.name}</h1>
            <span className="text-[11px] text-zinc-500 dark:text-purple-300/70">
              {setlist.blocks.length} {setlist.blocks.length === 1 ? 'bloco' : 'blocos'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenInviteModal && (
            <button
              id="header-invite-btn"
              onClick={onOpenInviteModal}
              className="p-2 text-zinc-600 dark:text-purple-300 hover:text-purple-600 dark:hover:text-white hover:bg-purple-50 dark:hover:bg-purple-950/60 rounded-lg transition-colors active:scale-95 relative"
              title="Compartilhar / Convidados"
            >
              <Share2 className="w-4 h-4" />
              {setlist.members.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {setlist.members.length}
                </span>
              )}
            </button>
          )}

          {onOpenAddBlockModal && (
            <button
              id="header-add-block-btn"
              onClick={onOpenAddBlockModal}
              className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-transform active:scale-95 shadow-sm shadow-purple-900/30"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Bloco</span>
            </button>
          )}
        </div>
      </header>
    );
  }

  // Header for main tabs
  return (
    <header className="sticky top-0 z-30 bg-zinc-100/95 dark:bg-black/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-900 px-4 sm:px-6 md:px-8 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-md shadow-purple-900/30 overflow-hidden shrink-0">
          <img src="/logo.png" alt="Logo" className="w-5 h-5 object-contain" />
        </div>
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
            Repertório <span className="text-purple-600 dark:text-purple-400">Automático</span>
          </h1>
          <p className="text-[10px] text-zinc-500 dark:text-purple-300/70 font-medium">
            {activeTab === 'setlists' && 'Seus setlists de apresentações'}
            {activeTab === 'catalog' && 'Acervo geral de músicas'}
            {activeTab === 'profile' && 'Sua conta e preferências'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
      </div>
    </header>
  );
};
