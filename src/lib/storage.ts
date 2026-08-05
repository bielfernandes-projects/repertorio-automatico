import {
  CatalogSong,
  Setlist,
  Block,
  BlockItem,
  UserProfile,
  CascadeWarning,
  SongDocument,
  DeletionEntityType,
  DeletionRecord
} from '../types';
import { normalizeKeyDisplay } from './utils';
import { deletionKey } from './ids';
import { RevisionCache } from './revision-cache';

const STORAGE_KEYS = {
  USER: 'repertorio_user',
  CATALOG: 'repertorio_catalog_v2',
  SETLISTS: 'repertorio_setlists_v2',
  SUPABASE_CONFIG: 'repertorio_supabase_config_v1',
  DELETIONS: 'repertorio_deletions_v1',
  DISMISSED_KEY_WARNINGS: 'repertorio_dismissed_key_warnings_v1'
};

// Event listener type for simulated realtime updates
type RealtimeCallback = () => void;
const subscribers = new Set<RealtimeCallback>();

export function subscribeStorage(callback: RealtimeCallback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

let autoSyncTimeout: any = null;

let lastExplicitSync = 0;

export function markExplicitSync() {
  lastExplicitSync = Date.now();
}

function triggerAutoBackgroundSync() {
  if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
  autoSyncTimeout = setTimeout(async () => {
    if (Date.now() - lastExplicitSync < 3000) return;
    try {
      const { getSupabaseConfig, syncLocalDataToSupabase } = await import('./supabase');
      const cfg = getSupabaseConfig();
      if (cfg.url && cfg.anonKey) {
        await syncLocalDataToSupabase();
      }
    } catch (err) {
      console.error('[Background Sync Error]', err);
    }
  }, 1200);
}

function notifySubscribers() {
  subscribers.forEach((cb) => cb());
  triggerAutoBackgroundSync();
}

// Anonymous placeholder user (no hardcoded credentials)
const ANONYMOUS_USER: UserProfile = {
  id: '',
  email: '',
  name: ''
};

// Initial default catalog items
const SEED_CATALOG: CatalogSong[] = [];

// Initial default setlists
const SEED_SETLISTS: Setlist[] = [];

// Caches de leitura: o JSON.parse (e o sort do catálogo, que carrega
// base64 de documentos) roda uma vez por ciclo — os reads seguintes são
// O(1). A revisão alimenta os useMemo dos componentes (FocusedBlockView,
// SetlistDetail) para que o cache seja re-lido após um merge/sync.
const catalogCache = new RevisionCache<CatalogSong[]>(() => {
  const raw = localStorage.getItem(STORAGE_KEYS.CATALOG);
  if (!raw) return SEED_CATALOG;
  try {
    const items: CatalogSong[] = JSON.parse(raw);
    // Sort alphabetically by name
    return items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  } catch (err) {
    console.warn('[Storage] Catálogo corrompido no localStorage; usando lista vazia.', err);
    return SEED_CATALOG;
  }
});

const setlistsCache = new RevisionCache<Setlist[]>(() => {
  const raw = localStorage.getItem(STORAGE_KEYS.SETLISTS);
  if (!raw) return SEED_SETLISTS;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[Storage] Setlists corrompidos no localStorage; usando lista vazia.', err);
    return SEED_SETLISTS;
  }
});

let catalogIndex: Map<string, CatalogSong> | null = null;

export class StorageEngine {
  static subscribeStorage(callback: RealtimeCallback) {
    return subscribeStorage(callback);
  }

  static getUser(): UserProfile {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (!raw) return ANONYMOUS_USER;
    try {
      return JSON.parse(raw);
    } catch {
      return ANONYMOUS_USER;
    }
  }

  static setUser(user: UserProfile) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    notifySubscribers();
  }

  static saveCatalog(catalog: CatalogSong[]) {
    localStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify(catalog));
    catalogCache.invalidate();
    catalogIndex = null;
    notifySubscribers();
  }

  // Tombstones de exclusão (substituem o "delete por ausência")
  static getDeletions(): DeletionRecord[] {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETIONS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  static recordDeletion(entityType: DeletionEntityType, entityId: string, setlistId?: string): DeletionRecord {
    const user = this.getUser();
    const deletions = this.getDeletions();
    const key = deletionKey(entityType, entityId);

    let record = deletions.find((d) => d.id === key);
    if (!record) {
      record = {
        id: key,
        entityType,
        entityId,
        userId: user.id,
        setlistId,
        createdAt: new Date().toISOString()
      };
      deletions.push(record);
    } else {
      record.userId = user.id;
      record.createdAt = new Date().toISOString();
      if (setlistId) record.setlistId = setlistId;
    }

    localStorage.setItem(STORAGE_KEYS.DELETIONS, JSON.stringify(deletions));
    notifySubscribers();
    return record;
  }

  // Remove apenas tombstones do usuário atual (não pode desfazer a
  // exclusão feita por outro usuário, ex: dono do setlist).
  static clearDeletion(entityType: DeletionEntityType, entityId: string) {
    const user = this.getUser();
    const key = deletionKey(entityType, entityId);
    const deletions = this.getDeletions().filter(
      (d) => !(d.id === key && (!d.userId || d.userId === user.id))
    );
    localStorage.setItem(STORAGE_KEYS.DELETIONS, JSON.stringify(deletions));
    notifySubscribers();
  }

  // Merge tombstones vindos do Supabase (exclusões de outros dispositivos).
  // O registro remoto vence, mas tombstones locais ainda não sincronizados
  // não são descartados.
  static mergeRemoteDeletions(remote: DeletionRecord[]) {
    const local = this.getDeletions();
    const merged = [...local];

    remote.forEach((remoteRec) => {
      const idx = merged.findIndex(
        (d) => d.id === remoteRec.id || (d.entityType === remoteRec.entityType && d.entityId === remoteRec.entityId)
      );
      if (idx >= 0) {
        merged[idx] = remoteRec;
      } else {
        merged.push(remoteRec);
      }
    });

    localStorage.setItem(STORAGE_KEYS.DELETIONS, JSON.stringify(merged));
    notifySubscribers();
  }

  // Avisos de "tom original mudou no catálogo" descartados.
  // Mapeia catalogSongId -> tom original vigente no momento do descarte;
  // se o tom mudar de novo, o aviso volta a aparecer.
  static getDismissedKeyWarnings(): Record<string, string> {
    const raw = localStorage.getItem(STORAGE_KEYS.DISMISSED_KEY_WARNINGS);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  static dismissKeyWarning(catalogSongId: string, originalKey: string) {
    const map = this.getDismissedKeyWarnings();
    map[catalogSongId] = originalKey;
    localStorage.setItem(STORAGE_KEYS.DISMISSED_KEY_WARNINGS, JSON.stringify(map));
  }

  // Catalog Management
  static getCatalog(): CatalogSong[] {
    return catalogCache.get();
  }

  static getCatalogRevision(): number {
    return catalogCache.revision;
  }

  static getCatalogSongById(id: string): CatalogSong | undefined {
    return this.getCatalogSongIndex().get(id);
  }

  static addCatalogSong(
    name: string,
    artist: string,
    originalKey: string,
    slugOverride?: string,
    documents?: SongDocument[]
  ): CatalogSong {
    const catalog = this.getCatalog();
    const user = this.getUser();

    const newSong: CatalogSong = {
      id: crypto.randomUUID(),
      userId: user.id,
      name: name.trim(),
      artist: artist.trim(),
      originalKey: normalizeKeyDisplay(originalKey),
      slugOverride: slugOverride ? slugOverride.trim() : undefined,
      documents: documents || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    catalog.push(newSong);
    this.saveCatalog(catalog);
    return newSong;
  }

  static updateCatalogSong(id: string, updates: Partial<Pick<CatalogSong, 'name' | 'artist' | 'originalKey' | 'slugOverride' | 'documents'>>): CatalogSong | null {
    const catalog = this.getCatalog();
    const index = catalog.findIndex((s) => s.id === id);
    if (index === -1) return null;

    const oldSong = catalog[index];
    const updatedSong: CatalogSong = {
      ...oldSong,
      ...updates,
      originalKey: updates.originalKey ? normalizeKeyDisplay(updates.originalKey) : oldSong.originalKey,
      updatedAt: new Date().toISOString()
    };

    catalog[index] = updatedSong;
    this.saveCatalog(catalog);
    return updatedSong;
  }

  // Document attachments (sheet music / partituras / handwritten chords up to 5 per song)
  static addSongDocument(
    songId: string,
    docData: Omit<SongDocument, 'id' | 'createdAt'>
  ): { success: boolean; song?: CatalogSong; message?: string } {
    const song = this.getCatalogSongById(songId);
    if (!song) return { success: false, message: 'Música não encontrada.' };

    const docs = song.documents || [];
    if (docs.length >= 5) {
      return { success: false, message: 'Limite máximo de 5 documentos por música atingido.' };
    }

    const newDoc: SongDocument = {
      id: crypto.randomUUID(),
      name: docData.name,
      type: docData.type,
      dataUrl: docData.dataUrl,
      fileSize: docData.fileSize,
      createdAt: new Date().toISOString()
    };

    const updatedDocs = [...docs, newDoc];
    const updatedSong = this.updateCatalogSong(songId, { documents: updatedDocs });

    return {
      success: true,
      song: updatedSong || undefined,
      message: 'Documento anexado com sucesso!'
    };
  }

  static deleteSongDocument(songId: string, docId: string): { success: boolean; song?: CatalogSong } {
    const song = this.getCatalogSongById(songId);
    if (!song) return { success: false };

    const docs = song.documents || [];
    const updatedDocs = docs.filter((d) => d.id !== docId);
    const updatedSong = this.updateCatalogSong(songId, { documents: updatedDocs });

    return {
      success: true,
      song: updatedSong || undefined
    };
  }

  static checkDeleteSongCascade(songId: string): { affectedBlocksCount: number; affectedSetlistsCount: number } {
    const setlists = this.getSetlists();
    let affectedBlocks = 0;
    const affectedSetlistIds = new Set<string>();

    setlists.forEach((st) => {
      st.blocks.forEach((blk) => {
        const hasSong = blk.items.some((item) => item.catalogSongId === songId);
        if (hasSong) {
          affectedBlocks++;
          affectedSetlistIds.add(st.id);
        }
      });
    });

    return {
      affectedBlocksCount: affectedBlocks,
      affectedSetlistsCount: affectedSetlistIds.size
    };
  }

  static deleteCatalogSong(id: string) {
    const catalog = this.getCatalog().filter((s) => s.id !== id);
    this.saveCatalog(catalog);

    // Remove references across all setlists
    const setlists = this.getSetlists();
    const updatedSetlists = setlists.map((st) => ({
      ...st,
      blocks: st.blocks.map((blk) => ({
        ...blk,
        items: blk.items.filter((item) => item.catalogSongId !== id)
      }))
    }));

    this.saveSetlists(updatedSetlists);

    // Tombstones: a música e todas as referências de bloco removidas
    this.recordDeletion('song', id);
    setlists.forEach((st) => {
      st.blocks.forEach((blk) => {
        const hadReference = blk.items.some((item) => item.catalogSongId === id);
        if (hadReference) {
          this.recordDeletion('block_song', `${blk.id}_${id}`, st.id);
        }
      });
    });
  }

  static saveSetlists(setlists: Setlist[]) {
    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    setlistsCache.invalidate();
    notifySubscribers();
  }

  // Setlists Management
  static getSetlists(): Setlist[] {
    return setlistsCache.get();
  }

  static getSetlistsRevision(): number {
    return setlistsCache.revision;
  }

  static getSetlistsForUser(email: string): Setlist[] {
    const all = this.getSetlists();
    const normalizedEmail = email.toLowerCase();
    return all.filter(
      (s) =>
        s.ownerEmail.toLowerCase() === normalizedEmail ||
        s.members.some((m) => m.email.toLowerCase() === normalizedEmail)
    );
  }

  static getSetlistById(id: string): Setlist | undefined {
    return this.getSetlists().find((s) => s.id === id);
  }

  static createSetlist(name: string): Setlist {
    const setlists = this.getSetlists();
    const user = this.getUser();

    const newSetlist: Setlist = {
      id: crypto.randomUUID(),
      ownerId: user.id,
      ownerEmail: user.email,
      name: name.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      members: [],
      blocks: [
        {
          id: crypto.randomUUID(),
          setlistId: '',
          name: 'Bloco 1',
          theme: 'Geral',
          position: 0,
          items: []
        }
      ]
    };
    newSetlist.blocks[0].setlistId = newSetlist.id;

    setlists.push(newSetlist);
    this.saveSetlists(setlists);
    return newSetlist;
  }

  static duplicateSetlist(id: string, copyName: string): Setlist | null {
    const original = this.getSetlistById(id);
    if (!original) return null;

    const user = this.getUser();
    const setlists = this.getSetlists();

    const newId = crypto.randomUUID();
    const copy: Setlist = {
      ...original,
      id: newId,
      ownerId: user.id,
      ownerEmail: user.email,
      name: copyName.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      members: [], // Reset shared members for duplicate
      blocks: original.blocks.map((blk) => {
        const newBlockId = crypto.randomUUID();
        return {
          ...blk,
          id: newBlockId,
          setlistId: newId,
          items: blk.items.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
            blockId: newBlockId
          }))
        };
      })
    };

    setlists.push(copy);
    this.saveSetlists(setlists);
    return copy;
  }

  static updateSetlistName(id: string, name: string): Setlist | null {
    const setlists = this.getSetlists();
    const index = setlists.findIndex((s) => s.id === id);
    if (index === -1) return null;

    setlists[index].name = name.trim();
    setlists[index].updatedAt = new Date().toISOString();

    this.saveSetlists(setlists);
    return setlists[index];
  }

  static deleteSetlist(id: string) {
    const setlists = this.getSetlists();
    const target = setlists.find((s) => s.id === id);
    const updatedSetlists = setlists.filter((s) => s.id !== id);
    this.saveSetlists(updatedSetlists);

    // Tombstones: setlist + blocos + referências de música em cascata
    this.recordDeletion('setlist', id);
    if (target) {
      target.blocks.forEach((blk) => {
        this.recordDeletion('block', blk.id, id);
        blk.items.forEach((item) => {
          this.recordDeletion('block_song', `${blk.id}_${item.catalogSongId}`, id);
        });
      });
    }
  }

  // Block Management
  static addBlock(setlistId: string, name: string, theme: string): Block | null {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return null;

    const newBlock: Block = {
      id: crypto.randomUUID(),
      setlistId,
      name: name.trim(),
      theme: theme.trim() || 'Geral',
      position: setlist.blocks.length,
      items: []
    };

    setlist.blocks.push(newBlock);
    setlist.updatedAt = new Date().toISOString();

    this.saveSetlists(setlists);
    return newBlock;
  }

  static updateBlock(setlistId: string, blockId: string, name: string, theme: string): Block | null {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return null;

    const block = setlist.blocks.find((b) => b.id === blockId);
    if (!block) return null;

    block.name = name.trim();
    block.theme = theme.trim();
    setlist.updatedAt = new Date().toISOString();

    this.saveSetlists(setlists);
    return block;
  }

  static deleteBlock(setlistId: string, blockId: string) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return;

    const block = setlist.blocks.find((b) => b.id === blockId);
    setlist.blocks = setlist.blocks.filter((b) => b.id !== blockId);
    // Re-index positions
    setlist.blocks.forEach((b, idx) => {
      b.position = idx;
    });
    setlist.updatedAt = new Date().toISOString();

    this.saveSetlists(setlists);

    // Tombstones: bloco + referências de música em cascata
    this.recordDeletion('block', blockId, setlistId);
    if (block) {
      block.items.forEach((item) => {
        this.recordDeletion('block_song', `${blockId}_${item.catalogSongId}`, setlistId);
      });
    }
  }

  static reorderBlocks(setlistId: string, newBlockOrder: Block[]) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return;

    setlist.blocks = newBlockOrder.map((b, idx) => ({ ...b, position: idx }));
    setlist.updatedAt = new Date().toISOString();

    this.saveSetlists(setlists);
  }

  // Block Items (Songs in Block)
  static addSongToBlock(setlistId: string, blockId: string, catalogSongId: string, requestedKey?: string, notes?: string): BlockItem | null {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return null;

    const block = setlist.blocks.find((b) => b.id === blockId);
    if (!block) return null;

    // Check if song is already in block (rule: no duplicates within same block)
    const exists = block.items.some((i) => i.catalogSongId === catalogSongId);
    if (exists) return null;

    const song = this.getCatalogSongById(catalogSongId);
    if (!song) return null;

    const newItem: BlockItem = {
      id: crypto.randomUUID(),
      blockId,
      catalogSongId,
      requestedKey: requestedKey ? normalizeKeyDisplay(requestedKey) : song.originalKey,
      position: block.items.length,
      originalKeyAtAssignment: song.originalKey,
      notes: notes ? notes.trim() : undefined
    };

    block.items.push(newItem);
    setlist.updatedAt = new Date().toISOString();

    this.saveSetlists(setlists);
    // Re-adicionar ao bloco = desfazer exclusão: remove o tombstone
    this.clearDeletion('block_song', `${blockId}_${catalogSongId}`);
    return newItem;
  }

  static updateRequestedKey(setlistId: string, blockId: string, itemId: string, requestedKey: string) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return;

    const block = setlist.blocks.find((b) => b.id === blockId);
    if (!block) return;

    const item = block.items.find((i) => i.id === itemId);
    if (!item) return;

    item.requestedKey = requestedKey ? normalizeKeyDisplay(requestedKey) : '';
    setlist.updatedAt = new Date().toISOString();

    this.saveSetlists(setlists);
  }

  static updateBlockItemNotes(setlistId: string, blockId: string, itemId: string, notes: string) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return;

    const block = setlist.blocks.find((b) => b.id === blockId);
    if (!block) return;

    const item = block.items.find((i) => i.id === itemId);
    if (!item) return;

    item.notes = notes ? notes.trim() : undefined;
    setlist.updatedAt = new Date().toISOString();

    this.saveSetlists(setlists);
  }

  static removeSongFromBlock(setlistId: string, blockId: string, itemId: string) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return;

    const block = setlist.blocks.find((b) => b.id === blockId);
    if (!block) return;

    const removedItem = block.items.find((i) => i.id === itemId);
    block.items = block.items.filter((i) => i.id !== itemId);
    block.items.forEach((item, idx) => {
      item.position = idx;
    });
    setlist.updatedAt = new Date().toISOString();

    this.saveSetlists(setlists);

    // Tombstone da referência removida (chave determinística usada no banco)
    if (removedItem) {
      this.recordDeletion('block_song', `${blockId}_${removedItem.catalogSongId}`, setlistId);
    }
  }

  static reorderBlockItems(setlistId: string, blockId: string, newItems: BlockItem[]) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return;

    const block = setlist.blocks.find((b) => b.id === blockId);
    if (!block) return;

    block.items = newItems.map((item, idx) => ({ ...item, position: idx }));
    setlist.updatedAt = new Date().toISOString();

    this.saveSetlists(setlists);
  }

  // Hydrate Block Items with Catalog data (name, artist, current original key)
  static hydrateBlockItems(items: BlockItem[]): BlockItem[] {
    const index = this.getCatalogSongIndex();
    return items.map((item) => {
      const song = index.get(item.catalogSongId);
      return {
        ...item,
        songName: song ? song.name : 'Música Removida',
        songArtist: song ? song.artist : '',
        songOriginalKey: song ? song.originalKey : ''
      };
    });
  }

  static getCatalogSongIndex(): Map<string, CatalogSong> {
    if (!catalogIndex) {
      catalogIndex = new Map(this.getCatalog().map((s) => [s.id, s]));
    }
    return catalogIndex;
  }

  // Join Setlist via Link
  static joinSetlistViaLink(setlistId: string, userEmail: string, role: 'edit' | 'view' = 'edit'): Setlist | null {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) {
      return null;
    }

    const email = userEmail.trim().toLowerCase();
    if (setlist.ownerEmail.toLowerCase() === email) {
      return setlist; // User is already the owner
    }

    const mem = setlist.members.find((m) => m.email.toLowerCase() === email);
    if (mem) {
      mem.status = 'accepted';
    } else {
      setlist.members.push({
        id: crypto.randomUUID(),
        setlistId,
        email,
        role,
        status: 'accepted',
        invitedAt: new Date().toISOString()
      });
    }

    this.saveSetlists(setlists);
    return setlist;
  }

  // Invitations
  static sendInvitation(setlistId: string, invitedEmail: string, role: 'edit' | 'view'): boolean {
    const user = this.getUser();
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) {
      return false;
    }

    const email = invitedEmail.trim().toLowerCase();
    if (email === user.email.toLowerCase()) {
      return false;
    }
    
    // Check existing member
    let member = setlist.members.find((m) => m.email.toLowerCase() === email);
    if (member) {
      member.role = role;
      member.status = 'pending';
    } else {
      member = {
        id: crypto.randomUUID(),
        setlistId,
        email,
        role,
        status: 'pending',
        invitedAt: new Date().toISOString()
      };
      setlist.members.push(member);
    }

    this.saveSetlists(setlists);
    return true;
  }

  static revokeInvitation(setlistId: string, email: string) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (setlist) {
      setlist.members = setlist.members.filter((m) => m.email.toLowerCase() !== email.toLowerCase());
      this.saveSetlists(setlists);
    }
  }
}
