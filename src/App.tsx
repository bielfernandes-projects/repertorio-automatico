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
  const { 
    activeTab, 
    activeSetlistId, 
    focusedBlockId, 
    isDarkMode, 
    setActiveTab, 
    setActiveSetlistId, 
    setFocusedBlockId,
    showToast 
  } = useAppStore();

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
      const shareId = urlParams.get('share');
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

  // Both-way URL sync for tabs, setlists and blocks
  useEffect(() => {
    if (!isAuthenticated) return;

    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as 'setlists' | 'catalog' | 'profile';
    const setlistParam = params.get('setlist');
    const blockParam = params.get('block');

    const isShareLink = params.has('share');

    if (!isShareLink) {
      if (tabParam && ['setlists', 'catalog', 'profile'].includes(tabParam)) {
        setActiveTab(tabParam);
      }
      if (setlistParam) {
        setActiveSetlistId(setlistParam);
      }
      if (blockParam) {
        setTimeout(() => {
          setFocusedBlockId(blockParam);
        }, 50);
      }
    }

    const handlePopState = () => {
      const currentParams = new URLSearchParams(window.location.search);
      const tab = (currentParams.get('tab') as 'setlists' | 'catalog' | 'profile') || 'setlists';
      const setlist = currentParams.get('setlist');
      const block = currentParams.get('block');

      if (useAppStore.getState().activeTab !== tab) setActiveTab(tab);
      if (useAppStore.getState().activeSetlistId !== setlist) setActiveSetlistId(setlist);
      if (useAppStore.getState().focusedBlockId !== block) setFocusedBlockId(block);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAuthenticated, setActiveTab, setActiveSetlistId, setFocusedBlockId]);

  // Update URL when store navigation changes
  useEffect(() => {
    if (!isAuthenticated) return;

    const params = new URLSearchParams(window.location.search);
    if (params.has('share')) return;

    const currentTab = params.get('tab');
    const currentSetlist = params.get('setlist');
    const currentBlock = params.get('block');

    const newParams = new URLSearchParams();
    if (activeTab !== 'setlists') {
      newParams.set('tab', activeTab);
    }
    if (activeSetlistId) {
      newParams.set('setlist', activeSetlistId);
    }
    if (focusedBlockId) {
      newParams.set('block', focusedBlockId);
    }

    const newSearch = newParams.toString();
    const currentSearch = params.toString();

    if (newSearch !== currentSearch) {
      const isSetlistTransition = activeSetlistId !== currentSetlist;
      const isBlockTransition = focusedBlockId !== currentBlock;
      const isTabTransition = activeTab !== (currentTab || 'setlists');

      const url = newSearch ? `?${newSearch}` : window.location.pathname;

      if (isSetlistTransition || isBlockTransition || isTabTransition) {
        window.history.pushState({}, '', url);
      } else {
        window.history.replaceState({}, '', url);
      }
    }
  }, [activeTab, activeSetlistId, focusedBlockId, isAuthenticated]);

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
      if (window.location.search.includes('share')) {
        const cleanUrl = window.location.origin + window.location.pathname + `?setlist=${pendingShareId}`;
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

  // Automatic background Supabase data load on mount with merge strategy
  useEffect(() => {
    async function initAutoCloudSync() {
      try {
        const { getSupabaseConfig, fetchRemoteDataFromSupabase, syncLocalDataToSupabase } = await import('./lib/supabase');
        const cfg = getSupabaseConfig();
        if (!cfg.url || !cfg.anonKey) return;

        const localSongs = StorageEngine.getCatalog();
        const localSetlists = StorageEngine.getSetlists();

        const res = await fetchRemoteDataFromSupabase();
        if (res.success && res.songs && res.setlists) {
          if (res.songs.length > 0 || res.setlists.length > 0) {
            // Merge: for each local item, keep it if it was updated more recently than the remote version
            const mergedSongs = [...res.songs];
            localSongs.forEach((localSong) => {
              const remoteIdx = mergedSongs.findIndex((s) => s.id === localSong.id);
              if (remoteIdx >= 0) {
                if ((localSong.updatedAt || localSong.createdAt) > (mergedSongs[remoteIdx].updatedAt || mergedSongs[remoteIdx].createdAt)) {
                  mergedSongs[remoteIdx] = localSong;
                }
              } else {
                mergedSongs.push(localSong);
              }
            });
            StorageEngine.saveCatalog(mergedSongs);

            const mergedSetlists = [...res.setlists];
            localSetlists.forEach((localSt) => {
              const remoteIdx = mergedSetlists.findIndex((s) => s.id === localSt.id);
              if (remoteIdx >= 0) {
                if ((localSt.updatedAt || localSt.createdAt) > (mergedSetlists[remoteIdx].updatedAt || mergedSetlists[remoteIdx].createdAt)) {
                  mergedSetlists[remoteIdx] = localSt;
                }
              } else {
                mergedSetlists.push(localSt);
              }
            });
            StorageEngine.saveSetlists(mergedSetlists);
          }
          // Push merged/local data to cloud
          await syncLocalDataToSupabase();
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
