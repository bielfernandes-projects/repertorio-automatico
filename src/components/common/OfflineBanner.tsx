import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../lib/store';
import { WifiOff, X } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const { isOffline, setIsOffline } = useAppStore();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setDismissed(false);
    };
    const handleOffline = () => {
      setIsOffline(true);
      setDismissed(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setIsOffline]);

  if (!isOffline || dismissed) return null;

  return (
    <div
      id="offline-banner"
      className="bg-amber-500/90 text-slate-950 font-semibold px-4 py-2 text-xs flex items-center justify-between gap-2 shadow-md animate-in slide-in-from-top duration-300"
    >
      <div className="flex items-center gap-2 min-w-0">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span className="truncate">Você está offline — exibindo dados em cache (somente leitura)</span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 hover:bg-amber-600/30 rounded-lg transition-colors shrink-0"
        title="Fechar aviso"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
