import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseConfig, CatalogSong, Setlist, Block, BlockItem, SetlistMember, DeletionRecord } from '../types';
import { StorageEngine, markExplicitSync } from './storage';
import { toUUID, songDocsFingerprint } from './ids';
import { hasTombstone } from './merge';
import { buildSyncPlan } from './sync/plan';
import { SupabaseAdapter } from './sync/supabase-adapter';
export { toUUID }; // keep existing imports working (ProfileView, etc.)

function isValidHttpUrl(urlStr: string): boolean {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getSupabaseConfig(): SupabaseConfig {
  const envUrl = ((import.meta as any).env?.VITE_SUPABASE_URL || '').trim();
  const envKey = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();
  const isUrlValid = isValidHttpUrl(envUrl);
  const isConfigured = isUrlValid && !!envKey;

  return {
    url: envUrl,
    anonKey: envKey,
    isConnected: isConfigured,
    enabled: isConfigured
  };
}

let supabaseClientInstance: SupabaseClient | null = null;

// Estado de sincronização de documentos (delta-sync).
//
// O campo `documents` de uma música carrega base64 (até 10MB por arquivo).
// Subir esse payload em todo sync é caro. Guardamos um fingerprint leve por
// música (id/nome/tipo/tamanho/createdAt — nunca o dataUrl) em
// `repertorio_sync_state_v1`. Se o fingerprint não mudou desde o último sync,
// o upsert OMITE o campo `documents`, e o Supabase preserva os docs da nuvem.
// Futuro: migrar docs para blob store (supabase.storage / IndexedDB) em vez de
// base64 inline — ver CONTEXT.md.
const SYNC_STATE_KEY = 'repertorio_sync_state_v1';

function getSyncedDocFingerprints(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSyncedDocFingerprint(songId: string, fingerprint: string) {
  try {
    const state = getSyncedDocFingerprints();
    state[songId] = fingerprint;
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  } catch {
    // Armazenamento indisponível — no-op, próximo sync re-sobe os docs.
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.isConnected || !config.url || !config.anonKey) return null;

  if (!supabaseClientInstance) {
    try {
      supabaseClientInstance = createClient(config.url, config.anonKey);
    } catch (e) {
      return null;
    }
  }
  return supabaseClientInstance;
}

// SQL Setup Script reference
export const SUPABASE_SQL_SCHEMA = `-- Repertório Automático - Supabase Schema
create extension if not exists "uuid-ossp";

-- Perfis de Usuário
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null default '',
  email text not null default '',
  created_at timestamp with time zone default now() not null
);

-- Músicas do Catálogo
create table if not exists public.songs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  artist text not null,
  original_key text not null default '',
  slug text not null default '',
  cifra_url text,
  documents jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now() not null
);

-- Setlists
create table if not exists public.setlists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  unique(user_id, name)
);

-- Blocos
create table if not exists public.blocks (
  id uuid default uuid_generate_v4() primary key,
  setlist_id uuid references public.setlists(id) on delete cascade not null,
  name text not null,
  theme text not null default '',
  position integer not null default 0,
  created_at timestamp with time zone default now() not null
);

-- Músicas do Bloco (Referências)
create table if not exists public.block_songs (
  id uuid default uuid_generate_v4() primary key,
  block_id uuid references public.blocks(id) on delete cascade not null,
  song_id uuid references public.songs(id) on delete cascade not null,
  position integer not null default 0,
  requested_key text,
  notes text,
  created_at timestamp with time zone default now() not null,
  unique(block_id, song_id)
);

-- Integrantes do Setlist
create table if not exists public.setlist_members (
  id uuid default uuid_generate_v4() primary key,
  setlist_id uuid references public.setlists(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamp with time zone default now() not null,
  unique(setlist_id, user_id)
);

-- Convites
create table if not exists public.setlist_invites (
  id uuid default uuid_generate_v4() primary key,
  setlist_id uuid references public.setlists(id) on delete cascade not null,
  inviter_id uuid references public.profiles(id) on delete cascade not null,
  invitee_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamp with time zone default now() not null
);

-- =====================================================================
-- MIGRATION: Corrigir RLS para Colaboração sem Recursão Infinita
-- Execute no SQL Editor do Supabase para aplicar as correções
-- =====================================================================

-- 1. HELPERS SECURITY DEFINER (Roda como postgres, ignora RLS interno)
drop function if exists public.is_setlist_owner(uuid, uuid) cascade;
drop function if exists public.is_setlist_member(uuid, uuid) cascade;
drop function if exists public.is_setlist_editor(uuid, uuid) cascade;
drop function if exists public.has_link_share(uuid) cascade;
drop function if exists public.has_email_invite(uuid, text) cascade;

create or replace function public.is_setlist_owner(setlist_uuid uuid, user_uuid uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.setlists
    where id = setlist_uuid
    and user_id = user_uuid
  );
end;
$$ language plpgsql security definer;

create or replace function public.is_setlist_member(setlist_uuid uuid, user_uuid uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.setlist_members
    where setlist_id = setlist_uuid
    and user_id = user_uuid
  );
end;
$$ language plpgsql security definer;

create or replace function public.is_setlist_editor(setlist_uuid uuid, user_uuid uuid)
returns boolean as $$
begin
  if exists (select 1 from public.setlists where id = setlist_uuid and user_id = user_uuid) then
    return true;
  end if;
  return exists (
    select 1 from public.setlist_members
    where setlist_id = setlist_uuid
    and user_id = user_uuid
    and role in ('owner', 'editor')
  );
end;
$$ language plpgsql security definer;

create or replace function public.has_link_share(setlist_uuid uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.setlist_invites
    where setlist_id = setlist_uuid
    and invitee_email = '__link_share__'
  );
end;
$$ language plpgsql security definer;

create or replace function public.has_email_invite(setlist_uuid uuid, user_email text)
returns boolean as $$
begin
  if user_email is null or user_email = '' then
    return false;
  end if;
  return exists (
    select 1 from public.setlist_invites
    where setlist_id = setlist_uuid
    and lower(invitee_email) = lower(user_email)
  );
end;
$$ language plpgsql security definer;

-- 2. POLÍTICAS DE RLS
-- (Consulte o arquivo walkthrough.md ou o plano de migração para o SQL de drop de políticas antigas antes de aplicar as novas)

-- Tombstones de exclusão (eliminam o "delete por ausência")
create table if not exists public.deletions (
  id uuid default uuid_generate_v4() primary key,
  entity_type text not null check (entity_type in ('song', 'setlist', 'block', 'block_song')),
  entity_key text not null,
  deleted_by uuid references public.profiles(id) on delete cascade not null,
  setlist_id uuid references public.setlists(id) on delete cascade,
  created_at timestamp with time zone default now() not null,
  unique(entity_type, entity_key)
);

alter table public.deletions enable row level security;

create policy "users_select_deletions"
  on public.deletions for select
  using (
    deleted_by = auth.uid()
    or (
      setlist_id is not null
      and (
        public.is_setlist_owner(setlist_id, auth.uid())
        or public.is_setlist_member(setlist_id, auth.uid())
      )
    )
  );

create policy "users_insert_deletions"
  on public.deletions for insert
  with check (
    deleted_by = auth.uid()
    and (
      setlist_id is null
      or public.is_setlist_editor(setlist_id, auth.uid())
    )
  );

create policy "users_update_deletions"
  on public.deletions for update
  using (
    deleted_by = auth.uid()
    or (
      setlist_id is not null
      and public.is_setlist_owner(setlist_id, auth.uid())
    )
  );

create policy "users_delete_deletions"
  on public.deletions for delete
  using (
    deleted_by = auth.uid()
    or (
      setlist_id is not null
      and public.is_setlist_owner(setlist_id, auth.uid())
    )
  );
`;

/**
 * Fetches fresh member data from Supabase for a single setlist and merges it
 * into localStorage. Called when the owner opens the share modal so they can
 * see in real time who has joined via the share link.
 */
export async function fetchSetlistMembers(
  setlistId: string
): Promise<{ success: boolean; memberCount: number }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, memberCount: 0 };

  try {
    await client.auth.getSession();

    const setlistUUID = toUUID(setlistId);

    // Fetch all profiles for email resolution
    const { data: allProfilesData } = await client.from('profiles').select('id, display_name');
    const profileEmailMap = new Map<string, string>();
    (allProfilesData || []).forEach((p: any) => {
      const email = (p.display_name || '').toLowerCase().trim();
      if (email) profileEmailMap.set(email, p.id);
    });

    // Fetch members for this specific setlist
    const { data: membersData, error: membersErr } = await client
      .from('setlist_members')
      .select('*')
      .eq('setlist_id', setlistUUID);

    if (membersErr) {
      console.error('[fetchSetlistMembers] Error:', membersErr);
      return { success: false, memberCount: 0 };
    }

    const user = StorageEngine.getUser();
    const members: SetlistMember[] = (membersData || []).map((mRow: any) => {
      const memberProfileId = mRow.user_id;
      let memberEmail = mRow.email || 'membro@repertorio.app';

      // Try to resolve email from profile map if not stored directly
      if (!mRow.email) {
        for (const [email, uid] of profileEmailMap.entries()) {
          if (uid === memberProfileId) {
            memberEmail = email;
            break;
          }
        }
      }

      const isMemberCurrentUser = memberEmail.toLowerCase() === user.email.toLowerCase();
      return {
        id: mRow.id,
        setlistId,
        email: isMemberCurrentUser ? user.email : memberEmail,
        role: mRow.role === 'editor' || mRow.role === 'owner' ? 'edit' : 'view',
        status: 'accepted' as const,
        invitedAt: mRow.created_at || new Date().toISOString()
      };
    });

    // Merge into localStorage
    const allSetlists = StorageEngine.getSetlists();
    const setlistIdx = allSetlists.findIndex((s) => s.id === setlistId);
    if (setlistIdx >= 0) {
      // Merge: keep local-only members that aren't in remote, add remote ones
      const existingEmails = new Set(allSetlists[setlistIdx].members.map((m) => m.email.toLowerCase()));
      const remoteEmails = new Set(members.map((m) => m.email.toLowerCase()));

      // Add remote members that aren't local
      members.forEach((remoteMember) => {
        if (!existingEmails.has(remoteMember.email.toLowerCase())) {
          allSetlists[setlistIdx].members.push(remoteMember);
        } else {
          // Update existing member status/role from remote
          const localIdx = allSetlists[setlistIdx].members.findIndex(
            (m) => m.email.toLowerCase() === remoteMember.email.toLowerCase()
          );
          if (localIdx >= 0) {
            allSetlists[setlistIdx].members[localIdx] = {
              ...allSetlists[setlistIdx].members[localIdx],
              role: remoteMember.role,
              status: remoteMember.status
            };
          }
        }
      });

      // Remove local pending members that accepted/rejected on remote
      allSetlists[setlistIdx].members = allSetlists[setlistIdx].members.filter((localMember) => {
        // Keep if no remote record (might be invite-only flow) or if remote has them
        return remoteEmails.has(localMember.email.toLowerCase()) || localMember.status === 'pending';
      });

      StorageEngine.saveSetlists(allSetlists);
    }

    return { success: true, memberCount: members.length };
  } catch (e: any) {
    console.error('[fetchSetlistMembers] Exception:', e);
    return { success: false, memberCount: 0 };
  }
}

// Sync Local Data to Supabase normalized schema
export async function syncLocalDataToSupabase(
  songs?: CatalogSong[],
  setlists?: Setlist[]
): Promise<{ success: boolean; message: string }> {
  markExplicitSync();

  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.'
    };
  }

  const user = StorageEngine.getUser();
  const userIdUUID = toUUID(user.id);
  const targetSongs = songs || StorageEngine.getCatalog();
  const targetSetlists = setlists || StorageEngine.getSetlists();

  try {
    // Ensure the auth session is restored from local storage before making RLS queries
    await client.auth.getSession();

    // O orquestrador de sync (plan.ts) decide o que escrever com base no
    // estado local + snapshot remoto + permissões; o SupabaseAdapter apenas
    // executa o plano de forma mecânica. As regras são testáveis sem rede.
    const adapter = new SupabaseAdapter(client);
    await adapter.ensureProfile(userIdUUID, user.name || user.email || '', user.email || '');

    const [profileEmailMap, remote] = await Promise.all([
      adapter.fetchProfiles(),
      adapter.fetchSnapshot(userIdUUID)
    ]);

    const deletions = StorageEngine.getDeletions();
    const plan = buildSyncPlan({
      currentUserId: userIdUUID,
      currentEmail: (user.email || '').toLowerCase(),
      profileEmailMap,
      savedDocFingerprints: getSyncedDocFingerprints(),
      deletions,
      catalog: targetSongs,
      setlists: targetSetlists,
      remote
    });

    await adapter.executePlan(plan);

    // Persistir fingerprints APÓS sync bem-sucedido (delta-sync de documentos)
    const syncedSongs = targetSongs.filter(
      (s) => (!s.userId || toUUID(s.userId) === userIdUUID) && !hasTombstone(deletions, 'song', s.id)
    );
    syncedSongs.forEach((s) => saveSyncedDocFingerprint(s.id, songDocsFingerprint(s)));

    return { success: true, message: 'Dados sincronizados com o Supabase com sucesso!' };
  } catch (err: any) {
    console.error('[Supabase Sync Error]', err);
    return { success: false, message: err.message || 'Erro na sincronização com Supabase.' };
  }
}

// Fetch Remote Data from Supabase normalized schema
export async function fetchRemoteDataFromSupabase(): Promise<{
  success: boolean;
  message?: string;
  songs?: CatalogSong[];
  setlists?: Setlist[];
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.'
    };
  }

  try {
    const user = StorageEngine.getUser();
    const currentUserUUID = toUUID(user.id);

    // Ensure the auth session is restored from local storage before making RLS queries
    await client.auth.getSession();

    // Fetch user profile from Supabase
    if (currentUserUUID) {
      const { data: profileData } = await client.from('profiles').select('display_name, avatar_url').eq('id', currentUserUUID).maybeSingle();
      if (profileData) {
        StorageEngine.setUser({
          ...user,
          name: profileData.display_name || user.name,
          avatarUrl: profileData.avatar_url || undefined
        });
      }
    }

    // Fetch all profiles to build:
    // - email → id map (for member matching)
    // - id → display_name map (for showing owner name in the UI)
    const { data: allProfilesData } = await client.from('profiles').select('id, display_name, email');
    const profileEmailMap = new Map<string, string>();
    const profileIdToNameMap = new Map<string, string>();
    (allProfilesData || []).forEach((p: any) => {
      const email = (p.email || p.display_name || '').toLowerCase().trim();
      if (email) profileEmailMap.set(email, p.id);
      if (p.id && p.display_name) profileIdToNameMap.set(p.id, p.display_name);
    });

    const { data: membersData, error: membersErr } = await client
      .from('setlist_members')
      .select('*')
      .eq('user_id', currentUserUUID);

    // Fetch tombstones de exclusão e mescla-los no storage local para que
    // os merges respeitem exclusões feitas em outros dispositivos.
    try {
      const { data: deletionsData } = await client.from('deletions').select('*');
      if (deletionsData && deletionsData.length > 0) {
        const remoteDeletions: DeletionRecord[] = (deletionsData || []).map((row: any) => ({
          id: row.id,
          entityType: row.entity_type,
          entityId: row.entity_key,
          userId: row.deleted_by,
          setlistId: row.setlist_id || undefined,
          createdAt: row.created_at || new Date().toISOString()
        }));
        StorageEngine.mergeRemoteDeletions(remoteDeletions);
      }
    } catch (err) {
      // Tabela ainda não existe (migração pendente): segue sem tombstones remotos
      console.warn('[Supabase Fetch] Could not load deletions (migration pending?):', err);
    }

    const { data: songsData, error: songsErr } = await client
      .from('songs')
      .select('*')
      .eq('user_id', currentUserUUID);
    const memberSetlistIds = (membersData || []).map((m: any) => m.setlist_id);
    let setlistQuery = client.from('setlists').select('*');
    if (memberSetlistIds.length > 0) {
      setlistQuery = setlistQuery.or(`user_id.eq.${currentUserUUID},id.in.(${memberSetlistIds.join(',')})`);
    } else {
      setlistQuery = setlistQuery.eq('user_id', currentUserUUID);
    }
    const { data: rawSetlistsData, error: setlistsErr } = await setlistQuery;
    const setlistsData = (rawSetlistsData || []).filter((st: any) => {
      const isOwner = st.user_id === currentUserUUID;
      const isMember = memberSetlistIds.includes(st.id);
      return isOwner || isMember;
    });

    const { data: blocksData, error: blocksErr } = await client.from('blocks').select('*').order('position', { ascending: true });
    const { data: blockSongsData, error: bsErr } = await client.from('block_songs').select('*').order('position', { ascending: true });

    if (songsErr || setlistsErr || blocksErr || bsErr || membersErr) {
      const err = songsErr || setlistsErr || blocksErr || bsErr || membersErr;
      console.error('[Supabase Fetch Query Error]', err);
      return { success: false, message: err?.message || 'Erro ao carregar dados do Supabase.' };
    }

    // Map Songs
    const songMap = new Map<string, CatalogSong>();
    const songs: CatalogSong[] = (songsData || []).map((row: any) => {
      const song: CatalogSong = {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        artist: row.artist,
        originalKey: row.original_key || 'C',
        slugOverride: row.slug || undefined,
        documents: Array.isArray(row.documents) ? row.documents : [],
        createdAt: row.created_at,
        updatedAt: row.created_at
      };
      songMap.set(row.id, song);
      return song;
    });

    // Map Setlists
    const setlists: Setlist[] = (setlistsData || []).map((stRow: any) => {
      // Find blocks for this setlist
      const setlistBlocks = (blocksData || [])
        .filter((bRow: any) => bRow.setlist_id === stRow.id)
        .map((bRow: any) => {
          // Find block_songs for this block
          const items: BlockItem[] = (blockSongsData || [])
            .filter((bsRow: any) => bsRow.block_id === bRow.id)
            .map((bsRow: any) => {
              const matchedSong = songMap.get(bsRow.song_id);
              const item: BlockItem = {
                id: bsRow.id,
                blockId: bRow.id,
                catalogSongId: bsRow.song_id,
                position: bsRow.position || 0,
                requestedKey: bsRow.requested_key || (matchedSong ? matchedSong.originalKey : 'C'),
                originalKeyAtAssignment: matchedSong ? matchedSong.originalKey : 'C',
                notes: bsRow.notes || undefined,
                songName: matchedSong ? matchedSong.name : 'Música Sem Nome',
                songArtist: matchedSong ? matchedSong.artist : 'Artista',
                songOriginalKey: matchedSong ? matchedSong.originalKey : 'C'
              };
              return item;
            });

          const block: Block = {
            id: bRow.id,
            setlistId: stRow.id,
            name: bRow.name,
            theme: bRow.theme || '',
            position: bRow.position || 0,
            items
          };
          return block;
        });

      // Find members for this setlist
      const members: SetlistMember[] = (membersData || [])
        .filter((mRow: any) => mRow.setlist_id === stRow.id)
        .map((mRow: any) => {
          const memberProfileId = mRow.user_id;
          let memberEmail = mRow.email || 'membro@repertorio.app';
          if (memberEmail === 'membro@repertorio.app') {
            for (const [email, uid] of profileEmailMap.entries()) {
              if (uid === memberProfileId) {
                memberEmail = email;
                break;
              }
            }
          }
          const isMemberCurrentUser = memberEmail === user.email.toLowerCase();
          return {
            id: mRow.id,
            setlistId: stRow.id,
            email: isMemberCurrentUser ? user.email : memberEmail,
            role: mRow.role === 'editor' || mRow.role === 'owner' ? 'edit' : 'view',
            status: 'accepted',
            invitedAt: mRow.created_at || new Date().toISOString()
          };
        });

      const isOwner = toUUID(stRow.user_id) === currentUserUUID;
      // Resolve the owner's email: if the current user is the owner, use their email.
      // Otherwise, look up the email in profileEmailMap using the user_id UUID.
      // Fall back to the raw UUID string only if the email cannot be resolved.
      let resolvedOwnerEmail: string;
      if (isOwner) {
        resolvedOwnerEmail = user.email;
      } else {
        const found = [...profileEmailMap.entries()].find(([, uid]) => uid === stRow.user_id);
        resolvedOwnerEmail = found ? found[0] : (stRow.user_id || 'dono@repertorio.app');
      }

      const setlist: Setlist = {
        id: stRow.id,
        ownerId: stRow.user_id,
        ownerEmail: resolvedOwnerEmail,
        ownerDisplayName: profileIdToNameMap.get(stRow.user_id) || undefined,
        name: stRow.name,
        createdAt: stRow.created_at,
        updatedAt: stRow.updated_at || stRow.created_at,
        blocks: setlistBlocks,
        members
      };

      return setlist;
    });

    return { success: true, songs, setlists };
  } catch (e: any) {
    console.error('[Supabase Fetch Error]', e);
    return { success: false, message: e.message || 'Erro desconhecido.' };
  }
}

/**
 * Registers a generic link-share invite in Supabase using the sentinel value
 * '__link_share__' as the invitee_email. This allows ANY authenticated user
 * who opens the share URL to read the setlist (RLS policy checks for this record).
 * Must be called when the owner clicks "Copy" or "Send to WhatsApp".
 */
export async function enableSetlistLinkShare(setlistId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const user = StorageEngine.getUser();
  const userIdUUID = toUUID(user.id);
  const setlistUUID = toUUID(setlistId);
  const inviteId = toUUID(`link_share_${setlistId}`);

  try {
    await client.auth.getSession();
    const { error } = await client.from('setlist_invites').upsert([{
      id: inviteId,
      setlist_id: setlistUUID,
      inviter_id: userIdUUID,
      invitee_email: '__link_share__',
      status: 'pending'
    }], { onConflict: 'id' });

    if (error) {
      console.error('[Share Link] Failed to enable link share in Supabase:', error);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[Share Link] Exception enabling link share:', e);
    return false;
  }
}

/**
 * Directly inserts the current authenticated user into setlist_members in Supabase.
 * Called after the invitee successfully opens a share link and joins locally.
 * This is needed because syncLocalDataToSupabase skips setlists the current
 * user does not own, so membership would never be persisted otherwise.
 */
export async function selfJoinSetlistAsMember(
  setlistId: string,
  role: 'edit' | 'view'
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const user = StorageEngine.getUser();
  if (!user?.email) return false;

  const userIdUUID = toUUID(user.id);
  const setlistUUID = toUUID(setlistId);
  const memberUUID = toUUID(`${setlistId}_${user.email}`);
  const dbRole = role === 'edit' ? 'editor' : 'viewer';

  try {
    await client.auth.getSession();

    // Ensure the user has a profile entry
    await client.from('profiles').upsert([{
      id: userIdUUID,
      display_name: user.name || user.email,
      email: user.email
    }], { onConflict: 'id' });

    const { error } = await client.from('setlist_members').upsert([{
      id: memberUUID,
      setlist_id: setlistUUID,
      user_id: userIdUUID,
      role: dbRole,
      email: user.email
    }], { onConflict: 'setlist_id,user_id' });

    if (error) {
      console.error('[Share Link] Failed to self-join setlist_members:', error);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[Share Link] Exception during self-join:', e);
    return false;
  }
}

// Sync helper com toast de erro embutido. Centraliza o guard de conexão e o
// tratamento de erro que estava duplicado em SetlistDetail, FocusedBlockView,
// SetlistsList e ProfileView. Retorna true se o sync rodou com sucesso.
export async function syncWithToast(
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void,
  setlists?: Setlist[]
): Promise<boolean> {
  if (!getSupabaseConfig().isConnected) return false;
  const result = await syncLocalDataToSupabase(undefined, setlists);
  if (!result.success) {
    showToast(`Erro ao sincronizar: ${result.message}`, 'error');
    return false;
  }
  return true;
}
