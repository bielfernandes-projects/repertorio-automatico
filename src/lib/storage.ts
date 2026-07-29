import {
  CatalogSong,
  Setlist,
  Block,
  BlockItem,
  UserProfile,
  Invitation,
  CascadeWarning,
  SongDocument,
  SupabaseConfig
} from '../types';
import { normalizeKeyDisplay } from './utils';

const STORAGE_KEYS = {
  USER: 'repertorio_user',
  CATALOG: 'repertorio_catalog_v2',
  SETLISTS: 'repertorio_setlists_v2',
  INVITATIONS: 'repertorio_invitations_v2',
  THEME: 'repertorio_theme_mode',
  SUPABASE_CONFIG: 'repertorio_supabase_config_v1'
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
  window.dispatchEvent(new Event('repertorio_storage_updated'));
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
    notifySubscribers();
  }

  // Catalog Management
  static getCatalog(): CatalogSong[] {
    const raw = localStorage.getItem(STORAGE_KEYS.CATALOG);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify(SEED_CATALOG));
      return SEED_CATALOG;
    }
    try {
      const items: CatalogSong[] = JSON.parse(raw);
      // Sort alphabetically by name
      return items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } catch {
      return SEED_CATALOG;
    }
  }

  static getCatalogSongById(id: string): CatalogSong | undefined {
    return this.getCatalog().find((s) => s.id === id);
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
    localStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify(catalog));
    notifySubscribers();
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
    localStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify(catalog));
    notifySubscribers();
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
    localStorage.setItem(STORAGE_KEYS.CATALOG, JSON.stringify(catalog));

    // Remove references across all setlists
    const setlists = this.getSetlists();
    const updatedSetlists = setlists.map((st) => ({
      ...st,
      blocks: st.blocks.map((blk) => ({
        ...blk,
        items: blk.items.filter((item) => item.catalogSongId !== id)
      }))
    }));

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(updatedSetlists));
    notifySubscribers();
  }

  static saveSetlists(setlists: Setlist[]) {
    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
  }

  // Setlists Management
  static getSetlists(): Setlist[] {
    const raw = localStorage.getItem(STORAGE_KEYS.SETLISTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(SEED_SETLISTS));
      return SEED_SETLISTS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return SEED_SETLISTS;
    }
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
    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
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
    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
    return copy;
  }

  static updateSetlistName(id: string, name: string): Setlist | null {
    const setlists = this.getSetlists();
    const index = setlists.findIndex((s) => s.id === id);
    if (index === -1) return null;

    setlists[index].name = name.trim();
    setlists[index].updatedAt = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
    return setlists[index];
  }

  static deleteSetlist(id: string) {
    const setlists = this.getSetlists().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
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

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
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

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
    return block;
  }

  static deleteBlock(setlistId: string, blockId: string) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return;

    setlist.blocks = setlist.blocks.filter((b) => b.id !== blockId);
    // Re-index positions
    setlist.blocks.forEach((b, idx) => {
      b.position = idx;
    });
    setlist.updatedAt = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
  }

  static reorderBlocks(setlistId: string, newBlockOrder: Block[]) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return;

    setlist.blocks = newBlockOrder.map((b, idx) => ({ ...b, position: idx }));
    setlist.updatedAt = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
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

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
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

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
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

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
  }

  static removeSongFromBlock(setlistId: string, blockId: string, itemId: string) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return;

    const block = setlist.blocks.find((b) => b.id === blockId);
    if (!block) return;

    block.items = block.items.filter((i) => i.id !== itemId);
    block.items.forEach((item, idx) => {
      item.position = idx;
    });
    setlist.updatedAt = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
  }

  static reorderBlockItems(setlistId: string, blockId: string, newItems: BlockItem[]) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return;

    const block = setlist.blocks.find((b) => b.id === blockId);
    if (!block) return;

    block.items = newItems.map((item, idx) => ({ ...item, position: idx }));
    setlist.updatedAt = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
  }

  // Hydrate Block Items with Catalog data (name, artist, current original key)
  static hydrateBlockItems(items: BlockItem[]): BlockItem[] {
    const catalog = this.getCatalog();
    return items.map((item) => {
      const song = catalog.find((s) => s.id === item.catalogSongId);
      return {
        ...item,
        songName: song ? song.name : 'Música Removida',
        songArtist: song ? song.artist : '',
        songOriginalKey: song ? song.originalKey : ''
      };
    });
  }

  // Join Setlist via Link
  static joinSetlistViaLink(setlistId: string, userEmail: string, role: 'edit' | 'view' = 'edit'): Setlist | null {
    const setlists = this.getSetlists();
    console.log('[Storage] Available setlists count:', setlists.length);
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) {
      console.log('[Storage] Setlist not found in cache. ID:', setlistId);
      return null;
    }

    const email = userEmail.trim().toLowerCase();
    console.log('[Storage] Setlist found. Checking owner:', setlist.ownerEmail, 'vs', email);
    if (setlist.ownerEmail.toLowerCase() === email) {
      return setlist; // User is already the owner
    }

    let mem = setlist.members.find((m) => m.email.toLowerCase() === email);
    console.log('[Storage] Member found:', !!mem);
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

    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    notifySubscribers();
    return setlist;
  }

  // Invitations
  static sendInvitation(setlistId: string, invitedEmail: string, role: 'edit' | 'view'): boolean {
    const user = this.getUser();
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (!setlist) return false;

    const email = invitedEmail.trim().toLowerCase();
    if (email === user.email.toLowerCase()) return false; // Can't invite self

    console.log('[Storage] sendInvitation: Setlist found? ', !!setlist, 'Inviting:', email);
    
    // Check existing member
    let member = setlist.members.find((m) => m.email.toLowerCase() === email);
    if (member) {
      console.log('[Storage] Member found, updating...');
      member.role = role;
      member.status = 'pending';
    } else {
      console.log('[Storage] Member NOT found, adding...');
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

    console.log('[Storage] Final members list before saving:', JSON.stringify(setlist.members));
    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    
    // VERIFICAÇÃO IMEDIATA
    const verify = localStorage.getItem(STORAGE_KEYS.SETLISTS);
    const parsedVerify = JSON.parse(verify || '[]');
    const setlistInStorage = parsedVerify.find((s: any) => s.id === setlistId);
    console.log('[Storage] VERIFICACAO DE PERSISTENCIA APOS SALVAR:', JSON.stringify(setlistInStorage?.members));

    notifySubscribers();

    // Store in invitations pool
    const invRaw = localStorage.getItem(STORAGE_KEYS.INVITATIONS);
    let invs: Invitation[] = invRaw ? JSON.parse(invRaw) : [];

    invs = invs.filter((i) => !(i.setlistId === setlistId && i.invitedEmail.toLowerCase() === email));
    invs.push({
      id: crypto.randomUUID(),
      setlistId,
      setlistName: setlist.name,
      ownerEmail: setlist.ownerEmail,
      invitedEmail: email,
      role,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    localStorage.setItem(STORAGE_KEYS.INVITATIONS, JSON.stringify(invs));
    notifySubscribers();
    return true;
  }

  static getPendingInvitationsForUser(email: string): Invitation[] {
    const invRaw = localStorage.getItem(STORAGE_KEYS.INVITATIONS);
    if (!invRaw) return [];
    try {
      const invs: Invitation[] = JSON.parse(invRaw);
      return invs.filter((i) => i.invitedEmail.toLowerCase() === email.toLowerCase() && i.status === 'pending');
    } catch {
      return [];
    }
  }

  static getSentInvitationsFromUser(email: string): Invitation[] {
    const invRaw = localStorage.getItem(STORAGE_KEYS.INVITATIONS);
    if (!invRaw) return [];
    try {
      const invs: Invitation[] = JSON.parse(invRaw);
      return invs.filter((i) => i.ownerEmail.toLowerCase() === email.toLowerCase());
    } catch {
      return [];
    }
  }

  static respondToInvitation(invitationId: string, accept: boolean) {
    const invRaw = localStorage.getItem(STORAGE_KEYS.INVITATIONS);
    if (!invRaw) return;
    let invs: Invitation[] = JSON.parse(invRaw);

    const inv = invs.find((i) => i.id === invitationId);
    if (!inv) return;

    const newStatus = accept ? 'accepted' : 'refused';
    inv.status = newStatus;

    // Update member record in setlist
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === inv.setlistId);
    if (setlist) {
      const mem = setlist.members.find((m) => m.email.toLowerCase() === inv.invitedEmail.toLowerCase());
      if (mem) {
        mem.status = newStatus;
      }
      localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    }

    localStorage.setItem(STORAGE_KEYS.INVITATIONS, JSON.stringify(invs));
    notifySubscribers();
  }

  static revokeInvitation(setlistId: string, email: string) {
    const setlists = this.getSetlists();
    const setlist = setlists.find((s) => s.id === setlistId);
    if (setlist) {
      setlist.members = setlist.members.filter((m) => m.email.toLowerCase() !== email.toLowerCase());
      localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(setlists));
    }

    const invRaw = localStorage.getItem(STORAGE_KEYS.INVITATIONS);
    if (invRaw) {
      let invs: Invitation[] = JSON.parse(invRaw);
      invs = invs.filter((i) => !(i.setlistId === setlistId && i.invitedEmail.toLowerCase() === email.toLowerCase()));
      localStorage.setItem(STORAGE_KEYS.INVITATIONS, JSON.stringify(invs));
    }

    notifySubscribers();
  }

  static getSupabaseConfig(): SupabaseConfig {
    const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
    const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
    const isConfigured = !!(envUrl.trim() && envKey.trim());
    return {
      url: envUrl.trim(),
      anonKey: envKey.trim(),
      isConnected: isConfigured,
      enabled: isConfigured
    };
  }

  static setSupabaseConfig() {
    // Credentials are strictly managed via environment variables (.env).
  }
}
