import React, { useState, useRef, useCallback, useEffect } from 'react';
import { StorageEngine } from '../../lib/storage';
import { CatalogSong, SongDocument } from '../../types';
import { useAppStore } from '../../lib/store';
import {
  FileText,
  Upload,
  Trash2,
  Eye,
  Download,
  X,
  FileMusic,
  Image as ImageIcon,
  Plus,
  AlertCircle,
  File,
  ExternalLink
} from 'lucide-react';

interface SongDocumentsModalProps {
  song: CatalogSong | null;
  isOpen: boolean;
  onClose: () => void;
  onSongUpdated?: (updatedSong: CatalogSong) => void;
}

const dataUrlToBlobUrl = (dataUrl: string): string => {
  const [header, base64] = dataUrl.split(',');
  const mime = header.split(':')[1]?.split(';')[0] || 'application/octet-stream';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([array], { type: mime }));
};

export const SongDocumentsModal: React.FC<SongDocumentsModalProps> = ({
  song,
  isOpen,
  onClose,
  onSongUpdated
}) => {
  const { showToast } = useAppStore();
  const [activePreviewDoc, setActivePreviewDoc] = useState<SongDocument | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const openDocExternal = useCallback((doc: SongDocument) => {
    const a = document.createElement('a');
    a.href = doc.dataUrl;
    a.download = doc.name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const closePreview = useCallback(() => {
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
    setActivePreviewDoc(null);
    setPdfError(false);
  }, [pdfBlobUrl]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const openPreview = useCallback((doc: SongDocument) => {
    setPdfError(false);
    if (doc.type === 'pdf') {
      const blobUrl = dataUrlToBlobUrl(doc.dataUrl);
      setPdfBlobUrl(blobUrl);
    }
    setActivePreviewDoc(doc);
  }, []);

  if (!isOpen || !song) return null;

  const documents = song.documents || [];
  const canUploadMore = documents.length < 5;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (documents.length + files.length > 5) {
      showToast(`Você só pode anexar no máximo 5 documentos por música. Restam ${5 - documents.length} vaga(s).`, 'error');
      return;
    }

    setIsUploading(true);

    Array.from(files).forEach((file: File) => {
      // 10MB max limit
      if (file.size > 10 * 1024 * 1024) {
        showToast(`Arquivo "${file.name}" é maior que 10MB.`, 'error');
        setIsUploading(false);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        let type: 'pdf' | 'image' | 'other' = 'other';
        if (file.type.includes('pdf')) type = 'pdf';
        else if (file.type.includes('image')) type = 'image';

        const result = StorageEngine.addSongDocument(song.id, {
          name: file.name,
          type,
          dataUrl,
          fileSize: file.size
        });

        if (result.success && result.song) {
          showToast(`"${file.name}" anexado à música!`, 'success');
          if (onSongUpdated) onSongUpdated(result.song);
        } else {
          showToast(result.message || 'Erro ao salvar documento.', 'error');
        }
        setIsUploading(false);
      };

      reader.onerror = () => {
        showToast('Erro ao ler arquivo.', 'error');
        setIsUploading(false);
      };

      reader.readAsDataURL(file);
    });

    // Reset file input value
    e.target.value = '';
  };

  const handleDeleteDoc = (doc: SongDocument) => {
    const result = StorageEngine.deleteSongDocument(song.id, doc.id);
    if (result.success) {
      showToast(`"${doc.name}" removido.`, 'info');
      if (result.song && onSongUpdated) {
        onSongUpdated(result.song);
      }
      if (activePreviewDoc?.id === doc.id) {
        setActivePreviewDoc(null);
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDocIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-purple-400" />;
      case 'image':
        return <ImageIcon className="w-5 h-5 text-purple-400" />;
      default:
        return <FileMusic className="w-5 h-5 text-purple-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-900 dark:bg-zinc-950 border border-purple-500/30 dark:border-purple-500/30 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-purple-900/40 dark:border-purple-900/40 flex items-center justify-between bg-zinc-950/60 dark:bg-black/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <FileMusic className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-zinc-100 dark:text-zinc-100 truncate">{song.name}</h3>
              <p className="text-xs text-purple-300 dark:text-purple-300/80 truncate">
                {song.artist} • <span className="font-semibold text-purple-400 font-mono">Partituras / Anexos</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Document counter & Upload CTA */}
          <div className="bg-purple-950/30 border border-purple-800/40 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-purple-200 dark:text-purple-200 block">
                Anexos ({documents.length} / 5)
              </span>
              <p className="text-[11px] text-zinc-400">
                Partituras em PDF, fotos de cifras feitas à mão ou arranjos.
              </p>
            </div>

            {canUploadMore ? (
              <label className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl cursor-pointer transition-all shadow-md active:scale-95 shrink-0">
                <Upload className="w-4 h-4 stroke-[2.5]" />
                <span>Anexar</span>
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <span className="text-[10px] font-bold text-amber-400 bg-amber-950/40 border border-amber-800/50 px-2.5 py-1 rounded-xl shrink-0">
                Limite 5/5
              </span>
            )}
          </div>

          {/* List of uploaded documents */}
          {documents.length === 0 ? (
            <div className="border border-dashed border-zinc-800 dark:border-purple-900/40 rounded-2xl p-8 text-center space-y-3 bg-zinc-950/40 dark:bg-zinc-950/40">
              <div className="w-12 h-12 rounded-2xl bg-purple-600/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto">
                <FileMusic className="w-6 h-6" />
              </div>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                Nenhuma partitura ou anexo enviado para esta música. Faça o upload de até 5 arquivos.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-zinc-950/80 border border-purple-900/30 hover:border-purple-500/40 rounded-2xl p-3.5 flex items-center justify-between gap-3 transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-purple-950/60 border border-purple-800/50 rounded-xl shrink-0">
                      {getDocIcon(doc.type)}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-100 dark:text-zinc-100 truncate">{doc.name}</h4>
                      <p className="text-[10px] text-zinc-400">
                        {doc.type.toUpperCase()} • {formatSize(doc.fileSize)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openPreview(doc)}
                      className="p-2 text-purple-300 hover:text-white hover:bg-purple-900/50 rounded-xl transition-colors"
                      title="Visualizar documento"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    <a
                      href={doc.dataUrl}
                      download={doc.name}
                      className="p-2 text-zinc-400 hover:text-purple-300 hover:bg-zinc-800 rounded-xl transition-colors"
                      title="Baixar arquivo"
                    >
                      <Download className="w-4 h-4" />
                    </a>

                    <button
                      onClick={() => handleDeleteDoc(doc)}
                      className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded-xl transition-colors"
                      title="Excluir anexo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-purple-900/40 bg-zinc-950/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-5 py-2 rounded-xl transition-colors shadow-md"
          >
            Concluído
          </button>
        </div>
      </div>

      {/* Lightbox / Fullscreen Preview Modal */}
      {activePreviewDoc && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md p-4 flex flex-col items-center justify-center">
          <div className="w-full max-w-4xl bg-zinc-900 border border-purple-500/30 rounded-2xl overflow-hidden flex flex-col h-[90vh]">
            <div className="px-4 py-3 bg-zinc-950 border-b border-purple-900/40 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-100 truncate">{activePreviewDoc.name}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openDocExternal(activePreviewDoc)}
                  className="text-[10px] text-purple-300 hover:text-white bg-purple-950/60 hover:bg-purple-900/80 border border-purple-700/40 px-2.5 py-1 rounded-lg transition-colors"
                  title="Abrir em navegador externo"
                >
                  <ExternalLink className="w-3.5 h-3.5 inline mr-1" />
                  Externo
                </button>
                <button
                  onClick={closePreview}
                  className="p-1 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div ref={previewRef} className="flex-1 overflow-auto bg-black flex items-center justify-center p-2">
              {activePreviewDoc.type === 'image' ? (
                <img
                  src={activePreviewDoc.dataUrl}
                  alt={activePreviewDoc.name}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              ) : activePreviewDoc.type === 'pdf' ? (
                pdfError ? (
                  <div className="text-center p-8 text-zinc-400 space-y-3">
                    <AlertCircle className="w-12 h-12 mx-auto text-amber-400" />
                    <p className="text-sm text-zinc-300 font-semibold">Visualização não disponível neste dispositivo</p>
                    <p className="text-xs text-zinc-500">Clique em "Externo" ou baixe o PDF para visualizar.</p>
                    <button
                      onClick={() => openDocExternal(activePreviewDoc)}
                      className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Abrir Externamente</span>
                    </button>
                  </div>
                ) : (
                  <iframe
                    src={pdfBlobUrl || activePreviewDoc.dataUrl}
                    title={activePreviewDoc.name}
                    className="w-full h-full rounded-lg bg-white"
                    onError={() => setPdfError(true)}
                  />
                )
              ) : (
                <div className="text-center p-8 text-zinc-400 space-y-3">
                  <File className="w-12 h-12 mx-auto text-purple-400" />
                  <p>Pré-visualização direta não disponível para este formato.</p>
                  <a
                    href={activePreviewDoc.dataUrl}
                    download={activePreviewDoc.name}
                    className="inline-flex items-center gap-2 bg-purple-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar Arquivo</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
