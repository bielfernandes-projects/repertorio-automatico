import React, { useState, useEffect, Component, ReactNode, ErrorInfo } from 'react';
import { useAppStore } from './lib/store';
import { StorageEngine } from './lib/storage';
import { Header } from './components/common/Header';
import { BottomNav } from './components/common/BottomNav';
import { OfflineBanner } from './components/common/OfflineBanner';
import { ToastContainer } from './components/common/Toast';
import { ConfirmModal } from './components/common/ConfirmModal';
import { CifraWebviewModal } from './components/common/CifraWebviewModal';
import { SetlistsList } from './components/setlists/SetlistsList';
import { SetlistDetail } from './components/setlists/SetlistDetail';
import { FocusedBlockView } from './components/setlists/FocusedBlockView';
import { CatalogView } from './components/catalog/CatalogView';
import { ProfileView } from './components/profile/ProfileView';
import { AuthModal } from './components/auth/AuthModal';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Global Error Boundary Component
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare readonly props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }
  public state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-lg font-bold mb-2">Algo deu errado</h1>
          <p className="text-xs text-slate-400 max-w-xs mb-6">
            Ocorreu um erro inesperado na aplicação. Você pode tentar recarregar a página para continuar.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Tentar Novamente</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { activeTab, activeSetlistId, focusedBlockId, isDarkMode, setActiveTab, setActiveSetlistId, showToast } = useAppStore();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!StorageEngine.getUser()?.email;
  });

  // Modal triggers
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState(false);

  // Parse share parameters from URL on load
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const shareId = urlParams.get('setlist') || urlParams.get('share');
      const rawRole = urlParams.get('role');
      const shareRole: 'edit' | 'view' = rawRole === 'view' ? 'view' : 'edit';
      if (shareId) {
        localStorage.setItem('pending_share_setlist', shareId);
        localStorage.setItem('pending_share_role', shareRole);
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, []);

  // Process pending share link after authentication
  useEffect(() => {
    if (!isAuthenticated) return;

    const pendingShareId = localStorage.getItem('pending_share_setlist');
    const rawPendingRole = localStorage.getItem('pending_share_role');
    const pendingShareRole: 'edit' | 'view' = rawPendingRole === 'view' ? 'view' : 'edit';
    if (pendingShareId) {
      const currentUser = StorageEngine.getUser();
      if (currentUser?.email) {
        const joinedSetlist = StorageEngine.joinSetlistViaLink(pendingShareId, currentUser.email, pendingShareRole);
        if (joinedSetlist) {
          setActiveTab('setlists');
          setActiveSetlistId(pendingShareId);
          showToast(`Setlist "${joinedSetlist.name}" aberto via link de compartilhamento (${pendingShareRole === 'edit' ? 'Edição' : 'Visualização'})!`, 'success');
        } else {
          showToast('Setlist compartilhado não foi encontrado.', 'error');
        }
      }
      localStorage.removeItem('pending_share_setlist');
      localStorage.removeItem('pending_share_role');

      // Clean up URL parameters cleanly
      if (window.location.search.includes('setlist') || window.location.search.includes('share')) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
  }, [isAuthenticated, setActiveTab, setActiveSetlistId, showToast]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Automatic background Supabase data load on mount
  useEffect(() => {
    async function initAutoCloudSync() {
      try {
        const { getSupabaseConfig, fetchRemoteDataFromSupabase, syncLocalDataToSupabase } = await import('./lib/supabase');
        const cfg = getSupabaseConfig();
        if (cfg.url && cfg.anonKey) {
          const res = await fetchRemoteDataFromSupabase();
          if (res.success && res.songs && res.setlists && (res.songs.length > 0 || res.setlists.length > 0)) {
            if (res.songs.length > 0) StorageEngine.saveCatalog(res.songs);
            if (res.setlists.length > 0) StorageEngine.saveSetlists(res.setlists);
          } else {
            // First time sync local seed data to cloud
            await syncLocalDataToSupabase();
          }
        }
      } catch (err) {
        console.error('[Cloud Sync Init Error]', err);
      }
    }
    if (isAuthenticated) {
      initAutoCloudSync();
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <>
        <AuthModal onLoginSuccess={() => setIsAuthenticated(true)} />
        <ToastContainer />
      </>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-zinc-200 dark:bg-black text-zinc-900 dark:text-slate-100 font-sans antialiased selection:bg-purple-500 selection:text-white transition-colors duration-200">
        {/* Responsive App Container Frame */}
        <div className="w-full max-w-7xl mx-auto min-h-screen bg-zinc-100 dark:bg-black sm:border-x border-zinc-200 dark:border-zinc-900/80 shadow-2xl relative flex flex-col transition-colors duration-200">
          {/* Top Offline Banner */}
          <OfflineBanner />

          {/* Context Header */}
          <Header
            onOpenInviteModal={() => setIsInviteModalOpen(true)}
            onOpenAddBlockModal={() => setIsAddBlockModalOpen(true)}
          />

          {/* Main Body View Switching */}
          <main className="flex-1 overflow-y-auto">
            {activeTab === 'setlists' && (
              <>
                {activeSetlistId && focusedBlockId ? (
                  <FocusedBlockView setlistId={activeSetlistId} blockId={focusedBlockId} />
                ) : activeSetlistId ? (
                  <SetlistDetail
                    setlistId={activeSetlistId}
                    onOpenInviteModal={() => setIsInviteModalOpen(true)}
                    onOpenAddBlockModal={() => setIsAddBlockModalOpen(true)}
                    isInviteModalOpen={isInviteModalOpen}
                    setIsInviteModalOpen={setIsInviteModalOpen}
                    isAddBlockModalOpen={isAddBlockModalOpen}
                    setIsAddBlockModalOpen={setIsAddBlockModalOpen}
                  />
                ) : (
                  <SetlistsList />
                )}
              </>
            )}

            {activeTab === 'catalog' && <CatalogView />}

            {activeTab === 'profile' && (
              <ProfileView onLogout={() => setIsAuthenticated(false)} />
            )}
          </main>

          {/* Bottom Navigation */}
          <BottomNav />

          {/* Global Toast & Modals */}
          <ToastContainer />
          <ConfirmModal />
          <CifraWebviewModal />
        </div>
      </div>
    </ErrorBoundary>
  );
}
