import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../lib/store';
import { StorageEngine } from '../../lib/storage';
import { syncLocalDataToSupabase, getSupabaseClient } from '../../lib/supabase';
import { Setlist } from '../../types';
import { Modal } from '../common/Modal';
import {
  Mail,
  Moon,
  Sun,
  Download,
  LogOut,
  ShieldCheck,
  Send,
  Trash2,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Share2,
  Copy,
  Sparkles,
  Users,
  Edit3,
  Check,
  X
} from 'lucide-react';

interface ProfileViewProps {
  onLogout: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onLogout }) => {
  const { isDarkMode, toggleDarkMode, showToast } = useAppStore();
  const user = StorageEngine.getUser();

  // Edit Name state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(user.name);

  useEffect(() => {
    setEditName(user.name);
  }, [user.name]);

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    try {
      StorageEngine.setUser({
        ...user,
        name: editName.trim()
      });

      const client = getSupabaseClient();
      if (client) {
        const { toUUID } = await import('../../lib/supabase');
        const userIdUUID = toUUID(user.id);
        const { error } = await client.from('profiles').upsert([
          { id: userIdUUID, display_name: editName.trim() }
        ], { onConflict: 'id' });
        
        if (error) {
          showToast(`Erro na nuvem: ${error.message}`, 'error');
          return;
        }
      }
      showToast('Nome de exibição atualizado!', 'success');
      setIsEditingName(false);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar nome.', 'error');
    }
  };

  const [userSetlists, setUserSetlists] = useState<Setlist[]>(() =>
    StorageEngine.getSetlistsForUser(user.email).filter((s) => s.ownerEmail === user.email)
  );

  // Modal Share Link state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedSetlistId, setSelectedSetlistId] = useState('');
  const [setlistRoles, setSetlistRoles] = useState<Record<string, 'edit' | 'view'>>({});

  const getRoleForSetlist = (id: string) => setlistRoles[id] || 'edit';

  const handleSetRole = (id: string, role: 'edit' | 'view') => {
    setSetlistRoles((prev) => ({ ...prev, [id]: role }));
  };

  // Change Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // PWA install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const reloadData = () => {
    setUserSetlists(
      StorageEngine.getSetlistsForUser(user.email).filter((s) => s.ownerEmail === user.email)
    );
  };

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    const unsubscribe = StorageEngine.subscribeStorage(() => {
      reloadData();
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      unsubscribe();
    };
  }, [user.email]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      showToast('O app já está instalado ou não é suportado pelo navegador.', 'info');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('Repertório Automático instalado com sucesso!', 'success');
    }
    setDeferredPrompt(null);
  };

  const handleOpenShareModal = (setlistId?: string) => {
    const owned = StorageEngine.getSetlistsForUser(user.email).filter(
      (s) => s.ownerEmail === user.email
    );
    if (owned.length === 0) {
      showToast('Você precisa criar um setlist antes de compartilhar.', 'info');
      return;
    }
    setSelectedSetlistId(setlistId || owned[0].id);
    setIsShareModalOpen(true);
  };

  const handleCopyLink = (stId: string) => {
    const role = getRoleForSetlist(stId);
    const url = `${window.location.origin}${window.location.pathname}?setlist=${stId}&role=${role}`;
    navigator.clipboard.writeText(url);
    showToast(`Link copiado com permissão de ${role === 'edit' ? 'Edição' : 'Visualização'}!`, 'success');
  };

  const handleSendWhatsApp = (st: Setlist) => {
    const role = getRoleForSetlist(st.id);
    const url = `${window.location.origin}${window.location.pathname}?setlist=${st.id}&role=${role}`;
    const permText = role === 'edit' ? '(Modo Edição)' : '(Modo Visualização)';
    const msg = `🎵 Confira o setlist "${st.name}" no Repertório Automático ${permText}:\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      showToast('A nova senha deve ter no mínimo 6 caracteres.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('A confirmação da senha não coincide com a nova senha.', 'error');
      return;
    }

    setIsChangingPassword(true);
    try {
      const client = getSupabaseClient();
      if (client) {
        const { error } = await client.auth.updateUser({ password: newPassword });
        if (error) {
          showToast(`Erro Supabase: ${error.message}`, 'error');
          setIsChangingPassword(false);
          return;
        }
      }

      showToast('Senha alterada com sucesso!', 'success');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao alterar a senha.', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="p-4 pb-24 sm:p-6 sm:pb-24 md:p-8 md:pb-32 space-y-5 animate-in fade-in duration-200">
      {/* Profile Card */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/40 rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-purple-900/30">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            {isEditingName ? (
              <div className="flex items-center gap-1.5 mb-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                  className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/50 rounded-xl px-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-purple-600"
                />
                <button
                  onClick={handleSaveName}
                  className="p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg active:scale-95 transition-transform cursor-pointer"
                  title="Confirmar"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setEditName(user.name);
                    setIsEditingName(false);
                  }}
                  className="p-1.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-lg active:scale-95 transition-transform cursor-pointer"
                  title="Cancelar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mb-1">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{user.name}</h2>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="p-1 text-zinc-400 hover:text-purple-600 rounded-lg transition-colors cursor-pointer"
                  title="Editar nome"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <p className="text-xs text-zinc-500 dark:text-purple-300/80 flex items-center gap-1">
              <Mail className="w-3 h-3 text-purple-500" />
              {user.email}
            </p>
          </div>
        </div>

        {/* Change Password Form */}
        <div className="pt-3 border-t border-zinc-100 dark:border-purple-900/30 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-700 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              Alterar Senha
            </h3>
            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold hover:underline flex items-center gap-1"
            >
              {showPasswords ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showPasswords ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Nova Senha
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    id="new-password"
                    name="new-password"
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/50 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Confirmar Nova Senha
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    id="confirm-password"
                    name="confirm-password"
                    required
                    minLength={6}
                    placeholder="Repita a nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/50 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="submit"
                disabled={isChangingPassword || !newPassword || !confirmPassword}
                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isChangingPassword ? 'Salvando...' : 'Salvar Nova Senha'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Link Sharing Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-500 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            Compartilhar via Link & WhatsApp
          </h3>

          <button
            onClick={() => handleOpenShareModal()}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-md active:scale-95 transition-transform cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Gerar Link</span>
          </button>
        </div>

        {/* List of user setlists with quick share controls */}
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Gere links diretos e envie para os membros da sua banda no WhatsApp. Quem abrir o link entra diretamente no aplicativo.
          </p>

          {userSetlists.length === 0 ? (
            <div className="bg-white/50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-purple-900/40 rounded-2xl p-4 text-center">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Você ainda não tem setlists próprios para compartilhar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {userSetlists.map((st) => (
                <div
                  key={st.id}
                  className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/40 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                >
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{st.name}</h4>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {st.blocks.length} blocos • {st.members.length} acessos de integrantes
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Selection Visualizar vs Editar */}
                    <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/90 p-0.5 rounded-xl border border-zinc-200 dark:border-purple-900/50">
                      <button
                        type="button"
                        onClick={() => handleSetRole(st.id, 'edit')}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                          getRoleForSetlist(st.id) === 'edit'
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                        }`}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetRole(st.id, 'view')}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                          getRoleForSetlist(st.id) === 'view'
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                        }`}
                      >
                        Visualizar
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(st)}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md active:scale-95 transition-all cursor-pointer"
                    >
                      <span>Enviar no WhatsApp</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Share Link */}
      <Modal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title="Compartilhar Setlist por Link"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Selecione o Setlist
            </label>
            <select
              value={selectedSetlistId}
              onChange={(e) => setSelectedSetlistId(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-purple-900/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-purple-600 font-medium"
            >
              {userSetlists.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.blocks.length} blocos)
                </option>
              ))}
            </select>
          </div>

          {selectedSetlistId && (
            <div className="space-y-3 bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-purple-900/40 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold text-xs">
                  <Sparkles className="w-4 h-4" />
                  <span>Nível de Permissão:</span>
                </div>
                <div className="flex items-center bg-zinc-200 dark:bg-zinc-900 p-0.5 rounded-xl border border-zinc-300 dark:border-purple-900/50">
                  <button
                    type="button"
                    onClick={() => handleSetRole(selectedSetlistId, 'edit')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      getRoleForSetlist(selectedSetlistId) === 'edit'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetRole(selectedSetlistId, 'view')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      getRoleForSetlist(selectedSetlistId) === 'view'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    Visualizar
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-purple-900/60 rounded-xl p-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}${window.location.pathname}?setlist=${selectedSetlistId}&role=${getRoleForSetlist(selectedSetlistId)}`}
                  className="flex-1 bg-transparent text-xs text-zinc-800 dark:text-zinc-200 font-mono focus:outline-none truncate"
                />
                <button
                  onClick={() => handleCopyLink(selectedSetlistId)}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </button>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    const st = userSetlists.find((s) => s.id === selectedSetlistId);
                    if (st) handleSendWhatsApp(st);
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <span>Enviar diretamente pelo WhatsApp</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Preferences & PWA Options */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/40 rounded-2xl p-4 space-y-3 shadow-sm">
        <h3 className="text-xs font-bold text-zinc-500 dark:text-purple-300 uppercase tracking-wider">
          Preferências do App
        </h3>

        {/* Dark Mode Toggle */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2.5 text-xs text-zinc-800 dark:text-zinc-200">
            {isDarkMode ? <Moon className="w-4 h-4 text-purple-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
            <span className="font-semibold">Tema Visual (Modo Escuro / Claro)</span>
          </div>

          <button
            onClick={toggleDarkMode}
            className="bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-purple-800/60 px-3 py-1.5 rounded-xl text-xs font-bold text-zinc-800 dark:text-zinc-100 hover:border-purple-600 transition-colors"
          >
            {isDarkMode ? 'Escuro' : 'Claro'}
          </button>
        </div>

        {/* PWA Install */}
        <div className="flex items-center justify-between py-1 border-t border-zinc-100 dark:border-purple-900/30 pt-3">
          <div className="flex items-center gap-2.5 text-xs text-zinc-800 dark:text-zinc-200">
            <Download className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <div>
              <span className="font-semibold block">Instalar PWA no Celular</span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">Adicione à Tela de Início</span>
            </div>
          </div>

          <button
            onClick={handleInstallClick}
            className="bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
          >
            Instalar
          </button>
        </div>
      </div>

      {/* Logout Action */}
      <button
        onClick={async () => {
          try {
            const client = getSupabaseClient();
            if (client) await client.auth.signOut();
          } catch {}
          localStorage.removeItem('repertorio_user');
          onLogout();
        }}
        className="w-full bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800/50 text-rose-600 dark:text-rose-300 font-bold text-xs py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors active:scale-95 shadow-sm"
      >
        <LogOut className="w-4 h-4" />
        <span>Sair da Conta (Logout)</span>
      </button>
    </div>
  );
};
