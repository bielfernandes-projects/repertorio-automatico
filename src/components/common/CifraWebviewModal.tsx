import React, { useState } from 'react';
import { useAppStore } from '../../lib/store';
import { StorageEngine } from '../../lib/storage';
import { X, ExternalLink, RefreshCw, Edit3, Check, AlertCircle } from 'lucide-react';
import { parseCifraClubUrl } from '../../lib/utils';

export const CifraWebviewModal: React.FC = () => {
  const { cifraModal, closeCifraModal, showToast } = useAppStore();
  const [isEditingSlug, setIsEditingSlug] = useState(false);
  const [customSlug, setCustomSlug] = useState('');
  const [iframeError, setIframeError] = useState(false);

  if (!cifraModal || !cifraModal.isOpen) return null;

  const { songName, artist, url, originalKey, requestedKey, songId, slugOverride } = cifraModal;

  const handleSaveSlug = () => {
    if (songId) {
      const parsedSlug = parseCifraClubUrl(customSlug);
      StorageEngine.updateCatalogSong(songId, { slugOverride: parsedSlug });
      showToast('Link da cifra atualizado no catálogo!', 'success');
      setIsEditingSlug(false);
      closeCifraModal();
    }
  };

  const openExternalBrowser = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 dark:bg-[#090714]/95 backdrop-blur-md animate-in fade-in duration-200">
      {/* Top Controls Bar */}
      <div className="bg-zinc-900 dark:bg-[#120c24] border-b border-purple-900/40 px-4 py-3 flex items-center justify-between gap-3 shadow-md">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-zinc-100 truncate">{songName}</h2>
            {requestedKey && (
              <span className="text-[10px] font-bold text-purple-300 bg-purple-950/60 border border-purple-700/50 px-2 py-0.5 rounded-md">
                Tom: {requestedKey}
              </span>
            )}
          </div>
          <p className="text-xs text-purple-300/80 truncate">{artist} • Cifra Club</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              setCustomSlug(slugOverride || '');
              setIsEditingSlug(!isEditingSlug);
            }}
            className="p-2 text-zinc-300 hover:text-amber-400 hover:bg-zinc-800 rounded-xl transition-colors"
            title="Ajustar slug do link"
          >
            <Edit3 className="w-4 h-4" />
          </button>

          <button
            onClick={openExternalBrowser}
            className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl border border-purple-500/30 transition-colors"
            title="Abrir no navegador do sistema"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Navegador</span>
          </button>

          <button
            onClick={closeCifraModal}
            className="p-2 text-zinc-300 hover:text-white bg-zinc-800 hover:bg-rose-950/80 hover:text-rose-400 rounded-xl transition-colors ml-1"
            aria-label="Fechar cifra"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Adjust Slug Row if triggered */}
      {isEditingSlug && (
        <div className="bg-zinc-900/90 dark:bg-[#120c24]/90 border-b border-purple-900/40 px-4 py-2.5 flex items-center gap-2 animate-in slide-in-from-top duration-200">
          <span className="text-xs text-zinc-400 whitespace-nowrap">Slug da cifra:</span>
          <input
            type="text"
            value={customSlug}
            onChange={(e) => setCustomSlug(e.target.value)}
            placeholder="ex: eduardo-e-monica"
            className="flex-1 bg-zinc-950 border border-purple-800 rounded-lg px-2.5 py-1 text-xs text-zinc-100 focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={handleSaveSlug}
            className="bg-purple-600 text-white font-bold px-3 py-1 rounded-lg text-xs flex items-center gap-1 hover:bg-purple-500"
          >
            <Check className="w-3.5 h-3.5" />
            Salvar
          </button>
        </div>
      )}

      {/* URL Banner */}
      <div className="bg-zinc-950/80 px-4 py-1.5 border-b border-purple-900/30 text-[11px] text-purple-300/80 font-mono truncate flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse shrink-0" />
        <span className="truncate">{url}</span>
      </div>

      {/* Webview iframe Container */}
      <div className="flex-1 relative bg-zinc-950">
        {iframeError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-zinc-200 mb-1">Cifra não pôde ser embutida diretamente</h3>
            <p className="text-xs text-zinc-400 max-w-xs mb-4">
              O site Cifra Club restringe a visualização em iFrames de alguns navegadores mobile.
            </p>
            <button
              onClick={openExternalBrowser}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Abrir Cifra no Navegador Externo</span>
            </button>
          </div>
        ) : (
          <iframe
            src={url}
            title={`Cifra - ${songName}`}
            onError={() => setIframeError(true)}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        )}
      </div>
    </div>
  );
};
