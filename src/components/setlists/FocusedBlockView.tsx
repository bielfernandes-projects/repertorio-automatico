import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../lib/store';
import { StorageEngine } from '../../lib/storage';
import { syncLocalDataToSupabase } from '../../lib/supabase';
import { Block, BlockItem, CatalogSong } from '../../types';
import { buildCifraClubUrl, getThemeColorStyle } from '../../lib/utils';
import { Modal } from '../common/Modal';
import { SongDocumentsModal } from '../common/SongDocumentsModal';
import { ArrowLeft, Globe, FileMusic, Plus, Trash2, ArrowUp, ArrowDown, AlertCircle, Search, Edit2, Check, Music, X } from 'lucide-react';

interface FocusedBlockViewProps {
  setlistId: string;
  blockId: string;
}

// Key badge sub-component: Original → Requested key display with inline editing
const KeyBadgeDisplay: React.FC<{
  item: BlockItem;
  isEditingKey: boolean;
  editingItemId: string | null;
  inlineKeyInput: string;
  setInlineKeyInput: (val: string) => void;
  handleSaveRequestedKey: (item: BlockItem) => void;
  setEditingItemId: (id: string | null) => void;
}> = ({ item, isEditingKey, inlineKeyInput, setInlineKeyInput, handleSaveRequestedKey, setEditingItemId }) => (
  <div className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono flex items-center gap-1.5 shadow-inner">
    <span className="text-slate-400 font-medium text-[11px]" title="Tom Original">
      {item.songOriginalKey || '?'}
    </span>
    <span className="text-slate-600 font-bold text-[10px]">→</span>
    {isEditingKey ? (
      <div className="flex items-center gap-1">
        <input
          type="text"
          autoFocus
          value={inlineKeyInput}
          onChange={(e) => setInlineKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSaveRequestedKey(item)}
          className="w-12 bg-slate-900 border border-emerald-500 rounded px-1 text-center font-bold text-emerald-400 text-xs focus:outline-none"
        />
        <button
          onClick={() => handleSaveRequestedKey(item)}
          className="text-emerald-400 hover:text-emerald-300 p-0.5"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </div>
    ) : (
      <button
        onClick={() => {
          setEditingItemId(item.id);
          setInlineKeyInput(item.requestedKey || item.songOriginalKey || '');
        }}
        className="font-extrabold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1 transition-colors"
        title="Toque para alterar o tom solicitado"
      >
        <span>{item.requestedKey || item.songOriginalKey || '?'}</span>
        <Edit2 className="w-2.5 h-2.5 opacity-60" />
      </button>
    )}
  </div>
);

// Reusable action buttons for a block item (avoids JSX duplication for mobile/desktop layouts)
const ItemActionButtons: React.FC<{
  item: BlockItem;
  index: number;
  totalItems: number;
  onOpenCifra: (item: BlockItem) => void;
  onOpenDocs: (item: BlockItem) => void;
  onMoveItem: (index: number, direction: 'up' | 'down') => void;
  onRemoveItem: (item: BlockItem) => void;
}> = ({ item, index, totalItems, onOpenCifra, onOpenDocs, onMoveItem, onRemoveItem }) => (
  <>
    <button
      onClick={() => onOpenDocs(item)}
      className="p-1.5 text-purple-300 hover:text-white hover:bg-purple-900/50 bg-zinc-950 border border-purple-900/40 rounded-xl transition-colors active:scale-95 shadow-sm relative"
      title="Ver Partituras e Anexos"
    >
      <FileMusic className="w-3.5 h-3.5 text-purple-400" />
      {(() => {
        const s = StorageEngine.getCatalogSongById(item.catalogSongId);
        const count = s?.documents?.length || 0;
        if (count > 0) {
          return (
            <span className="absolute -top-1.5 -right-1.5 bg-purple-600 text-white text-[9px] font-extrabold w-3.5 h-3.5 rounded-full flex items-center justify-center ring-2 ring-slate-900">
              {count}
            </span>
          );
        }
        return null;
      })()}
    </button>

    <button
      onClick={() => onOpenCifra(item)}
      className="p-1.5 text-zinc-300 hover:text-amber-400 hover:bg-zinc-800 bg-zinc-950 border border-purple-900/40 rounded-xl transition-colors active:scale-95 shadow-sm"
      title="Abrir Cifra Club"
    >
      <Globe className="w-3.5 h-3.5 text-purple-400" />
    </button>

    <div className="flex flex-col gap-0.5">
      <button
        disabled={index === 0}
        onClick={() => onMoveItem(index, 'up')}
        className="p-1 text-slate-500 hover:text-slate-200 disabled:opacity-20 rounded"
      >
        <ArrowUp className="w-3 h-3" />
      </button>
      <button
        disabled={index === totalItems - 1}
        onClick={() => onMoveItem(index, 'down')}
        className="p-1 text-slate-500 hover:text-slate-200 disabled:opacity-20 rounded"
      >
        <ArrowDown className="w-3 h-3" />
      </button>
    </div>

    <button
      onClick={() => onRemoveItem(item)}
      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
      title="Remover do bloco"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </>
);

export const FocusedBlockView: React.FC<FocusedBlockViewProps> = ({ setlistId, blockId }) => {
  const { setFocusedBlockId, openCifraModal, showToast } = useAppStore();

  const [setlist, setSetlist] = useState(() => StorageEngine.getSetlistById(setlistId));
  const [block, setBlock] = useState<Block | undefined>(() =>
    setlist?.blocks.find((b) => b.id === blockId)
  );

  // Subscribe to realtime changes
  useEffect(() => {
    const unsubscribe = StorageEngine.subscribeStorage(() => {
      const st = StorageEngine.getSetlistById(setlistId);
      setSetlist(st);
      setBlock(st?.blocks.find((b) => b.id === blockId));
    });
    return unsubscribe;
  }, [setlistId, blockId]);

  // Inline editing requested key state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [inlineKeyInput, setInlineKeyInput] = useState('');

  // Inline editing notes state
  const [editingNotesItemId, setEditingNotesItemId] = useState<string | null>(null);
  const [inlineNotesInput, setInlineNotesInput] = useState('');

  // Add song modal state
  const [isAddSongOpen, setIsAddSongOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [newSongNotes, setNewSongNotes] = useState('');

  // Quick create catalog song inside modal state
  const [newSongName, setNewSongName] = useState('');
  const [newSongArtist, setNewSongArtist] = useState('');
  const [newSongKey, setNewSongKey] = useState('');

  // Song Documents modal state
  const [docsModalSong, setDocsModalSong] = useState<CatalogSong | null>(null);

  // Dismissed warning badges state
  const [dismissedWarnings, setDismissedWarnings] = useState<Record<string, boolean>>({});

  const handleDismissWarning = (itemId: string) => {
    setDismissedWarnings((prev) => ({ ...prev, [itemId]: true }));
  };

  if (!setlist || !block) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p>Bloco não encontrado.</p>
        <button
          onClick={() => setFocusedBlockId(null)}
          className="mt-4 px-4 py-2 bg-slate-800 text-xs rounded-xl"
        >
          Voltar ao Setlist
        </button>
      </div>
    );
  }

  const triggerSync = async () => {
    if (StorageEngine.getSupabaseConfig().isConnected) {
      const result = await syncLocalDataToSupabase();
      if (!result.success) {
        showToast(`Erro ao sincronizar: ${result.message}`, 'error');
      }
    }
  };

  const themeStyle = getThemeColorStyle(block.theme);
  const hydratedItems = StorageEngine.hydrateBlockItems(block.items);

  // Save Inline Requested Key
  const handleSaveRequestedKey = async (item: BlockItem) => {
    StorageEngine.updateRequestedKey(setlistId, blockId, item.id, inlineKeyInput);
    await triggerSync();
    showToast('Tom solicitado atualizado!', 'success');
    setEditingItemId(null);
  };

  // Save Inline Notes
  const handleSaveNotes = async (item: BlockItem) => {
    StorageEngine.updateBlockItemNotes(setlistId, blockId, item.id, inlineNotesInput);
    await triggerSync();
    showToast('Observação atualizada!', 'success');
    setEditingNotesItemId(null);
  };

  // Remove song from block (with Undo toast!)
  const handleRemoveItem = async (item: BlockItem) => {
    const backupItem = { ...item };
    StorageEngine.removeSongFromBlock(setlistId, blockId, item.id);
    await triggerSync();

    showToast(
      `"${item.songName}" removida do bloco.`,
      'info',
      'Desfazer',
      async () => {
        StorageEngine.addSongToBlock(setlistId, blockId, backupItem.catalogSongId, backupItem.requestedKey);
        await triggerSync();
        showToast(`"${item.songName}" restaurada!`, 'success');
      },
      5000
    );
  };

  // Move item position inside block
  const handleMoveItem = async (index: number, direction: 'up' | 'down') => {
    const newItems = [...block.items];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newItems.length) return;

    const temp = newItems[index];
    newItems[index] = newItems[targetIdx];
    newItems[targetIdx] = temp;

    StorageEngine.reorderBlockItems(setlistId, blockId, newItems);
    await triggerSync();
  };

  // Open Cifra Webview
  const handleOpenCifra = (item: BlockItem) => {
    const song = StorageEngine.getCatalogSongById(item.catalogSongId);
    if (!song) {
      showToast('Música não encontrada no catálogo', 'error');
      return;
    }

    const { url } = buildCifraClubUrl(
      song.artist,
      song.name,
      song.originalKey,
      item.requestedKey,
      song.slugOverride
    );

    openCifraModal(
      song.name,
      song.artist,
      url,
      song.originalKey,
      item.requestedKey,
      song.slugOverride,
      song.id
    );
  };

  // Add Song from Catalog Selection
  const handleSelectSongFromCatalog = async (song: CatalogSong) => {
    const added = StorageEngine.addSongToBlock(setlistId, blockId, song.id, song.originalKey, newSongNotes);
    if (!added) {
      showToast('Esta música já está neste bloco.', 'error');
      return;
    }
    await triggerSync();
    showToast(`"${song.name}" adicionada ao bloco!`, 'success');
    setIsAddSongOpen(false);
    setCatalogSearch('');
    setNewSongNotes('');
  };

  // Create Song in Catalog and Add to Block simultaneously
  const handleCreateAndAddSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSongName.trim() || !newSongArtist.trim()) {
      showToast('Nome e Artista são obrigatórios.', 'error');
      return;
    }

    const newSong = StorageEngine.addCatalogSong(
      newSongName,
      newSongArtist,
      newSongKey || 'C'
    );

    StorageEngine.addSongToBlock(setlistId, blockId, newSong.id, newSong.originalKey, newSongNotes);
    await triggerSync();
    showToast(`Música "${newSong.name}" criada e adicionada!`, 'success');

    setIsAddSongOpen(false);
    setCatalogSearch('');
    setNewSongName('');
    setNewSongArtist('');
    setNewSongKey('');
    setNewSongNotes('');
  };

  // Filter Catalog
  const allCatalog = StorageEngine.getCatalog();
  const existingSongIds = new Set(block.items.map((i) => i.catalogSongId));
  const filteredCatalog = allCatalog.filter((s) => {
    if (!catalogSearch.trim()) return !existingSongIds.has(s.id);
    const query = catalogSearch.toLowerCase();
    return (
      !existingSongIds.has(s.id) &&
      (s.name.toLowerCase().includes(query) || s.artist.toLowerCase().includes(query))
    );
  });

  return (
    <div className="p-4 pb-24 sm:p-6 sm:pb-24 md:p-8 md:pb-32 space-y-4 animate-in fade-in duration-200">
      {/* Block Header Info */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-100">{block.name}</h2>
            {block.theme && (
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${themeStyle.bg} ${themeStyle.text} ${themeStyle.border}`}
              >
                {block.theme}
              </span>
            )}
          </div>

          <button
            id="add-song-to-block-cta"
            onClick={() => setIsAddSongOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-xl shadow-md active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Música</span>
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Setlist: <span className="text-slate-200 font-semibold">{setlist.name}</span> •{' '}
          {block.items.length} {block.items.length === 1 ? 'música' : 'músicas'}
        </p>
      </div>

      {/* Numbered Vertical Songs List */}
      {hydratedItems.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
            <Music className="w-6 h-6" />
          </div>
          <p className="text-xs text-slate-400">Este bloco ainda não possui músicas.</p>
          <button
            onClick={() => setIsAddSongOpen(true)}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl shadow-lg inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Primeira Música</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {hydratedItems.map((item, index) => {
            const originalKeyChanged =
              item.originalKeyAtAssignment &&
              item.songOriginalKey &&
              item.originalKeyAtAssignment !== item.songOriginalKey;

            const isEditingKey = editingItemId === item.id;

            return (
              <div
                key={item.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3.5 shadow-md space-y-2"
              >
                {/* Mobile: [01. Nome | Tom] then [actions] below */}
                {/* Desktop: [01. Nome] inline with [Tom + actions] */}
                <div className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-2">
                  {/* Number + Name (flex-1) + Key badge on mobile */}
                  <div className="min-w-0 flex items-start gap-2.5 flex-1">
                    <span className="text-sm font-black text-slate-500 font-mono shrink-0 w-6 pt-0.5">
                      {String(index + 1).padStart(2, '0')}.
                    </span>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-slate-100 truncate">{item.songName}</h4>
                      <p className="text-xs text-slate-400 truncate">{item.songArtist}</p>

                      {/* Observações / Notas */}
                      {editingNotesItemId === item.id ? (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <input
                            type="text"
                            autoFocus
                            value={inlineNotesInput}
                            onChange={(e) => setInlineNotesInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveNotes(item)}
                            placeholder="Observação (ex: Começa no violão)..."
                            className="flex-1 bg-slate-950 border border-purple-500/40 rounded-lg px-2 py-0.5 text-[11px] text-slate-100 focus:outline-none focus:border-purple-500"
                          />
                          <button
                            onClick={() => handleSaveNotes(item)}
                            className="bg-purple-600 hover:bg-purple-500 text-white font-bold p-1 rounded-lg active:scale-95 transition-transform"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingNotesItemId(null)}
                            className="text-slate-400 hover:text-slate-200 text-[10px] font-semibold px-1"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : item.notes ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span
                            onClick={() => {
                              setEditingNotesItemId(item.id);
                              setInlineNotesInput(item.notes || '');
                            }}
                            className="text-[11px] text-purple-300 hover:text-purple-200 italic cursor-pointer truncate max-w-[180px] sm:max-w-xs hover:underline"
                            title="Clique para editar a observação"
                          >
                            &ldquo;{item.notes}&rdquo;
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingNotesItemId(item.id);
                            setInlineNotesInput('');
                          }}
                          className="text-[10px] text-slate-500 hover:text-purple-400 font-semibold mt-0.5 flex items-center gap-0.5 transition-colors cursor-pointer"
                          title="Adicionar observação"
                        >
                          <span>+ obs</span>
                        </button>
                      )}
                    </div>

                    {/* Key badge inline on mobile (right side) */}
                    <div className="md:hidden shrink-0 self-start">
                      <KeyBadgeDisplay
                        item={item}
                        isEditingKey={isEditingKey}
                        editingItemId={editingItemId}
                        inlineKeyInput={inlineKeyInput}
                        setInlineKeyInput={setInlineKeyInput}
                        handleSaveRequestedKey={handleSaveRequestedKey}
                        setEditingItemId={setEditingItemId}
                      />
                    </div>
                  </div>

                  {/* Desktop: Key + Actions (hidden on mobile) */}
                  <div className="hidden md:flex items-center gap-1.5 md:shrink-0">
                    <KeyBadgeDisplay
                      item={item}
                      isEditingKey={isEditingKey}
                      editingItemId={editingItemId}
                      inlineKeyInput={inlineKeyInput}
                      setInlineKeyInput={setInlineKeyInput}
                      handleSaveRequestedKey={handleSaveRequestedKey}
                      setEditingItemId={setEditingItemId}
                    />
                    <ItemActionButtons
                      item={item}
                      index={index}
                      totalItems={hydratedItems.length}
                      onOpenCifra={handleOpenCifra}
                      onOpenDocs={(it) => {
                        const s = StorageEngine.getCatalogSongById(it.catalogSongId);
                        if (s) setDocsModalSong(s);
                      }}
                      onMoveItem={handleMoveItem}
                      onRemoveItem={handleRemoveItem}
                    />
                  </div>
                </div>

                {/* Action buttons row (mobile only) */}
                <div className="md:hidden flex items-center gap-1.5 pt-2 mt-1 border-t border-slate-800/50">
                  <ItemActionButtons
                    item={item}
                    index={index}
                    totalItems={hydratedItems.length}
                    onOpenCifra={handleOpenCifra}
                    onOpenDocs={(it) => {
                      const s = StorageEngine.getCatalogSongById(it.catalogSongId);
                      if (s) setDocsModalSong(s);
                    }}
                    onMoveItem={handleMoveItem}
                    onRemoveItem={handleRemoveItem}
                  />
                </div>

                {/* Badge if catalog original key was changed after assignment */}
                {originalKeyChanged && !dismissedWarnings[item.id] && (
                  <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl p-2 text-[10px] text-amber-300 flex items-center justify-between gap-1.5 mt-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span className="truncate">Tom original mudou no catálogo; confira o tom solicitado se necessário.</span>
                    </div>
                    <button
                      onClick={() => handleDismissWarning(item.id)}
                      className="p-1 hover:bg-amber-900/50 text-amber-400 hover:text-amber-200 rounded-lg transition-colors shrink-0"
                      title="Fechar aviso"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Add Song to Block (with search & inline create) */}
      <Modal isOpen={isAddSongOpen} onClose={() => setIsAddSongOpen(false)} title="Adicionar Música ao Bloco">
        <div className="space-y-4">
          {/* Search catalog */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Buscar no seu catálogo..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Observação Input */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Observação para o show (opcional):
            </label>
            <input
              type="text"
              value={newSongNotes}
              onChange={(e) => setNewSongNotes(e.target.value)}
              placeholder="Ex: Começa do solo de violão, Crescente, etc."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Catalog songs match list */}
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {filteredCatalog.length > 0 ? (
              filteredCatalog.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectSongFromCatalog(s)}
                  className="w-full bg-slate-950/80 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-2.5 text-left transition-colors flex items-center justify-between text-xs"
                >
                  <div className="truncate min-w-0 pr-2">
                    <span className="font-bold text-slate-100 block truncate">{s.name}</span>
                    <span className="text-slate-400 text-[11px] block truncate">{s.artist}</span>
                  </div>
                  <span className="font-mono text-[10px] font-bold text-slate-300 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded shrink-0">
                    {s.originalKey}
                  </span>
                </button>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic py-2 text-center">
                {catalogSearch ? 'Nenhuma música encontrada no catálogo para esta busca.' : 'Todas as músicas do catálogo já estão neste bloco.'}
              </p>
            )}
          </div>

          {/* Create new song in catalog inline section */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              Não encontrou? Criar no catálogo e adicionar:
            </h4>

            <form onSubmit={handleCreateAndAddSong} className="space-y-2.5 bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Nome da música *"
                  value={newSongName}
                  onChange={(e) => setNewSongName(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Artista *"
                  value={newSongArtist}
                  onChange={(e) => setNewSongArtist(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Tom Original (ex: Am, G, Dó)"
                  value={newSongKey}
                  onChange={(e) => setNewSongKey(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-4 py-1.5 rounded-xl transition-colors shrink-0"
                >
                  Criar e Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      </Modal>

      {/* Song Documents Modal */}
      <SongDocumentsModal
        song={docsModalSong}
        isOpen={!!docsModalSong}
        onClose={() => setDocsModalSong(null)}
        onSongUpdated={(updated) => {
          setDocsModalSong(updated);
        }}
      />
    </div>
  );
};
