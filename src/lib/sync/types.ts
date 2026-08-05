import { CatalogSong, DeletionRecord, Setlist } from '../../types';

/**
 * Registros normalizados (payloads mecânicos) que um CloudSyncAdapter sabe ler
 * e escrever. A tomada de decisão (permissões, tombstones, merge) fica fora
 * daqui — vive no planner (plan.ts), tornando as regras testáveis sem rede.
 */

export interface SongWrite {
  id: string; // uuid
  userId: string; // uuid
  name: string;
  artist: string;
  originalKey: string;
  slug: string;
  documents: CatalogSong['documents'];
  includeDocuments: boolean; // false => omitir `documents` (delta-sync)
  soft?: boolean; // erro não aborta o sync (caminho editor)
}

export interface SetlistWrite {
  id: string;
  userId: string;
  name: string;
  updatedAt: string;
}

export interface BlockWrite {
  id: string;
  setlistId: string;
  name: string;
  theme: string;
  position: number;
  soft?: boolean;
}

export interface BlockSongWrite {
  id: string;
  blockId: string;
  songId: string;
  position: number;
  requestedKey: string;
  notes: string | null;
  soft?: boolean;
}

export interface MemberWrite {
  id: string; // toUUID(`${setlistId}_${email}`)
  setlistId: string;
  userId: string; // uuid resolvido via profiles
  role: 'editor' | 'viewer';
  email: string;
}

export interface InviteWrite {
  id: string; // toUUID(`invite_${setlistId}_${email}`)
  setlistId: string;
  inviterId: string;
  inviteeEmail: string;
  status: 'pending';
}

export interface DeletionWrite {
  entityType: string;
  entityId: string;
  deletedBy: string;
  setlistId: string | null;
  createdAt: string;
}

/**
 * Estado remoto mínimo necessário para o planner decidir o que escrever
 * (deletes via tombstone, merges de block_songs, guards de membros).
 */
export interface RemoteSnapshot {
  songs: { id: string; userId: string }[];
  setlists: { id: string; userId: string }[];
  blocks: { id: string; setlistId: string }[];
  blockSongs: { id: string; blockId: string; notes?: string | null; requestedKey?: string | null }[];
  members: { id: string; setlistId: string; userId: string }[];
  invites: { id: string; setlistId: string }[];
  deletions: { id: string; entityType: string; entityId: string; deletedBy: string }[];
}

export interface SyncPlan {
  songs: { writes: SongWrite[]; deleteIds: string[] };
  setlists: { writes: SetlistWrite[]; deleteIds: string[] };
  blocks: { writes: BlockWrite[]; deleteIds: string[] };
  blockSongs: { writes: BlockSongWrite[]; deleteIds: string[] };
  members: { writes: MemberWrite[]; deleteIds: string[] };
  invites: { writes: InviteWrite[]; deleteIds: string[] };
  deletions: { writes: DeletionWrite[]; deleteIds: string[] };
}

export interface SyncPlanInput {
  currentUserId: string; // uuid
  currentEmail: string;
  profileEmailMap: Map<string, string>; // email (lowercase) -> uuid
  savedDocFingerprints: Record<string, string>; // songId local -> fingerprint
  deletions: DeletionRecord[];
  catalog: CatalogSong[];
  setlists: Setlist[];
  remote: RemoteSnapshot;
}
