import React from 'react';
import { useAppStore } from '../../lib/store';
import { CheckCircle2, AlertCircle, Info, Undo2, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto bg-slate-900/95 border border-slate-700/80 shadow-2xl rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs backdrop-blur-md animate-in slide-in-from-top duration-200"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : toast.type === 'info' ? (
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="text-slate-100 font-medium truncate">{toast.message}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {toast.actionLabel && toast.onAction && (
              <button
                onClick={() => {
                  toast.onAction?.();
                  dismissToast(toast.id);
                }}
                className="flex items-center gap-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-bold px-2.5 py-1 rounded-lg border border-emerald-500/30 transition-colors active:scale-95"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>{toast.actionLabel}</span>
              </button>
            )}

            <button
              onClick={() => dismissToast(toast.id)}
              className="p-1 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
