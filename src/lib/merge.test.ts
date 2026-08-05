import { describe, it, expect } from 'vitest';
import { CatalogSong, Setlist, Block, DeletionRecord, DeletionEntityType } from '../types';
import { mergeSongs, mergeSetlists, findTombstonedIds, hasTombstone } from './merge';
import { toUUID } from './ids';

function song(id: string, name: string, updatedAt: string, userId = 'user_1'): CatalogSong {
  return { id, userId, name, artist: 'Artista', originalKey: 'C', createdAt: updatedAt, updatedAt };
}

function tombstone(entityType: DeletionEntityType, entityId: string, userId = 'user_1'): DeletionRecord {
  return {
    id: `deleted_${entityType}_${entityId}`,
    entityType,
    entityId,
    userId,
    createdAt: new Date().toISOString()
  };
}

function block(id: string, items: Setlist['blocks'][0]['items'] = []): Block {
  return { id, setlistId: 'set_1', name: 'Bloco', theme: '', position: 0, items };
}

function setlist(id: string, blocks: Block[], updatedAt: string): Setlist {
  return {
    id,
    ownerId: 'user_1',
    ownerEmail: 'a@b.com',
    name: 'Setlist',
    createdAt: updatedAt,
    updatedAt,
    blocks,
    members: []
  };
}

describe('findTombstonedIds', () => {
  it('retorna apenas ids com tombstone correspondente', () => {
    const t = [tombstone('song', 'song_01')];
    const result = findTombstonedIds('song', ['song_01', 'song_02'], t);
    expect(result).toEqual(['song_01']);
  });

  it('caso o id local seja string e o remoto uuid, ainda encontra', () => {
    const t = [tombstone('song', 'song_01')];
    const result = findTombstonedIds('song', [toUUID('song_01'), toUUID('song_02')], t);
    expect(result).toEqual([toUUID('song_01')]);
  });
});

describe('hasTombstone', () => {
  it('bloco excluído é detectado pelo tombstone', () => {
    const t = [tombstone('block', 'block_9')];
    expect(hasTombstone(t, 'block', 'block_9')).toBe(true);
    expect(hasTombstone(t, 'block', 'block_10')).toBe(false);
  });
});

describe('mergeSongs', () => {
  it('une músicas dos dois lados sem duplicar', () => {
    const local = [song('s1', 'A', '2026-01-01')];
    const remote = [song('s2', 'B', '2026-01-01')];
    const merged = mergeSongs(local, remote, []);
    expect(merged.map((s) => s.id).sort()).toEqual(['s1', 's2']);
  });

  it('mantém a versão mais recente quando o id coincide', () => {
    const local = song('s1', 'A', '2026-01-01');
    const remote = song('s1', 'A v2', '2026-01-02');
    const merged = mergeSongs([local], [remote], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('A v2');
  });

  it('não ressuscita música com tombstone', () => {
    const local = [song('s1', 'A', '2026-01-01')];
    const remote = [song('s1', 'A', '2026-01-01')];
    const t = [tombstone('song', 's1')];
    const merged = mergeSongs(local, remote, t);
    expect(merged).toHaveLength(0);
  });
});

describe('mergeSetlists', () => {
  it('une blocos dos dois lados (nunca descarta lado remoto)', () => {
    const itemLocal = { id: 'i1', blockId: 'b1', catalogSongId: 's1', position: 0, requestedKey: 'C' };
    const itemRemote = { id: 'i2', blockId: 'b1', catalogSongId: 's2', position: 1, requestedKey: 'D' };
    const local = [setlist('set_1', [block('b1', [itemLocal])], '2026-01-01')];
    const remote = [setlist('set_1', [block('b1', [itemRemote])], '2026-01-02')];
    const merged = mergeSetlists(local, remote, []);
    expect(merged).toHaveLength(1);
    const items = merged[0].blocks[0].items;
    expect(items.map((i) => i.catalogSongId).sort()).toEqual(['s1', 's2']);
  });

  it('mantém bloco que existe apenas localmente', () => {
    const local = [setlist('set_1', [block('b1')], '2026-01-01')];
    const remote = [setlist('set_1', [block('b2')], '2026-01-02')];
    const merged = mergeSetlists(local, remote, []);
    expect(merged[0].blocks.map((b) => b.id).sort()).toEqual(['b1', 'b2']);
  });

  it('remove bloco tombstoned mesmo presente nos dois lados', () => {
    const local = [setlist('set_1', [block('b1'), block('b2')], '2026-01-01')];
    const remote = [setlist('set_1', [block('b1'), block('b2')], '2026-01-01')];
    const t = [tombstone('block', 'b2')];
    const merged = mergeSetlists(local, remote, t);
    expect(merged[0].blocks.map((b) => b.id)).toEqual(['b1']);
  });

  it('remove música de bloco tombstoned (chave determinística block_song)', () => {
    const itemA = { id: 'i1', blockId: 'b1', catalogSongId: 's1', position: 0, requestedKey: 'C' };
    const itemB = { id: 'i2', blockId: 'b1', catalogSongId: 's2', position: 1, requestedKey: 'D' };
    const local = [setlist('set_1', [block('b1', [itemA, itemB])], '2026-01-01')];
    const remote = [setlist('set_1', [block('b1', [itemA, itemB])], '2026-01-01')];
    const t = [tombstone('block_song', 'b1_s2')];
    const merged = mergeSetlists(local, remote, t);
    expect(merged[0].blocks[0].items.map((i) => i.catalogSongId)).toEqual(['s1']);
  });

  it('não ressuscita setlist com tombstone', () => {
    const local = [setlist('set_1', [], '2026-01-01')];
    const remote = [setlist('set_1', [], '2026-01-01')];
    const t = [tombstone('setlist', 'set_1')];
    const merged = mergeSetlists(local, remote, t);
    expect(merged).toHaveLength(0);
  });

  it('mescla notas e tons entre os dois lados (preserva valores remotos quando local vazio)', () => {
    const localItem = { id: 'i1', blockId: 'b1', catalogSongId: 's1', position: 0, requestedKey: '' };
    const remoteItem = { id: 'i1', blockId: 'b1', catalogSongId: 's1', position: 0, requestedKey: 'F', notes: 'Começa no violão' };
    const local = [setlist('set_1', [block('b1', [localItem])], '2026-01-01')];
    const remote = [setlist('set_1', [block('b1', [remoteItem])], '2026-01-02')];
    const merged = mergeSetlists(local, remote, []);
    const item = merged[0].blocks[0].items[0];
    expect(item.requestedKey).toBe('F');
    expect(item.notes).toBe('Começa no violão');
  });
});
