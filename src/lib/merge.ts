import { CatalogSong, Setlist, Block, BlockItem, SetlistMember, DeletionEntityType, DeletionRecord } from '../types';
import { toUUID } from './ids';

// ============================================================================
// Merge helpers (pure functions)
//
// A estratégia de merge nunca descarta itens remotos que não existem
// localmente (nem vice-versa) — o conjunto resultante é sempre a UNIÃO dos
// dois lados. Itens só são removidos se houver um tombstone explícito.
// ============================================================================

export function hasTombstone(
  deletions: DeletionRecord[],
  entityType: DeletionEntityType,
  entityId: string
): boolean {
  const target = toUUID(entityId);
  return deletions.some((d) => d.entityType === entityType && toUUID(d.entityId) === target);
}

// Retorna os IDs remotos (do banco) que possuem tombstone e devem ser apagados.
export function findTombstonedIds(
  entityType: DeletionEntityType,
  remoteIds: string[],
  deletions: DeletionRecord[]
): string[] {
  return remoteIds.filter((id) => hasTombstone(deletions, entityType, id));
}

// ---- Músicas ----

export function mergeSongs(
  local: CatalogSong[],
  remote: CatalogSong[],
  deletions: DeletionRecord[]
): CatalogSong[] {
  const byId = new Map<string, CatalogSong>();

  const add = (song: CatalogSong) => {
    if (hasTombstone(deletions, 'song', song.id)) return; // nunca ressuscitar
    const key = toUUID(song.id);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, song);
      return;
    }
    const existingTs = existing.updatedAt || existing.createdAt || '';
    const newTs = song.updatedAt || song.createdAt || '';
    if (newTs > existingTs) byId.set(key, song);
  };

  remote.forEach(add);
  local.forEach(add);

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

// ---- Setlists ----

export function mergeSetlists(
  local: Setlist[],
  remote: Setlist[],
  deletions: DeletionRecord[]
): Setlist[] {
  const byId = new Map<string, Setlist>();

  const addSetlist = (st: Setlist) => {
    if (hasTombstone(deletions, 'setlist', st.id)) return;
    const key = toUUID(st.id);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, st);
      return;
    }
    byId.set(key, mergeSetlistPair(existing, st, deletions));
  };

  remote.forEach(addSetlist);
  local.forEach(addSetlist);

  return Array.from(byId.values());
}

function mergeSetlistPair(a: Setlist, b: Setlist, deletions: DeletionRecord[]): Setlist {
  const aUpdated = a.updatedAt || a.createdAt || '';
  const bUpdated = b.updatedAt || b.createdAt || '';
  const base = aUpdated >= bUpdated ? a : b;

  return {
    ...base,
    name: a.name || b.name,
    blocks: mergeBlocks(a.blocks || [], b.blocks || [], deletions),
    members: mergeMembers(a.members || [], b.members || [])
  };
}

// ---- Blocos ----

function mergeBlocks(a: Block[], b: Block[], deletions: DeletionRecord[]): Block[] {
  const byId = new Map<string, Block>();

  const add = (blk: Block) => {
    if (hasTombstone(deletions, 'block', blk.id)) return;
    const key = toUUID(blk.id);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, blk);
      return;
    }
    const merged: Block = {
      ...existing,
      id: existing.id,
      setlistId: existing.setlistId || blk.setlistId,
      name: existing.name || blk.name,
      theme: existing.theme || blk.theme,
      items: mergeBlockItems(existing.items || [], blk.items || [], existing.id, deletions)
    };
    byId.set(key, merged);
  };

  a.forEach(add);
  b.forEach(add);

  const blocks = Array.from(byId.values());
  blocks.forEach((blk, idx) => {
    blk.position = idx;
  });
  return blocks;
}

// ---- Itens do bloco ----

function mergeBlockItems(
  a: BlockItem[],
  b: BlockItem[],
  blockId: string,
  deletions: DeletionRecord[]
): BlockItem[] {
  const bySong = new Map<string, BlockItem>();

  const add = (item: BlockItem) => {
    const canonical: BlockItem = { ...item, blockId };
    const blockSongKey = `${blockId}_${canonical.catalogSongId}`;
    if (hasTombstone(deletions, 'block_song', blockSongKey)) return;

    const key = toUUID(canonical.catalogSongId);
    const existing = bySong.get(key);
    if (!existing) {
      bySong.set(key, canonical);
      return;
    }
    const merged: BlockItem = {
      ...existing,
      ...canonical,
      notes: existing.notes || canonical.notes || undefined,
      requestedKey: existing.requestedKey || canonical.requestedKey || undefined,
      originalKeyAtAssignment: existing.originalKeyAtAssignment || canonical.originalKeyAtAssignment || undefined
    };
    bySong.set(key, merged);
  };

  a.forEach(add);
  b.forEach(add);

  const items = Array.from(bySong.values());
  items.forEach((item, idx) => {
    item.position = idx;
  });
  return items;
}

// ---- Membros ----

function mergeMembers(a: SetlistMember[], b: SetlistMember[]): SetlistMember[] {
  const byEmail = new Map<string, SetlistMember>();
  const roleRank: Record<string, number> = { edit: 2, view: 1 };
  const statusRank: Record<string, number> = { accepted: 2, pending: 1, declined: 0 };

  const add = (m: SetlistMember) => {
    const email = (m.email || '').toLowerCase().trim();
    if (!email) return;
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, m);
      return;
    }
    const existingScore = (statusRank[existing.status] ?? 0) * 10 + (roleRank[existing.role] ?? 0);
    const newScore = (statusRank[m.status] ?? 0) * 10 + (roleRank[m.role] ?? 0);
    if (newScore > existingScore) byEmail.set(email, m);
  };

  a.forEach(add);
  b.forEach(add);

  return Array.from(byEmail.values());
}
