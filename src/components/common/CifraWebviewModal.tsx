import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../lib/store';
import { StorageEngine } from '../../lib/storage';
import { X, ExternalLink, Edit3, Check, AlertCircle, Music } from 'lucide-react';
import { parseCifraClubUrl } from '../../lib/utils';

export const CifraWebviewModal: React.FC = () => {
  const cifraModal = useAppStore((s) => s.cifraModal);
  const closeCifraModal = useAppStore((s) => s.closeCifraModal);
  const showToast = useAppStore((s) => s.showToast);
  const [isEditingSlug, setIsEditingSlug] = useState(false);
  const [customSlug, setCustomSlug] = useState('');
  // Start as null (unknown), will resolve to true/false after iframe attempt
  const [iframeLoaded, setIframeLoaded] = useState<boolean | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cifraModal?.isOpen) return;
    // Reset state each time modal opens
    setIframeLoaded(null);
    setIsEditingSlug(false);

    // Give the iframe 8s to load. If it errors or times out, show fallback.
    loadTimeoutRef.current = setTimeout(() => {
      setIframeLoaded((prev) => {
        // Only trigger fallback if still unknown (never resolved to true)
        if (prev === null) return false;
        return prev;
      });
    }, 8000);

    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, [cifraModal?.isOpen, cifraModal?.url]);

  if (!cifraModal || !cifraModal.isOpen) return null;

  const { songName, artist, url, requestedKey, songId, slugOverride } = cifraModal;

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

  const handleIframeLoad = () => {
    // Clear the timeout — iframe loaded successfully
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    setIframeLoaded(true);
  };

  const handleIframeError = () => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    setIframeLoaded(false);
  };

  // Show fallback when explicitly failed or still loading (null = show fallback optimistically)
  // iframeLoaded === true → show iframe
  // iframeLoaded === false or null → show fallback (null means we show fallback while trying in bg)
  const showFallback = iframeLoaded !== true;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 dark:bg-black/95 backdrop-blur-md animate-in fade-in duration-200">
      {/* Top Controls Bar */}
      <div className="bg-zinc-900 dark:bg-zinc-950 border-b border-purple-900/40 px-4 py-3 flex items-center justify-between gap-3 shadow-md">
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
        <div className="bg-zinc-900/90 dark:bg-zinc-950/90 border-b border-purple-900/40 px-4 py-2.5 flex items-center gap-2 animate-in slide-in-from-top duration-200">
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

      {/* Main Content Area */}
      <div className="flex-1 relative bg-zinc-950">
        {/* Fallback screen — shown by default while iframe tries to load, or after failure */}
        {showFallback && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="max-w-sm w-full space-y-5">
              {/* Icon */}
              <div className="flex items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-purple-950/60 border border-purple-700/40 flex items-center justify-center">
                  <Music className="w-8 h-8 text-purple-400" />
                </div>
              </div>

              {/* Song info */}
              <div>
                <h3 className="text-base font-bold text-zinc-100 mb-1">{songName}</h3>
                <p className="text-sm text-zinc-400">{artist}</p>
                {requestedKey && (
                  <span className="inline-block mt-2 text-xs font-bold text-purple-300 bg-purple-950/60 border border-purple-700/50 px-3 py-1 rounded-full">
                    Tom: {requestedKey}
                  </span>
                )}
              </div>

              {/* Warning about embedding */}
              <div className="bg-amber-950/30 border border-amber-700/30 rounded-xl p-3 flex items-start gap-2.5 text-left">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80">
                  O Cifra Club restringe a visualização incorporada. Abra no navegador para ver a cifra completa.
                </p>
              </div>

              {/* Primary CTA */}
              <button
                onClick={openExternalBrowser}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold px-6 py-3.5 rounded-2xl shadow-lg shadow-purple-900/40 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir no Navegador</span>
              </button>

              {/* Secondary: adjust slug */}
              <button
                onClick={() => {
                  setCustomSlug(slugOverride || '');
                  setIsEditingSlug(true);
                }}
                className="w-full text-xs text-zinc-500 hover:text-purple-400 transition-colors py-1"
              >
                Link errado? Ajustar o slug da cifra
              </button>
            </div>
          </div>
        )}

        {/* iframe — always rendered in background so it can attempt loading */}
        {/* Hidden until it successfully loads (iframeLoaded === true) */}
        <iframe
          ref={iframeRef}
          src={url}
          title={`Cifra - ${songName}`}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          className={`w-full h-full border-0 bg-white transition-opacity duration-300 ${
            iframeLoaded === true ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          sandbox="allow-popups allow-forms allow-storage-access-by-user-activation"
        />
      </div>
    </div>
  );
};
