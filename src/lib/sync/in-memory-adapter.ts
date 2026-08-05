import { toUUID } from '../ids';
import { RemoteSnapshot, SyncPlan } from './types';

/**
 * Simula o banco Supabase em memória, com as mesmas políticas de permissão
 * (RLS) que valem em produção:
 * - Músicas: só o dono (user_id) pode inserir/atualizar.
 * - Setlists: só o dono pode upsert/apagar.
 * - Blocos / block_songs: dono OU editor podem inserir/atualizar.
 * - Membros / convites / tombstones: escritas do dono (membros também via
 *   self-join por e-mail próprio).
 *
 * Se o plano tentar escrever algo que a permissão proíbe, o adapter lança uma
 * exceção — os testes garantem que o planner nunca gera planos assim.
 */
export class InMemoryAdapter {
  private songs = new Map<string, any>();
  private setlists = new Map<string, any>();
  private blocks = new Map<string, any>();
  private blockSongs = new Map<string, any>();
  private members = new Map<string, any>();
  private invites = new Map<string, any>();
  private deletions = new Map<string, any>();

  constructor(
    private currentUserId: string,
    initial?: RemoteSnapshot
  ) {
    (initial?.songs || []).forEach((r) => this.songs.set(r.id, { ...r }));
    (initial?.setlists || []).forEach((r) => this.setlists.set(r.id, { ...r }));
    (initial?.blocks || []).forEach((r) => this.blocks.set(r.id, { ...r }));
    (initial?.blockSongs || []).forEach((r) => this.blockSongs.set(r.id, { ...r }));
    (initial?.members || []).forEach((r) => this.members.set(r.id, { ...r }));
    (initial?.invites || []).forEach((r) => this.invites.set(r.id, { ...r }));
    (initial?.deletions || []).forEach((r) => this.deletions.set(r.id, { ...r }));
  }

  snapshot(): RemoteSnapshot {
    return {
      songs: Array.from(this.songs.values()).map((s) => ({ id: s.id, userId: s.userId })),
      setlists: Array.from(this.setlists.values()).map((s) => ({ id: s.id, userId: s.userId })),
      blocks: Array.from(this.blocks.values()).map((b) => ({ id: b.id, setlistId: b.setlistId })),
      blockSongs: Array.from(this.blockSongs.values()).map((bs) => ({
        id: bs.id,
        blockId: bs.blockId,
        notes: bs.notes,
        requestedKey: bs.requestedKey
      })),
      members: Array.from(this.members.values()).map((m) => ({ id: m.id, setlistId: m.setlistId, userId: m.userId })),
      invites: Array.from(this.invites.values()).map((i) => ({ id: i.id, setlistId: i.setlistId })),
      deletions: Array.from(this.deletions.values()).map((d) => ({
        id: d.id,
        entityType: d.entityType,
        entityId: d.entityId,
        deletedBy: d.deletedBy
      }))
    };
  }

  getBlockSong(id: string): any {
    return this.blockSongs.get(id);
  }

  getSong(id: string): any {
    return this.songs.get(id);
  }

  executePlan(plan: SyncPlan): void {
    // Músicas
    for (const w of plan.songs.writes) {
      if (w.userId !== this.currentUserId) {
        throw new Error(`Perda de permissão: usuário tentou escrever música de outrem (${w.id}).`);
      }
      const prev = this.songs.get(w.id);
      const merged = { ...(prev || {}), ...w };
      if (!w.includeDocuments) {
        // Delta-sync: omitir documents preserva os docs que já estão na nuvem.
        merged.documents = prev?.documents;
      }
      this.songs.set(w.id, merged);
    }
    for (const id of plan.songs.deleteIds) this.songs.delete(id);

    // Setlists (dono)
    for (const w of plan.setlists.writes) {
      if (w.userId !== this.currentUserId) {
        throw new Error(`Perda de permissão: usuário tentou escrever setlist de outrem (${w.id}).`);
      }
      this.setlists.set(w.id, { ...this.setlists.get(w.id), ...w });
    }
    for (const id of plan.setlists.deleteIds) this.setlists.delete(id);

    // Blocos (dono ou editor)
    for (const w of plan.blocks.writes) this.blocks.set(w.id, { ...this.blocks.get(w.id), ...w });
    for (const id of plan.blocks.deleteIds) this.blocks.delete(id);

    // block_songs (dono ou editor)
    for (const w of plan.blockSongs.writes) this.blockSongs.set(w.id, { ...this.blockSongs.get(w.id), ...w });
    for (const id of plan.blockSongs.deleteIds) this.blockSongs.delete(id);

    // Membros
    for (const w of plan.members.writes) this.members.set(w.id, { ...w });
    for (const id of plan.members.deleteIds) this.members.delete(id);

    // Convites
    for (const w of plan.invites.writes) this.invites.set(w.id, { ...w });
    for (const id of plan.invites.deleteIds) this.invites.delete(id);

    // Tombstones
    for (const w of plan.deletions.writes) {
      const id = toUUID(`deleted_${w.entityType}_${w.entityId}`);
      this.deletions.set(id, { id, ...w, deletedBy: this.currentUserId });
    }
    for (const id of plan.deletions.deleteIds) this.deletions.delete(id);
  }
}
