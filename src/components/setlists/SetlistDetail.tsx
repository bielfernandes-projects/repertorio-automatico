import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../lib/store';
import { StorageEngine } from '../../lib/storage';
import { syncLocalDataToSupabase } from '../../lib/supabase';
import { Setlist, Block } from '../../types';
import { getThemeColorStyle } from '../../lib/utils';
import { Modal } from '../common/Modal';
import {
  Search,
  Plus,
  Layers,
  Edit3,
  Check,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  UserPlus,
  Shield,
  X,
  Sparkles,
  Users,
  Copy
} from 'lucide-react';

interface SetlistDetailProps {
  setlistId: string;
  onOpenInviteModal: () => void;
  onOpenAddBlockModal: () => void;
  isInviteModalOpen: boolean;
  setIsInviteModalOpen: (open: boolean) => void;
  isAddBlockModalOpen: boolean;
  setIsAddBlockModalOpen: (open: boolean) => void;
}

export const SetlistDetail: React.FC<SetlistDetailProps> = ({
  setlistId,
  isInviteModalOpen,
  setIsInviteModalOpen,
  isAddBlockModalOpen,
  setIsAddBlockModalOpen
}) => {
  const { setFocusedBlockId, searchQuery, setSearchQuery, showToast, showCascadeWarning, setActiveSetlistId } = useAppStore();
  const currentUser = StorageEngine.getUser();

  const [setlist, setSetlist] = useState<Setlist | undefined>(() =>
    StorageEngine.getSetlistById(setlistId)
  );

  const [shareRole, setShareRole] = useState<'edit' | 'view'>('edit');

  // Subscribe to storage changes for realtime sync
  useEffect(() => {
    const unsubscribe = StorageEngine.subscribeStorage(() => {
      setSetlist(StorageEngine.getSetlistById(setlistId));
    });
    return unsubscribe;
  }, [setlistId]);

  // Rename Inline setlist
  const [isEditingName, setIsEditingName] = useState(false);
  const [editSetName, setEditSetName] = useState('');

  // Add block state
  const [newBlockName, setNewBlockName] = useState('');
  const [newBlockTheme, setNewBlockTheme] = useState('');

  // Edit block state
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [blockEditName, setBlockEditName] = useState('');
  const [blockEditTheme, setBlockEditTheme] = useState('');

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'edit' | 'view'>('edit');

  if (!setlist) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p>Setlist não encontrado.</p>
      </div>
    );
  }

  const isOwner = setlist.ownerEmail === currentUser.email;

  const handleCopySetlistToAccount = async () => {
    if (!setlist) return;
    const copyName = isOwner ? `${setlist.name} (Cópia)` : `${setlist.name} (Minha Cópia)`;
    const copy = StorageEngine.duplicateSetlist(setlist.id, copyName);
    if (copy) {
      showToast(`Setlist "${copy.name}" copiado para o seu dashboard com sucesso!`, 'success');
      if (StorageEngine.getSupabaseConfig().isConnected) {
        await syncLocalDataToSupabase();
      }
      setActiveSetlistId(copy.id);
    }
  };

  // Save Setlist Rename
  const handleSaveSetlistName = async () => {
    if (editSetName.trim() && editSetName !== setlist.name) {
      StorageEngine.updateSetlistName(setlist.id, editSetName);
      await triggerSync();
      showToast('Nome do setlist atualizado!', 'success');
    }
    setIsEditingName(false);
  };

  const triggerSync = async () => {
    if (StorageEngine.getSupabaseConfig().isConnected) {
      const result = await syncLocalDataToSupabase();
      if (!result.success) {
        showToast(`Erro ao sincronizar: ${result.message}`, 'error');
      }
    }
  };

  // Add Block submit
  const handleAddBlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockName.trim()) return;

    const exists = setlist.blocks.some(
      (b) => b.name.toLowerCase() === newBlockName.trim().toLowerCase()
    );
    if (exists) {
      showToast('Já existe um bloco com esse nome neste setlist.', 'error');
      return;
    }

    StorageEngine.addBlock(setlist.id, newBlockName, newBlockTheme);
    setNewBlockName('');
    setNewBlockTheme('');
    setIsAddBlockModalOpen(false);
    await triggerSync();
    showToast('Novo bloco adicionado!', 'success');
  };

  // Edit Block submit
  const handleEditBlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock || !blockEditName.trim()) return;

    const exists = setlist.blocks.some(
      (b) => b.id !== editingBlock.id && b.name.toLowerCase() === blockEditName.trim().toLowerCase()
    );
    if (exists) {
      showToast('Já existe um bloco com esse nome neste setlist.', 'error');
      return;
    }

    StorageEngine.updateBlock(setlist.id, editingBlock.id, blockEditName, blockEditTheme);
    setEditingBlock(null);
    await triggerSync();
    showToast('Bloco atualizado!', 'success');
  };

  // Delete Block request
  const handleDeleteBlockRequest = (block: Block, e: React.MouseEvent) => {
    e.stopPropagation();
    showCascadeWarning({
      blockId: block.id,
      affectedBlocksCount: 1,
      affectedSetlistsCount: 1,
      title: `Excluir Bloco "${block.name}"?`,
      description: `Todas as ${block.items.length} referências de músicas dentro deste bloco serão removidas do setlist.`,
      onConfirm: async () => {
        StorageEngine.deleteBlock(setlist.id, block.id);
        await triggerSync();
        showToast(`Bloco "${block.name}" removido.`, 'info');
      }
    });
  };

  // Move block position
  const handleMoveBlock = async (index: number, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const newBlocks = [...setlist.blocks];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newBlocks.length) return;

    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIdx];
    newBlocks[targetIdx] = temp;

    StorageEngine.reorderBlocks(setlist.id, newBlocks);
    await triggerSync();
  };

  // Invite member submit
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    console.log('[Invite] Sending invite to:', inviteEmail, 'Role:', inviteRole);
    const success = StorageEngine.sendInvitation(setlist.id, inviteEmail, inviteRole);
    console.log('[Invite] StorageEngine result:', success);

    if (success) {
      // Forçar atualização do estado local antes do sync
      const updatedSetlist = StorageEngine.getSetlistById(setlist.id);
      if (updatedSetlist) {
        setSetlist(updatedSetlist);
        console.log('[Invite] Setlist state refreshed locally');
      }

      console.log('[Invite] Syncing setlist after invite...');
      await triggerSync();
      showToast(`Convite enviado para ${inviteEmail}!`, 'success');
      setInviteEmail('');
    } else {
      showToast('Não foi possível enviar o convite. Verifique o e-mail.', 'error');
    }
  };

  // Revoke invitation
  const handleRevoke = (email: string) => {
    showCascadeWarning({
      title: `Revogar acesso de ${email}?`,
      description: 'O usuário perderá o acesso para visualizar ou editar este setlist.',
      affectedBlocksCount: 0,
      affectedSetlistsCount: 0,
      onConfirm: async () => {
        StorageEngine.revokeInvitation(setlist.id, email);
        await triggerSync();
        showToast('Convite revogado.', 'info');
      }
    });
  };

  // Search Filtering
  const filteredBlocks = setlist.blocks.filter((block) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();

    // Check block name or theme
    if (block.name.toLowerCase().includes(query) || block.theme.toLowerCase().includes(query)) {
      return true;
    }

    // Check songs inside block
    const catalog = StorageEngine.getCatalog();
    return block.items.some((item) => {
      const song = catalog.find((s) => s.id === item.catalogSongId);
      if (!song) return false;
      return song.name.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query);
    });
  });

  return (
    <div className="p-4 pb-24 sm:p-6 sm:pb-24 md:p-8 md:pb-32 space-y-4 animate-in fade-in duration-200">
      {/* Setlist Title & Actions */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/40 rounded-2xl p-4 shadow-md space-y-3">
        <div className="flex items-center justify-between gap-2">
          {isEditingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                autoFocus
                value={editSetName}
                onChange={(e) => setEditSetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveSetlistName()}
                className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-purple-600 rounded-xl px-3 py-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none"
              />
              <button
                onClick={handleSaveSetlistName}
                className="p-2 bg-purple-600 text-white font-bold rounded-xl active:scale-95 transition-transform"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h2 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 truncate">{setlist.name}</h2>
              {isOwner && (
                <button
                  onClick={() => {
                    setEditSetName(setlist.name);
                    setIsEditingName(true);
                  }}
                  className="p-1 text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition-colors shrink-0"
                  title="Editar nome do setlist"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

        </div>

        {/* Shared Setlist Banner if not owner */}
        {!isOwner && (
          <div className="bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/50 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span className="text-zinc-700 dark:text-purple-200 text-[11px] truncate">
                Compartilhado por <strong>{setlist.ownerEmail}</strong>
              </span>
            </div>
            <button
              onClick={handleCopySetlistToAccount}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] shrink-0 transition-colors shadow-sm"
            >
              Copiar p/ Meu Dashboard
            </button>
          </div>
        )}

        {/* Search Bar inside setlist */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 dark:text-purple-400/60 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por música, artista, bloco ou tema..."
            className="w-full bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-purple-900/40 focus:border-purple-600 rounded-xl pl-9 pr-8 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-purple-300/40 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Blocks List Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-500 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            Blocos ({filteredBlocks.length})
          </h3>

          <button
            onClick={() => setIsAddBlockModalOpen(true)}
            className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-500 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar Bloco</span>
          </button>
        </div>

        {filteredBlocks.length === 0 ? (
          <div className="bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-purple-900/40 rounded-2xl p-6 text-center space-y-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Nenhum bloco encontrado para esta busca.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredBlocks.map((block, index) => {
              const themeStyle = getThemeColorStyle(block.theme);
              const catalog = StorageEngine.getCatalog();

              return (
                <div
                  key={block.id}
                  onClick={() => setFocusedBlockId(block.id)}
                  className="group bg-white dark:bg-zinc-950 hover:border-purple-400 dark:hover:border-purple-500/60 border border-zinc-200 dark:border-purple-900/40 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-sm dark:shadow-md active:scale-[0.99] space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {block.name}
                        </h4>
                        {block.theme && (
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${themeStyle.bg} ${themeStyle.text} ${themeStyle.border}`}
                          >
                            {block.theme}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-purple-300/70">
                        {block.items.length} {block.items.length === 1 ? 'música' : 'músicas'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {/* Reorder Buttons */}
                      <button
                        disabled={index === 0}
                        onClick={(e) => handleMoveBlock(index, 'up', e)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-30 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Mover para cima"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={index === setlist.blocks.length - 1}
                        onClick={(e) => handleMoveBlock(index, 'down', e)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-30 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Mover para baixo"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Edit Block */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingBlock(block);
                          setBlockEditName(block.name);
                          setBlockEditTheme(block.theme);
                        }}
                        className="p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Editar Bloco"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete Block */}
                      <button
                        onClick={(e) => handleDeleteBlockRequest(block, e)}
                        className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Excluir Bloco"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <ChevronRight className="w-5 h-5 text-zinc-400 dark:text-purple-400/60 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors ml-1" />
                    </div>
                  </div>

                  {/* Preview of songs inside block */}
                  {block.items.length > 0 && (
                    <div className="pt-2 border-t border-zinc-100 dark:border-purple-900/30 space-y-1">
                      {block.items.slice(0, 3).map((item, songIdx) => {
                        const song = catalog.find((s) => s.id === item.catalogSongId);
                        if (!song) return null;
                        return (
                          <div
                            key={item.id}
                            className="text-xs text-zinc-700 dark:text-zinc-300 flex items-center justify-between font-mono"
                          >
                            <span className="truncate">
                              <span className="text-purple-600 dark:text-purple-400 font-semibold mr-1.5">
                                {String(songIdx + 1).padStart(2, '0')}.
                              </span>
                              {song.name} — <span className="text-zinc-500 dark:text-zinc-400 font-sans">{song.artist}</span>
                            </span>
                            <span className="text-[11px] font-bold text-zinc-600 dark:text-purple-300 bg-zinc-100 dark:bg-zinc-950 px-1.5 py-0.5 rounded ml-2">
                              {song.originalKey} {item.requestedKey && item.requestedKey !== song.originalKey ? `→ ${item.requestedKey}` : ''}
                            </span>
                          </div>
                        );
                      })}
                      {block.items.length > 3 && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic block pt-0.5">
                          + {block.items.length - 3} mais músicas...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Add Block */}
      <Modal isOpen={isAddBlockModalOpen} onClose={() => setIsAddBlockModalOpen(false)} title="Novo Bloco de Músicas">
        <form onSubmit={handleAddBlockSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nome do Bloco *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={newBlockName}
              onChange={(e) => setNewBlockName(e.target.value)}
              placeholder="ex: Pagode 90 Lado A / Baladas Românticas"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Tema / Estilo
            </label>
            <input
              type="text"
              value={newBlockTheme}
              onChange={(e) => setNewBlockTheme(e.target.value)}
              placeholder="ex: Pagode 90 / Pop Rock / Sertanejo"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 block mt-1">
              O tema gerará automaticamente uma badge com cor exclusiva baseada no nome.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddBlockModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20"
            >
              Criar Bloco
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Edit Block */}
      <Modal isOpen={!!editingBlock} onClose={() => setEditingBlock(null)} title="Editar Bloco">
        <form onSubmit={handleEditBlockSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nome do Bloco *
            </label>
            <input
              type="text"
              required
              value={blockEditName}
              onChange={(e) => setBlockEditName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Tema / Estilo
            </label>
            <input
              type="text"
              value={blockEditTheme}
              onChange={(e) => setBlockEditTheme(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingBlock(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Share Setlist via Link / WhatsApp */}
      <Modal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Compartilhar Setlist">
        <div className="space-y-5">
          <div className="bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border border-purple-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Nível de Permissão</span>
              </div>

              {/* Permission Selector */}
              <div className="flex items-center bg-zinc-200 dark:bg-zinc-900 p-0.5 rounded-xl border border-zinc-300 dark:border-purple-900/50">
                <button
                  type="button"
                  onClick={() => setShareRole('edit')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    shareRole === 'edit'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setShareRole('view')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    shareRole === 'view'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  Visualizar
                </button>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              Envie o link do setlist para outros músicos com a permissão selecionada acima.
            </p>

            {/* Link Box */}
            <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-purple-900/60 rounded-xl p-2.5">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}${window.location.pathname}?share=${setlist.id}&role=${shareRole}`}
                className="flex-1 bg-transparent text-xs text-zinc-800 dark:text-zinc-200 font-mono focus:outline-none select-all truncate"
              />
              <button
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?share=${setlist.id}&role=${shareRole}`;
                  navigator.clipboard.writeText(url);
                  showToast(`Link do setlist copiado (${shareRole === 'edit' ? 'Edição' : 'Visualização'})!`, 'success');
                }}
                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg active:scale-95 transition-all shrink-0 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar</span>
              </button>
            </div>

            {/* Quick Share Buttons */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?share=${setlist.id}&role=${shareRole}`;
                  const perm = shareRole === 'edit' ? '(Modo Edição)' : '(Modo Visualização)';
                  const msg = `🎵 Confira o setlist "${setlist.name}" no Repertório Automático ${perm}:\n${url}`;
                  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
                }}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 px-3 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <span>Enviar no WhatsApp</span>
              </button>
            </div>
          </div>

          {/* Members List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-zinc-500 dark:text-purple-300 uppercase tracking-wider">
              Acessos do Setlist ({setlist.members.length + 1})
            </h4>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {/* Owner */}
              <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/40 rounded-xl p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 block">{setlist.ownerEmail}</span>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 flex items-center gap-1 font-semibold">
                    <Shield className="w-3 h-3" />
                    Dono do Setlist
                  </span>
                </div>
              </div>

              {/* Members who joined via link */}
              {setlist.members.map((m) => (
                <div key={m.id} className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/40 rounded-xl p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 block">{m.email}</span>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      Entrou via Link • <strong className="text-emerald-600 dark:text-emerald-400">Acesso Concedido</strong>
                    </span>
                  </div>

                  {isOwner && (
                    <button
                      onClick={() => handleRevoke(m.email)}
                      className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Revogar Acesso"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
