import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../lib/store';
import { StorageEngine } from '../../lib/storage';
import { CatalogSong, SongDocument } from '../../types';
import { Modal } from '../common/Modal';
import { SongDocumentsModal } from '../common/SongDocumentsModal';
import {
  Search,
  Plus,
  Music,
  Edit3,
  Trash2,
  Globe,
  FileMusic,
  X,
  Paperclip,
  Upload,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import { buildCifraClubUrl, parseCifraClubUrl } from '../../lib/utils';
import { isAllowedFileType } from '../../lib/sanitize';

export const CatalogView: React.FC = () => {
  const { showToast, showCascadeWarning, openCifraModal } = useAppStore();
  const [catalog, setCatalog] = useState<CatalogSong[]>(() => StorageEngine.getCatalog());
  const [search, setSearch] = useState('');

  // Documents Modal State
  const [docsModalSong, setDocsModalSong] = useState<CatalogSong | null>(null);

  // Subscribe to storage
  useEffect(() => {
    const unsubscribe = StorageEngine.subscribeStorage(() => {
      setCatalog(StorageEngine.getCatalog());
    });
    return unsubscribe;
  }, []);

  // Modal create
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [artist, setArtist] = useState('');
  const [key, setKey] = useState('');
  const [slug, setSlug] = useState('');
  const [newDocuments, setNewDocuments] = useState<SongDocument[]>([]);

  // Modal edit
  const [editingSong, setEditingSong] = useState<CatalogSong | null>(null);
  const [editName, setEditName] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editKey, setEditKey] = useState('');
  const [editSlug, setEditSlug] = useState('');

  const handleNewDocFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (newDocuments.length + files.length > 5) {
      showToast(`Você só pode anexar no máximo 5 documentos por música. Restam ${5 - newDocuments.length} vaga(s).`, 'error');
      return;
    }

    Array.from(files).forEach((file: File) => {
      if (!isAllowedFileType(file.name, file.type)) {
        showToast(`Tipo de arquivo não permitido: "${file.name}". Use PDF ou imagens (JPG, PNG, GIF, WebP).`, 'error');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast(`Arquivo "${file.name}" é maior que 10MB.`, 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        let type: 'pdf' | 'image' | 'other' = 'other';
        if (file.type.includes('pdf')) type = 'pdf';
        else if (file.type.includes('image')) type = 'image';

        const doc: SongDocument = {
          id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          type,
          dataUrl,
          fileSize: file.size,
          createdAt: new Date().toISOString()
        };

        setNewDocuments((prev) => [...prev, doc]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleRemoveNewDoc = (docId: string) => {
    setNewDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !artist.trim()) {
      showToast('Nome e Artista são obrigatórios.', 'error');
      return;
    }

    const created = StorageEngine.addCatalogSong(name, artist, key || 'C', parseCifraClubUrl(slug), newDocuments);
    setIsCreateOpen(false);
    setName('');
    setArtist('');
    setKey('');
    setSlug('');
    setNewDocuments([]);
    showToast(`Música "${created.name}" adicionada ao catálogo!`, 'success');
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSong || !editName.trim() || !editArtist.trim()) {
      showToast('Nome e Artista são obrigatórios.', 'error');
      return;
    }

    StorageEngine.updateCatalogSong(editingSong.id, {
      name: editName,
      artist: editArtist,
      originalKey: editKey,
      slugOverride: parseCifraClubUrl(editSlug)
    });

    setEditingSong(null);
    showToast(`Música "${editName}" atualizada!`, 'success');
  };

  const handleDeleteRequest = (song: CatalogSong) => {
    const impact = StorageEngine.checkDeleteSongCascade(song.id);

    showCascadeWarning({
      songId: song.id,
      affectedBlocksCount: impact.affectedBlocksCount,
      affectedSetlistsCount: impact.affectedSetlistsCount,
      title: `Excluir "${song.name}" do Catálogo?`,
      description: 'Esta música será removida do seu acervo permanente e de todas as referências em todos os blocos de setlists.',
      onConfirm: () => {
        StorageEngine.deleteCatalogSong(song.id);
        showToast(`Música "${song.name}" excluída.`, 'info');
      }
    });
  };

  const handleOpenCifra = (song: CatalogSong) => {
    const { url } = buildCifraClubUrl(
      song.artist,
      song.name,
      song.originalKey,
      undefined,
      song.slugOverride
    );
    openCifraModal(song.name, song.artist, url, song.originalKey, undefined, song.slugOverride, song.id);
  };

  // Filter Search
  const filteredCatalog = catalog.filter((song) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return song.name.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 pb-24 sm:p-6 sm:pb-24 md:p-8 md:pb-32 space-y-4 animate-in fade-in duration-200">
      {/* Top action row */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-zinc-400 dark:text-purple-300 uppercase tracking-wider flex items-center gap-2">
          <Music className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          Seu Catálogo ({catalog.length})
        </h2>

        <button
          id="create-catalog-song-btn"
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-lg shadow-purple-900/30 active:scale-95 transition-transform"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Nova Música</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-400 dark:text-purple-400/60 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome da música ou artista..."
          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/40 focus:border-purple-600 dark:focus:border-purple-500 rounded-xl pl-9 pr-8 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-purple-300/40 focus:outline-none transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* List of catalog songs */}
      {filteredCatalog.length === 0 ? (
        <div className="bg-white/80 dark:bg-zinc-950/80 border border-zinc-200 dark:border-purple-900/40 rounded-2xl p-8 text-center space-y-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Nenhuma música encontrada no seu catálogo.</p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Música ao Catálogo</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredCatalog.map((song) => {
            const docCount = song.documents?.length || 0;

            return (
              <div
                key={song.id}
                className="bg-white dark:bg-zinc-950 hover:border-purple-400 dark:hover:border-purple-500/60 border border-zinc-200 dark:border-purple-900/40 rounded-2xl p-3.5 transition-all duration-200 flex items-center justify-between gap-3 shadow-sm dark:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{song.name}</h3>
                    {docCount > 0 && (
                      <span className="text-[10px] font-bold text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/60 px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                        <Paperclip className="w-2.5 h-2.5" />
                        {docCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-purple-300/70 truncate">{song.artist}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="font-mono text-xs font-bold text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-zinc-950 border border-purple-200 dark:border-purple-900/60 px-2.5 py-1 rounded-xl shadow-inner"
                    title="Tom Original"
                  >
                    {song.originalKey}
                  </span>

                  {/* Open Partituras / Documents button */}
                  <button
                    onClick={() => setDocsModalSong(song)}
                    className="p-2 text-zinc-600 dark:text-purple-300 hover:text-purple-600 dark:hover:text-white hover:bg-purple-50 dark:hover:bg-purple-950/60 rounded-xl transition-colors relative"
                    title={`Ver Partituras / Anexos (${docCount}/5)`}
                  >
                    <FileMusic className="w-4 h-4" />
                    {docCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[9px] font-extrabold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                        {docCount}
                      </span>
                    )}
                  </button>

                  {/* Open Cifra Club button */}
                  <button
                    onClick={() => handleOpenCifra(song)}
                    className="p-2 text-zinc-600 dark:text-purple-300 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                    title="Abrir Cifra Club"
                  >
                    <Globe className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                  </button>

                  {/* Edit song */}
                  <button
                    onClick={() => {
                      setEditingSong(song);
                      setEditName(song.name);
                      setEditArtist(song.artist);
                      setEditKey(song.originalKey);
                      setEditSlug(song.slugOverride || '');
                    }}
                    className="p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                    title="Editar música"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  {/* Delete song */}
                  <button
                    onClick={() => handleDeleteRequest(song)}
                    className="p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                    title="Excluir música"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Create Song */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setNewDocuments([]);
        }}
        title="Nova Música no Catálogo"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Nome da Música *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Evidências"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-purple-900/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-purple-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Artista / Banda * (Obrigatório para achar cifra)
            </label>
            <input
              type="text"
              required
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="ex: Chitãozinho & Xororó"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-purple-900/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-purple-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Tom Original (Livre texto)
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="ex: E, Am, Sol Maior, Dó"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-purple-900/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-purple-600"
            />
          </div>

          {/* Partituras / Anexos */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileMusic className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Partituras / Anexos (PDF ou Imagem)
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-purple-300/60 font-normal">
                {newDocuments.length}/5 arquivos
              </span>
            </label>

            {/* List of pending attachments */}
            {newDocuments.length > 0 && (
              <div className="space-y-1.5 mb-2.5">
                {newDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-purple-900/40 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      {doc.type === 'pdf' ? (
                        <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                      ) : doc.type === 'image' ? (
                        <ImageIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                      ) : (
                        <FileMusic className="w-4 h-4 text-purple-400 shrink-0" />
                      )}
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">{doc.name}</span>
                      <span className="text-[10px] text-zinc-400 shrink-0 font-mono">
                        ({(doc.fileSize / 1024).toFixed(0)} KB)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveNewDoc(doc.id)}
                      className="p-1 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500 rounded-lg transition-colors shrink-0"
                      title="Remover anexo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload trigger button */}
            {newDocuments.length < 5 && (
              <label className="border-2 border-dashed border-zinc-300 dark:border-purple-900/60 hover:border-purple-500 dark:hover:border-purple-500 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer bg-zinc-50 dark:bg-zinc-950/50 transition-colors text-xs text-zinc-600 dark:text-purple-300 font-medium">
                <Upload className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Anexar partituras (PDF ou Imagem)</span>
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  onChange={handleNewDocFileUpload}
                  className="hidden"
                />
              </label>
            )}
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
              Salvar no Catálogo
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Edit Song */}
      <Modal isOpen={!!editingSong} onClose={() => setEditingSong(null)} title="Editar Música do Catálogo">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Nome da Música *
            </label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-purple-900/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-purple-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Artista / Banda *
            </label>
            <input
              type="text"
              required
              value={editArtist}
              onChange={(e) => setEditArtist(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-purple-900/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-purple-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Tom Original
            </label>
            <input
              type="text"
              value={editKey}
              onChange={(e) => setEditKey(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-purple-900/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-purple-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingSong(null)}
              className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-purple-900/20"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Documents / Partituras */}
      <SongDocumentsModal
        song={docsModalSong}
        isOpen={!!docsModalSong}
        onClose={() => setDocsModalSong(null)}
        onSongUpdated={(updated) => {
          setDocsModalSong(updated);
          setCatalog(StorageEngine.getCatalog());
        }}
      />
    </div>
  );
};
