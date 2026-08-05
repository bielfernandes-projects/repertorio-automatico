import { describe, expect, it } from 'vitest';
import { toUUID, songDocsFingerprint } from '../ids';
import { CatalogSong, DeletionRecord, Setlist, SongDocument } from '../../types';
import { buildSyncPlan } from './plan';
import { InMemoryAdapter } from './in-memory-adapter';
import { RemoteSnapshot, SyncPlanInput } from './types';

const OWNER_EMAIL = 'dono@x.com';
const OWNER_UUID = toUUID('user_owner');
const EDITOR_UUID = toUUID('user_editor');
const VIEWER_UUID = toUUID('user_viewer');
const STRANGER_UUID = toUUID('user_stranger');

function makeSong(id: string, userId: string, docs?: SongDocument[]): CatalogSong {
  return {
    id,
    userId,
    name: `Música ${id}`,
    artist: 'Artista',
    originalKey: 'C',
    documents: docs,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  };
}

function makeSetlist(id: string, members: Setlist['members'] = [], blocks: Setlist['blocks'] = []): Setlist {
  return {
    id,
    ownerId: OWNER_UUID,
    ownerEmail: OWNER_EMAIL,
    name: `Setlist ${id}`,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    blocks,
    members
  };
}

function makeBlock(id: string, items: Setlist['blocks'][number]['items'] = []) {
  return { id, setlistId: id.replace('block', 'setlist'), name: `Bloco ${id}`, theme: '', position: 0, items };
}

function makeInput(overrides: Partial<SyncPlanInput>): SyncPlanInput {
  return {
    currentUserId: EDITOR_UUID,
    currentEmail: 'editor@x.com',
    profileEmailMap: new Map([
      [OWNER_EMAIL, OWNER_UUID],
      ['editor@x.com', EDITOR_UUID],
      ['view@x.com', VIEWER_UUID]
    ]),
    savedDocFingerprints: {},
    deletions: [],
    catalog: [],
    setlists: [],
    remote: {
      songs: [],
      setlists: [],
      blocks: [],
      blockSongs: [],
      members: [],
      invites: [],
      deletions: []
    },
    ...overrides
  };
}

const doc = {
  id: 'doc_1',
  name: 'partitura.pdf',
  type: 'pdf' as const,
  dataUrl: 'data:application/pdf;base64,AAAA',
  fileSize: 123,
  createdAt: '2026-01-01T00:00:00Z'
};

function countWrites(plan: ReturnType<typeof buildSyncPlan>): number {
  return (
    plan.songs.writes.length +
    plan.setlists.writes.length +
    plan.blocks.writes.length +
    plan.blockSongs.writes.length +
    plan.members.writes.length +
    plan.invites.writes.length +
    plan.deletions.writes.length
  );
}

describe('buildSyncPlan — permissões (bug class do link-share)', () => {
  it('viewer member não escreve NADA do setlist compartilhado', () => {
    const setlist = makeSetlist('setlist_1', [{ id: 'm1', setlistId: 'setlist_1', email: 'view@x.com', role: 'view', status: 'accepted', invitedAt: '' }]);
    const plan = buildSyncPlan(
      makeInput({
        currentUserId: VIEWER_UUID,
        currentEmail: 'view@x.com',
        catalog: [makeSong('song_1', VIEWER_UUID)],
        setlists: [setlist]
      })
    );

    expect(plan.setlists.writes).toHaveLength(0);
    expect(plan.blocks.writes).toHaveLength(0);
    expect(plan.blockSongs.writes).toHaveLength(0);
    expect(plan.members.writes).toHaveLength(0);
    expect(plan.invites.writes).toHaveLength(0);
    expect(plan.setlists.deleteIds).toHaveLength(0);
    expect(plan.blocks.deleteIds).toHaveLength(0);
  });

  it('não-membro (vazamento de link-share) não escreve NADA nem vira membro', () => {
    const setlist = makeSetlist('setlist_1'); // sem membership nenhum
    const plan = buildSyncPlan(
      makeInput({
        currentUserId: STRANGER_UUID,
        currentEmail: 'stranger@x.com',
        catalog: [makeSong('song_1', STRANGER_UUID)],
        setlists: [setlist],
        remote: {
          songs: [],
          setlists: [{ id: toUUID('setlist_1'), userId: OWNER_UUID }],
          blocks: [{ id: toUUID('block_1'), setlistId: toUUID('setlist_1') }],
          blockSongs: [],
          members: [],
          invites: [{ id: toUUID('link_share_setlist_1'), setlistId: toUUID('setlist_1') }],
          deletions: []
        }
      })
    );

    expect(plan.setlists.writes).toHaveLength(0);
    expect(plan.blocks.writes).toHaveLength(0);
    expect(plan.blockSongs.writes).toHaveLength(0);
    expect(plan.members.writes).toHaveLength(0);
    expect(plan.invites.writes).toHaveLength(0);
    expect(countWrites(plan)).toBe(1); // apenas a música própria do estranho
  });

  it('editor escreve apenas blocos/músicas-de-bloco — nunca o setlist nem membros', () => {
    const item = {
      id: 'item_1',
      blockId: 'block_1',
      catalogSongId: 'song_1',
      position: 0,
      songName: 'Música song_1',
      songArtist: 'Artista',
      songOriginalKey: 'C'
    };
    const setlist = makeSetlist('setlist_1', [
      { id: 'm1', setlistId: 'setlist_1', email: 'editor@x.com', role: 'edit', status: 'accepted', invitedAt: '' }
    ], [makeBlock('block_1', [item])]);

    const plan = buildSyncPlan(
      makeInput({
        currentUserId: EDITOR_UUID,
        currentEmail: 'editor@x.com',
        catalog: [makeSong('song_1', EDITOR_UUID)],
        setlists: [setlist]
      })
    );

    expect(plan.setlists.writes).toHaveLength(0);
    expect(plan.members.writes).toHaveLength(0);
    expect(plan.invites.writes).toHaveLength(0);
    expect(plan.blocks.writes.map((w) => w.id)).toEqual([toUUID('block_1')]);
    expect(plan.blockSongs.writes.map((w) => w.id)).toEqual([toUUID('block_1_song_1')]);
    expect(plan.blocks.writes[0].soft).toBe(true);
  });

  it('editor NÃO sobe música de catálogo de outro usuário', () => {
    const item = {
      id: 'item_1',
      blockId: 'block_1',
      catalogSongId: 'song_alheia',
      position: 0,
      songName: 'Música alheia',
      songArtist: 'Artista',
      songOriginalKey: 'D'
    };
    const setlist = makeSetlist('setlist_1', [
      { id: 'm1', setlistId: 'setlist_1', email: 'editor@x.com', role: 'edit', status: 'accepted', invitedAt: '' }
    ], [makeBlock('block_1', [item])]);

    const plan = buildSyncPlan(
      makeInput({
        currentUserId: EDITOR_UUID,
        currentEmail: 'editor@x.com',
        catalog: [], // música não pertence ao editor
        setlists: [setlist]
      })
    );

    const songWritesForAlheia = plan.songs.writes.filter((w) => w.id === toUUID('song_alheia'));
    expect(songWritesForAlheia).toHaveLength(0);
  });

  it('dono sincroniza tudo (setlist, blocos, block_songs, membros)', () => {
    const item = {
      id: 'item_1',
      blockId: 'block_1',
      catalogSongId: 'song_1',
      position: 0,
      requestedKey: 'G'
    };
    const setlist = makeSetlist('setlist_1', [
      { id: 'm1', setlistId: 'setlist_1', email: 'editor@x.com', role: 'edit', status: 'accepted', invitedAt: '' }
    ], [makeBlock('block_1', [item])]);

    const plan = buildSyncPlan(
      makeInput({
        currentUserId: OWNER_UUID,
        currentEmail: OWNER_EMAIL,
        catalog: [makeSong('song_1', OWNER_UUID)],
        setlists: [setlist]
      })
    );

    expect(plan.setlists.writes.map((w) => w.id)).toEqual([toUUID('setlist_1')]);
    expect(plan.blocks.writes.map((w) => w.id)).toEqual([toUUID('block_1')]);
    expect(plan.blockSongs.writes.map((w) => w.id)).toEqual([toUUID('block_1_song_1')]);
    expect(plan.members.writes.map((w) => w.userId)).toContain(EDITOR_UUID);
  });
});

describe('buildSyncPlan — tombstones (ordenação delete > upsert)', () => {
  it('setlist tombstoned nunca é ressuscitado e entra na lista de deletes', () => {
    const tombstone: DeletionRecord = {
      id: 'deleted_setlist_setlist_1',
      entityType: 'setlist',
      entityId: 'setlist_1',
      userId: OWNER_UUID,
      createdAt: '2026-01-01T00:00:00Z'
    };
    const setlist = makeSetlist('setlist_1', [], [makeBlock('block_1', [])]);

    const plan = buildSyncPlan(
      makeInput({
        currentUserId: OWNER_UUID,
        currentEmail: OWNER_EMAIL,
        deletions: [tombstone],
        catalog: [],
        setlists: [setlist],
        remote: {
          songs: [],
          setlists: [{ id: toUUID('setlist_1'), userId: OWNER_UUID }],
          blocks: [{ id: toUUID('block_1'), setlistId: toUUID('setlist_1') }],
          blockSongs: [],
          members: [],
          invites: [],
          deletions: []
        }
      })
    );

    expect(plan.setlists.writes).toHaveLength(0);
    expect(plan.blocks.writes).toHaveLength(0);
    expect(plan.setlists.deleteIds).toContain(toUUID('setlist_1'));
  });

  it('bloco tombstoned não ressuscita e seus block_songs não sobem', () => {
    const tombstone: DeletionRecord = {
      id: 'deleted_block_block_1',
      entityType: 'block',
      entityId: 'block_1',
      userId: OWNER_UUID,
      setlistId: 'setlist_1',
      createdAt: '2026-01-01T00:00:00Z'
    };
    const item = { id: 'item_1', blockId: 'block_1', catalogSongId: 'song_1', position: 0 };
    const setlist = makeSetlist('setlist_1', [], [makeBlock('block_1', [item])]);

    const plan = buildSyncPlan(
      makeInput({
        currentUserId: OWNER_UUID,
        currentEmail: OWNER_EMAIL,
        deletions: [tombstone],
        catalog: [makeSong('song_1', OWNER_UUID)],
        setlists: [setlist],
        remote: {
          songs: [],
          setlists: [{ id: toUUID('setlist_1'), userId: OWNER_UUID }],
          blocks: [{ id: toUUID('block_1'), setlistId: toUUID('setlist_1') }],
          blockSongs: [{ id: toUUID('block_1_song_1'), blockId: toUUID('block_1'), notes: 'x', requestedKey: 'G' }],
          members: [],
          invites: [],
          deletions: []
        }
      })
    );

    expect(plan.blocks.writes).toHaveLength(0);
    expect(plan.blockSongs.writes).toHaveLength(0);
    expect(plan.blocks.deleteIds).toContain(toUUID('block_1'));
  });

  it('tombstone local é espelhado como write de deletions', () => {
    const tombstone: DeletionRecord = {
      id: 'deleted_song_song_1',
      entityType: 'song',
      entityId: 'song_1',
      userId: OWNER_UUID,
      createdAt: '2026-01-01T00:00:00Z'
    };

    const plan = buildSyncPlan(
      makeInput({
        currentUserId: OWNER_UUID,
        currentEmail: OWNER_EMAIL,
        deletions: [tombstone],
        catalog: [makeSong('song_1', OWNER_UUID)],
        setlists: []
      })
    );

    expect(plan.deletions.writes.map((w) => w.entityId)).toContain('song_1');
    expect(plan.songs.writes.map((w) => w.id)).not.toContain(toUUID('song_1'));
  });
});

describe('buildSyncPlan — delta-sync de documentos', () => {
  it('omite documents quando o fingerprint não mudou; sobe quando mudou', () => {
    const songComDocs = makeSong('song_1', OWNER_UUID, [doc]);
    const plan = buildSyncPlan(
      makeInput({
        currentUserId: OWNER_UUID,
        currentEmail: OWNER_EMAIL,
        catalog: [songComDocs, makeSong('song_2', OWNER_UUID, [doc])],
        savedDocFingerprints: { song_1: songDocsFingerprint(songComDocs) },
        setlists: []
      })
    );

    const w1 = plan.songs.writes.find((w) => w.id === toUUID('song_1'))!;
    const w2 = plan.songs.writes.find((w) => w.id === toUUID('song_2'))!;
    expect(w1.includeDocuments).toBe(false);
    expect(w2.includeDocuments).toBe(true);
  });

  it('executa contra InMemoryAdapter preservando os docs da nuvem quando omitidos', () => {
    const songComDocs = makeSong('song_1', OWNER_UUID, [doc]);
    const plan = buildSyncPlan(
      makeInput({
        currentUserId: OWNER_UUID,
        currentEmail: OWNER_EMAIL,
        catalog: [songComDocs],
        savedDocFingerprints: { song_1: songDocsFingerprint(songComDocs) },
        setlists: []
      })
    );

    const remote: RemoteSnapshot = {
      songs: [{ id: toUUID('song_1'), userId: OWNER_UUID }],
      setlists: [],
      blocks: [],
      blockSongs: [],
      members: [],
      invites: [],
      deletions: []
    };
    const adapter = new InMemoryAdapter(OWNER_UUID, remote);
    adapter.getSong(toUUID('song_1')).documents = ['docs-preexistentes-na-nuvem'];
    adapter.executePlan(plan);

    expect(adapter.getSong(toUUID('song_1')).documents).toEqual(['docs-preexistentes-na-nuvem']);
  });
});

describe('buildSyncPlan — guards', () => {
  it('nunca apaga membros quando a lista local está vazia', () => {
    const setlist = makeSetlist('setlist_1', []); // lista local vazia
    const plan = buildSyncPlan(
      makeInput({
        currentUserId: OWNER_UUID,
        currentEmail: OWNER_EMAIL,
        catalog: [],
        setlists: [setlist],
        remote: {
          songs: [],
          setlists: [{ id: toUUID('setlist_1'), userId: OWNER_UUID }],
          blocks: [],
          blockSongs: [],
          members: [
            { id: toUUID('setlist_1_editor@x.com'), setlistId: toUUID('setlist_1'), userId: EDITOR_UUID },
            { id: toUUID('setlist_1_view@x.com'), setlistId: toUUID('setlist_1'), userId: VIEWER_UUID }
          ],
          invites: [],
          deletions: []
        }
      })
    );

    expect(plan.members.deleteIds).toHaveLength(0);
    expect(plan.members.writes).toHaveLength(0);
  });

  it('preserva o sentinela link_share nos convites', () => {
    const setlist = makeSetlist('setlist_1', []);
    const plan = buildSyncPlan(
      makeInput({
        currentUserId: OWNER_UUID,
        currentEmail: OWNER_EMAIL,
        catalog: [],
        setlists: [setlist],
        remote: {
          songs: [],
          setlists: [{ id: toUUID('setlist_1'), userId: OWNER_UUID }],
          blocks: [],
          blockSongs: [],
          members: [],
          invites: [{ id: toUUID('link_share_setlist_1'), setlistId: toUUID('setlist_1') }],
          deletions: []
        }
      })
    );

    expect(plan.invites.deleteIds).not.toContain(toUUID('link_share_setlist_1'));
  });
});

describe('InMemoryAdapter — permissões', () => {
  it('rejeita escrita de música de outro usuário (simulação de RLS)', () => {
    const remote: RemoteSnapshot = {
      songs: [{ id: toUUID('song_1'), userId: OWNER_UUID }],
      setlists: [],
      blocks: [],
      blockSongs: [],
      members: [],
      invites: [],
      deletions: []
    };
    const adapter = new InMemoryAdapter(STRANGER_UUID, remote);
    const plan = buildSyncPlan(
      makeInput({
        currentUserId: STRANGER_UUID,
        currentEmail: 'stranger@x.com',
        catalog: [],
        setlists: []
      })
    );
    // injeta uma escrita indevida para provar que o adapter bloqueia
    plan.songs.writes.push({ id: toUUID('song_1'), userId: OWNER_UUID, name: 'x', artist: 'y', originalKey: 'C', slug: '', documents: [], includeDocuments: true });

    expect(() => adapter.executePlan(plan)).toThrow(/Perda de permissão/);
  });
});
