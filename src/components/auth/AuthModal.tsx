import React, { useState } from 'react';
import { StorageEngine, DEFAULT_USER } from '../../lib/storage';
import { useAppStore } from '../../lib/store';
import { Music, Mail, Lock, User, ArrowRight, Sparkles } from 'lucide-react';

interface AuthModalProps {
  onLoginSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onLoginSuccess }) => {
  const { showToast } = useAppStore();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');

  const [email, setEmail] = useState(DEFAULT_USER.email);
  const [password, setPassword] = useState('123456');
  const [name, setName] = useState('Gabriel Fernandes');

  const hasPendingShare = typeof localStorage !== 'undefined' && !!localStorage.getItem('pending_share_setlist');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'reset') {
      showToast(`Link de redefinição de senha enviado para ${email}! Check sua caixa de entrada.`, 'info');
      setMode('login');
      return;
    }

    if (mode === 'register') {
      const newUser = {
        id: `usr_${Date.now()}`,
        email: email.trim().toLowerCase(),
        name: name.trim() || 'Músico'
      };
      StorageEngine.setUser(newUser);
      showToast(`Conta criada com sucesso! Bem-vindo, ${newUser.name}.`, 'success');
    } else {
      // Login
      const user = {
        id: `usr_${Date.now()}`,
        email: email.trim().toLowerCase(),
        name: name.trim() || email.split('@')[0]
      };
      StorageEngine.setUser(user);
      showToast(`Login realizado como ${user.email}`, 'success');
    }

    onLoginSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
        {/* App Branding Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 mx-auto shadow-lg shadow-emerald-500/20">
            <Music className="w-8 h-8 stroke-[2.5]" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-100">Repertório Automático</h1>
          <p className="text-xs text-slate-400">
            {mode === 'login' && 'Faça login para acessar seus setlists e acervo'}
            {mode === 'register' && 'Crie sua conta PWA gratuita'}
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
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
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
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Senha *</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {mode === 'login' && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setMode('reset')}
                className="text-[11px] font-semibold text-emerald-400 hover:underline"
              >
                Esqueceu sua senha?
              </button>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs py-3 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <span>
              {mode === 'login' && 'Entrar no App'}
              {mode === 'register' && 'Cadastrar Conta'}
              {mode === 'reset' && 'Enviar E-mail de Redefinição'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Footer Mode Toggle */}
        <div className="pt-3 border-t border-slate-800 text-center text-xs text-slate-400">
          {mode === 'login' ? (
            <p>
              Ainda não tem conta?{' '}
              <button
                onClick={() => setMode('register')}
                className="font-bold text-emerald-400 hover:underline"
              >
                Criar uma agora
              </button>
            </p>
          ) : (
            <p>
              Já tem conta?{' '}
              <button
                onClick={() => setMode('login')}
                className="font-bold text-emerald-400 hover:underline"
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
