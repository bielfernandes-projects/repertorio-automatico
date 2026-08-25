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
  bpm?: number; // Manual. Usado na transição entre músicas do mesmo Bloco (1-400)
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
  transitionNote?: string; // Nota/acorde de passagem para a próxima música do Bloco
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
  // Ponto Eletrônico Visual: qual Bloco/Item a banda está tocando agora.
  // Estado persistido (não efêmero) para que quem entra atrasado ou
  // reconecta leia o ponto direto, sem reconciliação no cliente.
  currentBlockId?: string;
  currentItemId?: string;
  currentPointUpdatedAt?: string;
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

// =====================================================
// Cifra e letra (ADR 0009)
// O app busca, parseia e renderiza nativamente, em vez de
// abrir o Cifra Club num iframe.
// =====================================================

export type CifraSource = 'cifraclub' | 'lrclib';

export interface CifraChord {
  position: number; // índice do caractere em `text` sobre o qual o acorde incide
  chord: string;
}

// Uma linha da música. Separar o acorde do texto (em vez de
// embutir inline no estilo ChordPro) é o que permite reposicionar
// os acordes quando a letra é exibida em fonte gigante.
export interface CifraLine {
  text: string;
  chords: CifraChord[];
}

// Entrada do cache compartilhado, endereçada por slug de Artista/Música
// e comum a todos os Músicos — não é o cache de um usuário.
export interface CifraCache {
  id: string;
  artistSlug: string;
  songSlug: string;
  source: CifraSource;
  originalKey?: string;
  lines: CifraLine[];
  syncedLyrics?: string; // LRC com timestamp por linha, quando a fonte fornece
  durationSeconds?: number;
  sourceUrl?: string; // usado para creditar a fonte na tela
  fetchedAt: string;
}

// Link de leitura anônima (ordem + tons). Distinto do link de
// colaborador, que exige login e gera Membro.
export interface SetlistPublicLink {
  id: string;
  setlistId: string;
  shortId: string;
  createdBy: string;
  createdAt: string;
  revokedAt?: string;
}
