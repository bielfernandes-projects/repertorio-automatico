import React from 'react';
import { Shield, X } from 'lucide-react';
import { SetlistMember } from '../../types';

interface MembersManagerProps {
  ownerName: string;
  ownerEmail: string;
  members: SetlistMember[];
  isFetching: boolean;
  canRevoke: boolean;
  onRevoke: (email: string) => void;
}

// Lista de acessos de um setlist (dono + membros que entraram via link).
// Compartilhada entre SetlistDetail e ProfileView para evitar duplicação.
export const MembersManager: React.FC<MembersManagerProps> = ({
  ownerName,
  ownerEmail,
  members,
  isFetching,
  canRevoke,
  onRevoke
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-zinc-500 dark:text-purple-300 uppercase tracking-wider">
          Acessos do Setlist ({members.length + 1})
        </h4>
        {isFetching && (
          <span className="text-[10px] text-purple-400 animate-pulse">Atualizando...</span>
        )}
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {/* Owner */}
        <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/40 rounded-xl p-3 flex items-center justify-between text-xs">
          <div>
            <span className="font-bold text-zinc-900 dark:text-zinc-100 block">{ownerName || ownerEmail}</span>
            <span className="text-[10px] text-purple-600 dark:text-purple-400 flex items-center gap-1 font-semibold">
              <Shield className="w-3 h-3" />
              Dono do Setlist
            </span>
          </div>
        </div>

        {/* Members who joined via link */}
        {members.map((m) => (
          <div key={m.id} className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-purple-900/40 rounded-xl p-3 flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-zinc-900 dark:text-zinc-100 block">{m.email}</span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                Entrou via Link • <strong className="text-emerald-600 dark:text-emerald-400">Acesso Concedido</strong>
              </span>
            </div>

            {canRevoke && (
              <button
                onClick={() => onRevoke(m.email)}
                className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                title="Revogar Acesso"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
