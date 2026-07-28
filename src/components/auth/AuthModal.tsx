import React, { useState } from 'react';
import { StorageEngine } from '../../lib/storage';
import { useAppStore } from '../../lib/store';
import { getSupabaseClient } from '../../lib/supabase';
import { sanitizeText, isValidEmail } from '../../lib/sanitize';
import { Music, Mail, Lock, User, ArrowRight, Sparkles, Loader2, Eye, EyeOff } from 'lucide-react';

interface AuthModalProps {
  onLoginSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onLoginSuccess }) => {
  const { showToast } = useAppStore();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [isLoading, setIsLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const hasPendingShare = typeof localStorage !== 'undefined' && !!localStorage.getItem('pending_share_setlist');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      showToast('Insira um e-mail válido.', 'error');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      showToast('Serviço de autenticação não disponível. Verifique a configuração do Supabase.', 'error');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(trimmedEmail);
        if (error) {
          showToast(`Erro ao enviar redefinição: ${error.message}`, 'error');
        } else {
          showToast(`Link de redefinição de senha enviado para ${trimmedEmail}!`, 'info');
          setMode('login');
        }
        return;
      }

      if (mode === 'register') {
        if (password.length < 6) {
          showToast('A senha deve ter pelo menos 6 caracteres.', 'error');
          return;
        }
        const displayName = sanitizeText(name.trim() || 'Músico', 'displayName');
        const { data, error } = await client.auth.signUp({
          email: trimmedEmail,
          password,
          options: { data: { name: displayName } }
        });
        if (error) {
          showToast(`Erro ao cadastrar: ${error.message}`, 'error');
          return;
        }
        if (data.user) {
          StorageEngine.setUser({
            id: data.user.id,
            email: data.user.email || trimmedEmail,
            name: displayName
          });
          showToast(`Conta criada com sucesso! Bem-vindo, ${displayName}.`, 'success');
          onLoginSuccess();
        } else {
          showToast('Verifique seu e-mail para confirmar a conta.', 'info');
        }
      } else {
        // Login
        const { data, error } = await client.auth.signInWithPassword({
          email: trimmedEmail,
          password
        });
        if (error) {
          showToast('E-mail ou senha incorretos.', 'error');
          return;
        }
        if (data.user) {
          StorageEngine.setUser({
            id: data.user.id,
            email: data.user.email || trimmedEmail,
            name: data.user.user_metadata?.name || trimmedEmail.split('@')[0]
          });
          showToast(`Login realizado com sucesso!`, 'success');
          onLoginSuccess();
        }
      }
    } catch (err: any) {
      showToast('Erro inesperado ao autenticar. Tente novamente.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
        {/* App Branding Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center mx-auto shadow-lg shadow-purple-500/20 overflow-hidden">
            <img src="/logo.svg" alt="Logo" className="w-9 h-9 object-contain" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-100">Repertório Automático</h1>
          <p className="text-xs text-slate-400">
            {mode === 'login' && 'Faça login para acessar seus setlists e acervo'}
            {mode === 'register' && 'Crie sua conta para começar'}
            {mode === 'reset' && 'Redefinir sua senha via e-mail'}
          </p>
        </div>

        {/* Pending Share Setlist Banner */}
        {hasPendingShare && (
          <div className="bg-purple-950/80 border border-purple-500/50 rounded-2xl p-3.5 text-center space-y-1 shadow-lg">
            <p className="text-xs font-bold text-purple-200 flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
              Você recebeu um convite de Setlist!
            </p>
            <p className="text-[11px] text-purple-300/80">
              {mode === 'register'
                ? 'Crie sua conta abaixo para visualizar e editar o setlist enviado.'
                : 'Faça login para abrir o setlist compartilhado instantaneamente.'}
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Seu Nome *</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome de exibição"
                  maxLength={100}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail *</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com"
                maxLength={254}
                autoComplete="email"
                className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Senha *</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-xl pl-9 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {mode === 'login' && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setMode('reset')}
                className="text-[11px] font-semibold text-purple-400 hover:underline"
              >
                Esqueceu sua senha?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs py-3 rounded-xl shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>
                  {mode === 'login' && 'Entrar no App'}
                  {mode === 'register' && 'Cadastrar Conta'}
                  {mode === 'reset' && 'Enviar E-mail de Redefinição'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Mode Toggle */}
        <div className="pt-3 border-t border-slate-800 text-center text-xs text-slate-400">
          {mode === 'login' ? (
            <p>
              Ainda não tem conta?{' '}
              <button
                onClick={() => setMode('register')}
                className="font-bold text-purple-400 hover:underline"
              >
                Criar uma agora
              </button>
            </p>
          ) : (
            <p>
              Já tem conta?{' '}
              <button
                onClick={() => setMode('login')}
                className="font-bold text-purple-400 hover:underline"
              >
                Fazer Login
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
