import { create } from 'zustand';
import { ToastMessage, CascadeWarning } from '../types';

interface AppState {
  // Navigation
  activeTab: 'setlists' | 'catalog' | 'profile';
  setActiveTab: (tab: 'setlists' | 'catalog' | 'profile') => void;

  // Setlist and Block state
  activeSetlistId: string | null;
  setActiveSetlistId: (id: string | null) => void;
  focusedBlockId: string | null;
  setFocusedBlockId: (id: string | null) => void;

  // Search filter
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Offline banner
  isOffline: boolean;
  setIsOffline: (offline: boolean) => void;

  // Toasts
  toasts: ToastMessage[];
  showToast: (message: string, type?: 'success' | 'error' | 'info', actionLabel?: string, onAction?: () => void, duration?: number) => void;
  dismissToast: (id: string) => void;

  // Cascade confirmation modal
  cascadeWarning: CascadeWarning | null;
  showCascadeWarning: (warning: CascadeWarning) => void;
  dismissCascadeWarning: () => void;

  // Cifra Webview Modal
  cifraModal: {
    isOpen: boolean;
    songName: string;
    artist: string;
    url: string;
    originalKey?: string;
    requestedKey?: string;
    slugOverride?: string;
    songId?: string;
  } | null;
  openCifraModal: (songName: string, artist: string, url: string, originalKey?: string, requestedKey?: string, slugOverride?: string, songId?: string) => void;
  closeCifraModal: () => void;

  // Theme mode
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'setlists',
  setActiveTab: (tab) => set({ activeTab: tab, searchQuery: '' }),

  activeSetlistId: null,
  setActiveSetlistId: (id) => set({ activeSetlistId: id, focusedBlockId: null, searchQuery: '' }),

  focusedBlockId: null,
  setFocusedBlockId: (id) => set({ focusedBlockId: id, searchQuery: '' }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  isOffline: !navigator.onLine,
  setIsOffline: (offline) => set({ isOffline: offline }),

  toasts: [],
  showToast: (message, type = 'success', actionLabel, onAction, duration = 3000) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newToast: ToastMessage = { id, message, type, actionLabel, onAction, duration };

    set((state) => ({ toasts: [...state.toasts, newToast] }));

    if (duration > 0) {
      setTimeout(() => {
        get().dismissToast(id);
      }, duration);
    }
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  cascadeWarning: null,
  showCascadeWarning: (warning) => set({ cascadeWarning: warning }),
  dismissCascadeWarning: () => set({ cascadeWarning: null }),

  cifraModal: null,
  openCifraModal: (songName, artist, url, originalKey, requestedKey, slugOverride, songId) =>
    set({
      cifraModal: {
        isOpen: true,
        songName,
        artist,
        url,
        originalKey,
        requestedKey,
        slugOverride,
        songId
      }
    }),
  closeCifraModal: () => set({ cifraModal: null }),

  isDarkMode: (() => {
    const saved = localStorage.getItem('repertorio_dark_mode');
    return saved !== null ? saved === 'true' : true;
  })(),
  toggleDarkMode: () => {
    const nextMode = !get().isDarkMode;
    set({ isDarkMode: nextMode });
    localStorage.setItem('repertorio_dark_mode', String(nextMode));
    if (nextMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}));
