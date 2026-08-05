export type Role = 'owner' | 'edit' | 'view';

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface SongDocument {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'other';
  dataUrl: string; // Base64 or Object URL
  fileSize: number;
  createdAt: string;
}

export interface CatalogSong {
  id: string;
  userId: string;
  name: string;
  artist: string;
  originalKey: string;
  slugOverride?: string;
  documents?: SongDocument[]; // Up to 5 documents (sheet music, partituras, handwritten chords)
  createdAt: string;
  updatedAt: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
  enabled?: boolean;
  lastSyncedAt?: string;
}

export interface BlockItem {
  id: string;
  blockId: string;
  catalogSongId: string;
  requestedKey?: string;
  position: number;
  originalKeyAtAssignment?: string;
  notes?: string; // Observação para a música nesta apresentação
  // Hydrated helper fields
  songName?: string;
  songArtist?: string;
  songOriginalKey?: string;
}

export interface Block {
  id: string;
  setlistId: string;
  name: string;
  theme: string; // Free text, e.g., "Pagode 90 Lado A"
  position: number;
  items: BlockItem[];
}

export interface SetlistMember {
  id: string;
  setlistId: string;
  email: string;
  role: 'edit' | 'view';
  status: InvitationStatus;
  invitedAt: string;
}

export interface Setlist {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerDisplayName?: string; // Display name of the setlist owner, resolved from profiles
  name: string;
  createdAt: string;
  updatedAt: string;
  blocks: Block[];
  members: SetlistMember[];
}

export interface ToastMessage {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  actionLabel?: string;
  onAction?: () => void;
  duration?: number; // ms
}

export interface CascadeWarning {
  songId?: string;
  setlistId?: string;
  blockId?: string;
  affectedBlocksCount: number;
  affectedSetlistsCount: number;
  title: string;
  description: string;
  onConfirm: () => void;
}

export type DeletionEntityType = 'song' | 'setlist' | 'block' | 'block_song';

// Tombstone de exclusão. Elimina a dependência de "delete por ausência":
// um item só é removido do banco/merge se existir um tombstone explícito.
export interface DeletionRecord {
  id: string; // deterministic local key: `deleted_${entityType}_${entityId}`
  entityType: DeletionEntityType;
  entityId: string; // id local da entidade (ex: 'song_01' ou uuid)
  userId: string; // dono da exclusão (quem apagou)
  setlistId?: string; // setlist relacionado (blocos e músicas de bloco)
  createdAt: string;
}
