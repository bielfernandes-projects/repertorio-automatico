import { toUUID, deletionKey, songDocsFingerprint } from '../ids';
import { findTombstonedIds, hasTombstone } from '../merge';
import { SyncPlan, SyncPlanInput } from './types';

function emptyPlan(): SyncPlan {
  return {
    songs: { writes: [], deleteIds: [] },
    setlists: { writes: [], deleteIds: [] },
    blocks: { writes: [], deleteIds: [] },
    blockSongs: { writes: [], deleteIds: [] },
    members: { writes: [], deleteIds: [] },
    invites: { writes: [], deleteIds: [] },
    deletions: { writes: [], deleteIds: [] }
  };
}

/**
 * Decide, a partir do estado local + snapshot remoto + permissões do usuário,
 * exatamente o que sincronizar. Função pura e determinística — sem I/O — para
 * que as regras de negócio (ownership, editor/viewer, tombstones, delta-sync)
 * sejam testáveis via InMemoryAdapter sem depender de rede/Supabase.
 *
 * Regras preservadas do sync original:
 * - Músicas: só as do próprio usuário são upsertadas; só as com tombstone são apagadas.
 * - Setlists não-donos: editor sincroniza só blocos/músicas-de-bloco; viewer e
 *   não-membro não escrevem nada (fecha o vazamento de link-share).
 * - Dono: sync completo (setlist, blocos, block_songs, membros, convites).
 * - Tombstone vence: nunca ressuscitar entidade tombstoned; apagar as tombstoned
 *   que existem no remoto.
 * - Guard de membros: nunca apagar membros quando a lista local estiver vazia.
 * - Convites: preservar o sentinela `link_share_${setlistId}`.
 * - Docs: omitir `documents` no upsert quando o fingerprint não mudou.
 */
export function buildSyncPlan(input: SyncPlanInput): SyncPlan {
  const plan = emptyPlan();
  const { currentUserId, currentEmail, profileEmailMap, savedDocFingerprints, deletions, catalog, setlists, remote } = input;

  // ===== Músicas (apenas as do próprio usuário) =====
  const ownSongs = catalog.filter((s) => !s.userId || toUUID(s.userId) === currentUserId);
  const remoteOwnSongs = remote.songs.filter((s) => s.userId === currentUserId);
  plan.songs.deleteIds = findTombstonedIds('song', remoteOwnSongs.map((s) => s.id), deletions);

  for (const s of ownSongs) {
    if (hasTombstone(deletions, 'song', s.id)) continue;
    const fingerprint = songDocsFingerprint(s);
    const includeDocuments = savedDocFingerprints[s.id] !== fingerprint;
    plan.songs.writes.push({
      id: toUUID(s.id),
      userId: currentUserId,
      name: s.name,
      artist: s.artist,
      originalKey: s.originalKey || '',
      slug: s.slugOverride || '',
      documents: s.documents || [],
      includeDocuments
    });
  }

  // ===== Setlists =====
  const remoteOwnSetlists = remote.setlists.filter((r) => r.userId === currentUserId);
  plan.setlists.deleteIds = findTombstonedIds('setlist', remoteOwnSetlists.map((r) => r.id), deletions);

  for (const st of setlists) {
    const setlistUUID = toUUID(st.id);
    const isOwner = !st.ownerEmail || st.ownerEmail.toLowerCase() === currentEmail.toLowerCase();

    if (!isOwner) {
      const myMembership = (st.members || []).find(
        (m) => m.email.toLowerCase() === currentEmail.toLowerCase()
      );
      if (myMembership?.role === 'edit') {
        addEditorEdits(plan, st, currentUserId, catalog, deletions, remote);
      }
      continue;
    }

    if (hasTombstone(deletions, 'setlist', st.id)) continue;

    plan.setlists.writes.push({
      id: setlistUUID,
      userId: currentUserId,
      name: st.name,
      updatedAt: st.updatedAt || new Date().toISOString()
    });

    addOwnerSetlistContent(plan, st, setlistUUID, currentUserId, currentEmail, profileEmailMap, deletions, remote);
  }

  // ===== Tombstones (espelho deletado localmente -> nuvem) =====
  const myDeletions = deletions.filter((d) => toUUID(d.userId) === currentUserId);
  const myLocalKeys = new Set(myDeletions.map((d) => deletionKey(d.entityType, d.entityId)));
  const remoteKeys = new Set(remote.deletions.map((d) => deletionKey(d.entityType, d.entityId)));

  plan.deletions.deleteIds = remote.deletions
    .filter((r) => toUUID(r.deletedBy) === currentUserId && !myLocalKeys.has(deletionKey(r.entityType, r.entityId)))
    .map((r) => r.id);

  for (const d of myDeletions) {
    if (remoteKeys.has(deletionKey(d.entityType, d.entityId))) continue;
    plan.deletions.writes.push({
      entityType: d.entityType,
      entityId: d.entityId,
      deletedBy: currentUserId,
      setlistId: d.setlistId ? toUUID(d.setlistId) : null,
      createdAt: d.createdAt
    });
  }

  return plan;
}

/** Conteúdo completo de um setlist do qual o usuário é dono. */
function addOwnerSetlistContent(
  plan: SyncPlan,
  st: SyncPlanInput['setlists'][number],
  setlistUUID: string,
  currentUserId: string,
  currentEmail: string,
  profileEmailMap: Map<string, string>,
  deletions: SyncPlanInput['deletions'],
  remote: SyncPlanInput['remote']
): void {
  const remoteBlocksOfSetlist = remote.blocks.filter((b) => b.setlistId === setlistUUID);
  plan.blocks.deleteIds.push(...findTombstonedIds('block', remoteBlocksOfSetlist.map((b) => b.id), deletions));

  for (const b of st.blocks || []) {
    if (hasTombstone(deletions, 'block', b.id)) continue;
    const blockUUID = toUUID(b.id);
    plan.blocks.writes.push({
      id: blockUUID,
      setlistId: setlistUUID,
      name: b.name,
      theme: b.theme || '',
      position: b.position
    });

    addBlockSongs(plan, b, blockUUID, deletions, remote);
  }

  // ===== Membros =====
  const remoteMembersOfSetlist = remote.members.filter((m) => m.setlistId === setlistUUID);
  if ((st.members || []).length > 0) {
    const localMemberUUIDs = new Set((st.members || []).map((m) => toUUID(`${st.id}_${m.email}`)));
    plan.members.deleteIds.push(
      ...remoteMembersOfSetlist
        .filter((m) => m.userId !== currentUserId)
        .map((m) => m.id)
        .filter((id) => !localMemberUUIDs.has(id))
    );
  }

  for (const m of st.members || []) {
    const emailClean = (m.email || '').toLowerCase().trim();
    const targetUserId =
      profileEmailMap.get(emailClean) || (emailClean === currentEmail.toLowerCase() ? currentUserId : null);
    if (!targetUserId) continue;
    plan.members.writes.push({
      id: toUUID(`${st.id}_${m.email}`),
      setlistId: setlistUUID,
      userId: targetUserId,
      role: m.role === 'edit' ? 'editor' : 'viewer',
      email: m.email
    });
    if (m.status === 'pending') {
      plan.invites.writes.push({
        id: toUUID(`invite_${st.id}_${m.email}`),
        setlistId: setlistUUID,
        inviterId: currentUserId,
        inviteeEmail: m.email,
        status: 'pending'
      });
    }
  }

  // ===== Convites (limpeza, preservando o sentinela de link-share) =====
  const remoteInvitesOfSetlist = remote.invites.filter((i) => i.setlistId === setlistUUID);
  const localInviteUUIDs = new Set(
    (st.members || []).filter((m) => m.status === 'pending').map((m) => toUUID(`invite_${st.id}_${m.email}`))
  );
  plan.invites.deleteIds.push(
    ...remoteInvitesOfSetlist.map((i) => i.id).filter((id) => {
      if (id === toUUID(`link_share_${st.id}`)) return false;
      return !localInviteUUIDs.has(id);
    })
  );
}

/** Editor de um setlist compartilhado: apenas blocos e músicas-de-bloco (soft). */
function addEditorEdits(
  plan: SyncPlan,
  st: SyncPlanInput['setlists'][number],
  memberUserIdUUID: string,
  catalog: SyncPlanInput['catalog'],
  deletions: SyncPlanInput['deletions'],
  remote: SyncPlanInput['remote']
): void {
  const setlistUUID = toUUID(st.id);
  const remoteBlocksOfSetlist = remote.blocks.filter((b) => b.setlistId === setlistUUID);
  plan.blocks.deleteIds.push(...findTombstonedIds('block', remoteBlocksOfSetlist.map((b) => b.id), deletions));

  for (const b of st.blocks || []) {
    if (hasTombstone(deletions, 'block', b.id)) continue;
    const blockUUID = toUUID(b.id);
    plan.blocks.writes.push({
      id: blockUUID,
      setlistId: setlistUUID,
      name: b.name,
      theme: b.theme || '',
      position: b.position,
      soft: true
    });
    addBlockSongs(plan, b, blockUUID, deletions, remote, { memberUserIdUUID, catalog });
  }
}

function addBlockSongs(
  plan: SyncPlan,
  b: SyncPlanInput['setlists'][number]['blocks'][number],
  blockUUID: string,
  deletions: SyncPlanInput['deletions'],
  remote: SyncPlanInput['remote'],
  editor?: { memberUserIdUUID: string; catalog: SyncPlanInput['catalog'] }
): void {
  const remoteBlockSongsOfBlock = remote.blockSongs.filter((bs) => bs.blockId === blockUUID);
  plan.blockSongs.deleteIds.push(
    ...findTombstonedIds('block_song', remoteBlockSongsOfBlock.map((bs) => bs.id), deletions)
  );

  const existingBSMap = new Map<string, { notes?: string | null; requestedKey?: string | null }>();
  remoteBlockSongsOfBlock.forEach((bs) => existingBSMap.set(bs.id, { notes: bs.notes, requestedKey: bs.requestedKey }));

  for (const item of b.items || []) {
    const catalogSongId = item.catalogSongId || item.id;
    if (hasTombstone(deletions, 'block_song', `${b.id}_${catalogSongId}`)) continue;

    const blockSongUUID = toUUID(`${b.id}_${catalogSongId}`);
    const existing = existingBSMap.get(blockSongUUID);
    const mergedNotes = item.notes || existing?.notes || null;
    const mergedKey = item.requestedKey || item.songOriginalKey || item.originalKeyAtAssignment || existing?.requestedKey || '';

    if (editor && item.songName && item.songArtist) {
      const localSong = editor.catalog.find((c) => c.id === catalogSongId);
      const isMySong = localSong && (!localSong.userId || toUUID(localSong.userId) === editor.memberUserIdUUID);
      if (isMySong) {
        const songUUID = toUUID(catalogSongId);
        plan.songs.writes.push({
          id: songUUID,
          userId: editor.memberUserIdUUID,
          name: item.songName,
          artist: item.songArtist,
          originalKey: item.songOriginalKey || item.originalKeyAtAssignment || '',
          slug: '',
          documents: [],
          includeDocuments: false,
          soft: true
        });
      }
    }

    plan.blockSongs.writes.push({
      id: blockSongUUID,
      blockId: blockUUID,
      songId: toUUID(catalogSongId),
      position: item.position,
      requestedKey: mergedKey,
      notes: mergedNotes,
      soft: editor ? true : undefined
    });
  }
}
