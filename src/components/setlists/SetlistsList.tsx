import React, { useState } from 'react';
import { useAppStore } from '../../lib/store';
import { StorageEngine } from '../../lib/storage';
import { syncLocalDataToSupabase } from '../../lib/supabase';
import { Setlist } from '../../types';
import { Modal } from '../common/Modal';
import { Plus, ListMusic, Copy, Trash2, ChevronRight, Users, Sparkles, Share2 } from 'lucide-react';

interface SetlistCardProps {
  setlist: Setlist;
  isOwner: boolean;
  currentUserEmail: string;
  onDuplicate: (setlist: Setlist) => void;
  onDelete: (setlist: Setlist, e: React.MouseEvent) => void;
}

const SetlistCard: React.FC<SetlistCardProps> = ({
  setlist,
  isOwner,
  currentUserEmail,
  onDuplicate,
  onDelete
}) => {
  const { setActiveSetlistId } = useAppStore();
  const totalSongs = setlist.blocks.reduce((acc, b) => acc + b.items.length, 0);

  return (
    <div
      onClick={() => setActiveSetlistId(setlist.id)}
      className="group bg-white dark:bg-zinc-950 hover:border-purple-400 dark:hover:border-purple-500/60 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-sm dark:shadow-md active:scale-[0.99] flex items-center justify-between gap-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
            {setlist.name}
          </h3>
        </div>

        {!isOwner && (
          <p className="text-[10px] text-zinc-500 dark:text-purple-300/70 mb-1 truncate">
            de <span className="font-semibold text-zinc-600 dark:text-purple-200">{setlist.ownerDisplayName || setlist.ownerEmail}</span>
          </p>
        )}

        <div className="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-purple-300/70">
          <span>
            <strong className="text-zinc-800 dark:text-zinc-200 font-semibold">{setlist.blocks.length}</strong>{' '}
            {setlist.blocks.length === 1 ? 'bloco' : 'blocos'}
          </span>
          <span>•</span>
          <span>
            <strong className="text-zinc-800 dark:text-zinc-200 font-semibold">{totalSongs}</strong>{' '}
            {totalSongs === 1 ? 'música' : 'músicas'}
          </span>
          {!isOwner && setlist.members && (() => {
            const myMember = setlist.members.find(m => m.email.toLowerCase() === currentUserEmail.toLowerCase());
            return myMember ? (
              <>
                <span>•</span>
                <span className="text-purple-600 dark:text-purple-400 font-semibold">
                  {myMember.role === 'edit' ? 'Edição' : 'Visualização'}
                </span>
              </>
            ) : null;
          })()}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {isOwner ? (
          <>
            <button
              onClick={() => onDuplicate(setlist)}
              className="p-2 text-zinc-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              title="Duplicar Setlist"
            >
              <Copy className="w-4 h-4" />
            </button>

            <button
              onClick={(e) => onDelete(setlist, e)}
              className="p-2 text-zinc-400 hover:text-rose-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              title="Excluir Setlist"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setActiveSetlistId(setlist.id)}
            className="p-2 text-zinc-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
            title="Abrir Setlist Compartilhado"
          >
            <Share2 className="w-4 h-4" />
          </button>
        )}

        <ChevronRight className="w-5 h-5 text-zinc-400 dark:text-purple-400/60 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors ml-1" />
      </div>
    </div>
  );
};

export const SetlistsList: React.FC = () => {
  const { setActiveSetlistId, showToast, showCascadeWarning } = useAppStore();
  const currentUser = StorageEngine.getUser();
  const [setlists, setSetlists] = useState<Setlist[]>(() =>
    StorageEngine.getSetlistsForUser(currentUser.email)
  );

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSetName, setNewSetName] = useState('');

  const [duplicateTarget, setDuplicateTarget] = useState<Setlist | null>(null);
  const [duplicateName, setDuplicateName] = useState('');

  const reloadSetlists = () => {
    setSetlists(StorageEngine.getSetlistsForUser(currentUser.email));
  };

  // Subscribe to storage changes so the list updates when data syncs from Supabase
  React.useEffect(() => {
    const unsubscribe = StorageEngine.subscribeStorage(() => {
      reloadSetlists();
    });
    return unsubscribe;
  }, [currentUser.email]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;

    const created = StorageEngine.createSetlist(newSetName);
    setIsCreateOpen(false);
    setNewSetName('');
    reloadSetlists();
    showToast(`Setlist "${created.name}" criado!`, 'success');
    if (StorageEngine.getSupabaseConfig().isConnected) {
      await syncLocalDataToSupabase();
    }
    setActiveSetlistId(created.id);
  };

  const handleDuplicate = (setlist: Setlist) => {
    setDuplicateTarget(setlist);
    setDuplicateName(`${setlist.name} (Cópia)`);
  };

  const handleDuplicateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateTarget || !duplicateName.trim()) return;

    const copy = StorageEngine.duplicateSetlist(duplicateTarget.id, duplicateName);
    setDuplicateTarget(null);
    setDuplicateName('');
    reloadSetlists();
    if (copy) {
      showToast(`Setlist duplicado como "${copy.name}"!`, 'success');
      if (StorageEngine.getSupabaseConfig().isConnected) {
        await syncLocalDataToSupabase();
      }
    }
  };

  const handleDeleteRequest = (setlist: Setlist, e: React.MouseEvent) => {
    e.stopPropagation();
    showCascadeWarning({
      setlistId: setlist.id,
      affectedBlocksCount: setlist.blocks.length,
      affectedSetlistsCount: 1,
      title: `Excluir Setlist "${setlist.name}"?`,
      description: 'Esta ação excluirá o setlist e todos os seus blocos e referências de músicas. O acervo do catálogo não será alterado.',
      onConfirm: async () => {
        StorageEngine.deleteSetlist(setlist.id);
        reloadSetlists();
        showToast(`Setlist "${setlist.name}" excluído.`, 'info');
        if (StorageEngine.getSupabaseConfig().isConnected) {
          await syncLocalDataToSupabase();
        }
      }
    });
  };

  // Separate own vs shared setlists
  const ownSetlists = setlists.filter((s) => s.ownerEmail.toLowerCase() === currentUser.email.toLowerCase());
  const sharedSetlists = setlists.filter((s) => s.ownerEmail.toLowerCase() !== currentUser.email.toLowerCase());

  return (
    <div className="p-4 pb-24 sm:p-6 sm:pb-24 md:p-8 md:pb-32 space-y-6 animate-in fade-in duration-200">

      {/* ── Meus Setlists ──────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-zinc-500 dark:text-purple-300 uppercase tracking-wider">
            Meus Setlists ({ownSetlists.length})
          </h2>

          <button
            id="create-setlist-cta-btn"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-lg shadow-purple-900/30 active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Novo Setlist</span>
          </button>
        </div>

        {/* Empty State Onboarding */}
        {ownSetlists.length === 0 ? (
          <div className="bg-white/80 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center my-2 space-y-4">
            <div className="w-16 h-16 bg-purple-50 dark:bg-zinc-900 border border-purple-200 dark:border-zinc-800 rounded-2xl flex items-center justify-center mx-auto text-purple-600 dark:text-purple-400">
              <ListMusic className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">Você ainda não tem setlists</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
                Crie seu primeiro setlist para organizar os blocos e os tons de cada música do seu show.
              </p>
            </div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-purple-900/20 inline-flex items-center gap-2 active:scale-95 transition-transform"
            >
              <Sparkles className="w-4 h-4" />
              <span>Criar meu primeiro setlist</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {ownSetlists.map((setlist) => (
              <SetlistCard
                key={setlist.id}
                setlist={setlist}
                isOwner={true}
                currentUserEmail={currentUser.email}
                onDuplicate={handleDuplicate}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Compartilhados Comigo ──────────────────── */}
      {sharedSetlists.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-zinc-500 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
              Compartilhados Comigo ({sharedSetlists.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {sharedSetlists.map((setlist) => (
              <SetlistCard
                key={setlist.id}
                setlist={setlist}
                isOwner={false}
                currentUserEmail={currentUser.email}
                onDuplicate={handleDuplicate}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        </div>
      )}


      {/* Modal Create Setlist */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Criar Novo Setlist">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Nome do Setlist *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="ex: Casamento Julho / Barzinho Sexta"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-purple-900/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-purple-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-purple-900/20"
            >
              Criar Setlist
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Duplicate Setlist */}
      <Modal
        isOpen={!!duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        title="Duplicar Setlist"
      >
        <form onSubmit={handleDuplicateSubmit} className="space-y-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Crie uma cópia independente com todos os blocos e referências de música.
          </p>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Nome da Cópia *
            </label>
            <input
              type="text"
              required
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-purple-900/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-purple-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDuplicateTarget(null)}
              className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-purple-900/20"
            >
              Duplicar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
