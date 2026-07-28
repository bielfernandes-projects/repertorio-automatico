import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 p-0 sm:p-4">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Bottom Sheet Card */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#120c24] border-t sm:border border-zinc-200 dark:border-purple-900/40 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl z-10 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        {/* Handle pill for mobile touch feel */}
        <div className="w-12 h-1.5 bg-zinc-300 dark:bg-purple-900/60 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-100 dark:border-purple-900/30">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors active:scale-95"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div>{children}</div>
      </div>
    </div>
  );
};
