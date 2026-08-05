import React from 'react';
import { useAppStore } from '../../lib/store';
import { AlertTriangle, Trash2 } from 'lucide-react';

export const ConfirmModal: React.FC = () => {
  const cascadeWarning = useAppStore((s) => s.cascadeWarning);
  const dismissCascadeWarning = useAppStore((s) => s.dismissCascadeWarning);

  if (!cascadeWarning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/40 rounded-3xl p-5 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mb-3">
          <AlertTriangle className="w-5 h-5" />
        </div>

        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">{cascadeWarning.title}</h3>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">{cascadeWarning.description}</p>

        {(cascadeWarning.affectedBlocksCount > 0 || cascadeWarning.affectedSetlistsCount > 0) && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl p-3 mb-4 text-xs text-rose-600 dark:text-rose-300">
            <span className="font-semibold block mb-0.5">Impacto da exclusão:</span>
            Ação afeta{' '}
            <strong className="text-rose-700 dark:text-rose-200 font-bold">{cascadeWarning.affectedBlocksCount} bloco(s)</strong> em{' '}
            <strong className="text-rose-700 dark:text-rose-200 font-bold">{cascadeWarning.affectedSetlistsCount} setlist(s)</strong>.
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-purple-900/30">
          <button
            onClick={dismissCascadeWarning}
            className="px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              cascadeWarning.onConfirm();
              dismissCascadeWarning();
            }}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shadow-md shadow-rose-600/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Confirmar e Excluir</span>
          </button>
        </div>
      </div>
    </div>
  );
};
