import { SupabaseClient } from '@supabase/supabase-js';
import { toUUID } from '../ids';
import { RemoteSnapshot, SongWrite, SyncPlan } from './types';

/**
 * Executor mecânico do plano de sync contra o Supabase. Não toma nenhuma
 * decisão de negócio (isso vive em plan.ts) — apenas traduz os registros do
 * plano em upserts/deletes, preservando o comportamento de erros do sync
 * original: escritas "hard" (dono) abortam; escritas "soft" (editor) apenas
 * logam; deletes logam e seguem.
 */
export class SupabaseAdapter {
  constructor(private client: SupabaseClient) {}

  async fetchProfiles(): Promise<Map<string, string>> {
    const { data } = await this.client.from('profiles').select('id, display_name, email');
    const map = new Map<string, string>();
    (data || []).forEach((p: any) => {
      const email = (p.email || p.display_name || '').toLowerCase().trim();
      if (email) map.set(email, p.id);
    });
    return map;
  }

  async ensureProfile(userIdUUID: string, displayName: string, email: string): Promise<void> {
    await this.client.from('profiles').upsert([{ id: userIdUUID, display_name: displayName, email }], { onConflict: 'id' });
  }

  async fetchSnapshot(currentUserId: string): Promise<RemoteSnapshot> {
    const [songs, setlists, blocks, blockSongs, members, invites, deletions] = await Promise.all([
      this.client.from('songs').select('id, user_id').eq('user_id', currentUserId),
      this.client.from('setlists').select('id, user_id'),
      this.client.from('blocks').select('id, setlist_id'),
      this.client.from('block_songs').select('id, block_id, notes, requested_key'),
      this.client.from('setlist_members').select('id, setlist_id, user_id'),
      this.client.from('setlist_invites').select('id, setlist_id'),
      this.client.from('deletions').select('*')
    ]);

    return {
      songs: (songs.data || []).map((r: any) => ({ id: r.id, userId: r.user_id })),
      setlists: (setlists.data || []).map((r: any) => ({ id: r.id, userId: r.user_id })),
      blocks: (blocks.data || []).map((r: any) => ({ id: r.id, setlistId: r.setlist_id })),
      blockSongs: (blockSongs.data || []).map((r: any) => ({
        id: r.id,
        blockId: r.block_id,
        notes: r.notes,
        requestedKey: r.requested_key
      })),
      members: (members.data || []).map((r: any) => ({ id: r.id, setlistId: r.setlist_id, userId: r.user_id })),
      invites: (invites.data || []).map((r: any) => ({ id: r.id, setlistId: r.setlist_id })),
      deletions: (deletions.data || []).map((r: any) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_key,
        deletedBy: r.deleted_by
      }))
    };
  }

  async executePlan(plan: SyncPlan): Promise<void> {
    // Tombstones primeiro (espelho de exclusões), como no sync original.
    await this.applyDeletionMirror(plan.deletions);

    // ===== Músicas =====
    for (const w of plan.songs.writes) {
      const { error } = await this.client.from('songs').upsert([this.toSongRow(w)], { onConflict: 'id' });
      if (error) {
        if (w.soft) {
          console.warn('[Sync Member] Song upsert blocked by RLS (continuing):', error.message);
        } else {
          throw new Error(`Erro sincronizando músicas: ${error.message}`);
        }
      }
    }
    if (plan.songs.deleteIds.length > 0) {
      const { error } = await this.client.from('songs').delete().in('id', plan.songs.deleteIds);
      if (error) console.warn('[Sync] Could not delete songs (RLS policy may prevent this):', error.message);
    }

    // ===== Setlists =====
    for (const w of plan.setlists.writes) {
      const { error } = await this.client.from('setlists').upsert([{
        id: w.id,
        user_id: w.userId,
        name: w.name,
        updated_at: w.updatedAt
      }], { onConflict: 'id' });
      if (error) throw new Error(`Erro sincronizando setlist "${w.name}": ${error.message}`);
    }
    if (plan.setlists.deleteIds.length > 0) {
      const { error } = await this.client.from('setlists').delete().in('id', plan.setlists.deleteIds);
      if (error) console.warn('[Sync] Could not delete setlists (RLS policy may prevent this):', error.message);
    }

    // ===== Blocos =====
    for (const w of plan.blocks.writes) {
      const { error } = await this.client.from('blocks').upsert([{
        id: w.id,
        setlist_id: w.setlistId,
        name: w.name,
        theme: w.theme,
        position: w.position
      }], { onConflict: 'id' });
      if (error) {
        if (w.soft) {
          console.warn('[Sync Member] Block upsert blocked by RLS (continuing):', error.message);
        } else {
          throw new Error(`Erro sincronizando bloco "${w.name}": ${error.message}`);
        }
      }
    }
    if (plan.blocks.deleteIds.length > 0) {
      const { error } = await this.client.from('blocks').delete().in('id', plan.blocks.deleteIds);
      if (error) console.warn('[Sync] Could not delete blocks (RLS policy may prevent this):', error.message);
    }

    // ===== Músicas do bloco =====
    for (const w of plan.blockSongs.writes) {
      const { error } = await this.client.from('block_songs').upsert([{
        id: w.id,
        block_id: w.blockId,
        song_id: w.songId,
        position: w.position,
        requested_key: w.requestedKey,
        notes: w.notes
      }], { onConflict: 'id' });
      if (error) {
        if (w.soft) {
          console.warn('[Sync Member] Could not upsert block_song (continuing):', error.message);
        } else {
          throw new Error(`Erro vinculando música no bloco: ${error.message}`);
        }
      }
    }
    if (plan.blockSongs.deleteIds.length > 0) {
      const { error } = await this.client.from('block_songs').delete().in('id', plan.blockSongs.deleteIds);
      if (error) console.warn('[Sync] Could not delete block_songs (RLS policy may prevent this):', error.message);
    }

    // ===== Membros =====
    if (plan.members.deleteIds.length > 0) {
      const { error } = await this.client.from('setlist_members').delete().in('id', plan.members.deleteIds);
      if (error) console.error('[Sync] Error deleting member:', error.message);
    }
    for (const w of plan.members.writes) {
      const { error } = await this.client.from('setlist_members').upsert([{
        id: w.id,
        setlist_id: w.setlistId,
        user_id: w.userId,
        role: w.role,
        email: w.email
      }], { onConflict: 'setlist_id,user_id' });
      if (error) console.error('[Sync] Error upserting member:', error.message);
    }

    // ===== Convites =====
    if (plan.invites.deleteIds.length > 0) {
      const { error } = await this.client.from('setlist_invites').delete().in('id', plan.invites.deleteIds);
      if (error) console.error('[Sync] Error deleting invite:', error.message);
    }
    for (const w of plan.invites.writes) {
      await this.client.from('setlist_invites').upsert([{
        id: w.id,
        setlist_id: w.setlistId,
        inviter_id: w.inviterId,
        invitee_email: w.inviteeEmail,
        status: w.status
      }], { onConflict: 'id' });
    }
  }

  private toSongRow(w: SongWrite): Record<string, any> {
    const base: Record<string, any> = {
      id: w.id,
      user_id: w.userId,
      name: w.name,
      artist: w.artist,
      original_key: w.originalKey,
      slug: w.slug,
      cifra_url: null
    };
    if (w.includeDocuments) base.documents = w.documents || [];
    return base;
  }

  private async applyDeletionMirror(planDeletions: SyncPlan['deletions']): Promise<void> {
    if (planDeletions.deleteIds.length > 0) {
      const { error } = await this.client.from('deletions').delete().in('id', planDeletions.deleteIds);
      if (error) console.warn('[Sync] Could not remove cleared tombstones:', error.message);
    }
    for (const d of planDeletions.writes) {
      const { error } = await this.client.from('deletions').upsert([{
        entity_type: d.entityType,
        entity_key: d.entityId,
        deleted_by: d.deletedBy,
        setlist_id: d.setlistId ? toUUID(d.setlistId) : null,
        created_at: d.createdAt
      }], { onConflict: 'entity_type,entity_key' });
      if (error) console.warn('[Sync] Could not persist tombstone:', error.message, d.entityType, d.entityId);
    }
  }
}
