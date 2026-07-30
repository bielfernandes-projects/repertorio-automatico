import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseConfig, CatalogSong, Setlist, Block, BlockItem, SetlistMember } from '../types';
import { StorageEngine, markExplicitSync } from './storage';

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

export function resetSupabaseClient() {
  supabaseClientInstance = null;
}

/**
 * Converts arbitrary string IDs to a valid RFC-4122 UUID v4 string deterministically
 * so Postgres uuid columns accept local IDs (e.g., 'song_01', 'set_01') seamlessly.
 */
export function toUUID(id: string): string {
  if (!id) return '00000000-0000-4000-a000-000000000000';
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id.toLowerCase();

  let hash1 = 0;
  let hash2 = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash1 = (hash1 << 5) - hash1 + char;
    hash1 |= 0;
    hash2 = (hash2 << 7) - hash2 + char;
    hash2 |= 0;
  }

  const h1 = Math.abs(hash1).toString(16).padStart(8, '0');
  const h2 = Math.abs(hash2).toString(16).padStart(8, '0');
  const pad = '0000000000000000';

  const part1 = h1;
  const part2 = (h2 + pad).slice(0, 4);
  const part3 = '4' + (h1 + pad).slice(0, 3);
  const part4 = 'a' + (h2 + pad).slice(0, 3);
  const part5 = (h1 + h2 + pad).slice(0, 12);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

// Test Connection using .env credentials
export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  const config = getSupabaseConfig();

  if (!config.isConnected || !config.url || !config.anonKey) {
    return {
      success: false,
      message: 'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY válidos não foram definidos no arquivo .env.'
    };
  }

  try {
    const tempClient = createClient(config.url, config.anonKey);
    const { error } = await tempClient.from('songs').select('count', { count: 'exact', head: true });

    if (error && error.code !== 'PGRST116' && !error.message.includes('relation "public.songs" does not exist')) {
      return { success: false, message: `Erro ao conectar: ${error.message}` };
    }

    resetSupabaseClient();

    return {
      success: true,
      message: error?.message.includes('relation "public.songs" does not exist')
        ? 'Conectado ao Supabase! (A tabela "songs" não existe no seu banco de dados).'
        : 'Conectado com sucesso ao banco de dados Supabase!'
    };
  } catch (err: any) {
    return { success: false, message: `Falha na conexão: ${err.message || 'Erro desconhecido'}` };
  }
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
`;

/**
 * Syncs blocks and block_songs for a setlist where the current user is an editor member.
 * Skips the setlist upsert (requires owner RLS) but writes block-level changes.
 * Requires the "editors_can_insert/update_blocks/block_songs" RLS policies in Supabase.
 */
async function syncMemberEditsToSupabase(
  client: SupabaseClient,
  st: Setlist,
  memberUserIdUUID: string
): Promise<void> {
  const setlistUUID = toUUID(st.id);

  if (!st.blocks || st.blocks.length === 0) return;

  // Clean up deleted blocks
  const { data: dbBlocks, error: fetchBlocksErr } = await client
    .from('blocks')
    .select('id')
    .eq('setlist_id', setlistUUID);

  if (!fetchBlocksErr && dbBlocks) {
    const localBlockUUIDs = new Set(st.blocks.map((b) => toUUID(b.id)));
    const blocksToDelete = dbBlocks.map((b: any) => b.id).filter((id: string) => !localBlockUUIDs.has(id));
    if (blocksToDelete.length > 0) {
      await client.from('blocks').delete().in('id', blocksToDelete);
    }
  }

  // Upsert all blocks in parallel
  await Promise.all(
    st.blocks.map(async (b, blockIdx) => {
      const blockUUID = toUUID(b.id);

      const { error: blockErr } = await client.from('blocks').upsert([{
        id: blockUUID,
        setlist_id: setlistUUID,
        name: b.name,
        theme: b.theme || '',
        position: b.position !== undefined ? b.position : blockIdx
      }], { onConflict: 'id' });

      if (blockErr) {
        console.warn('[Sync Member] Block upsert blocked by RLS (block already exists in Supabase, continuing):', blockErr.message);
      }

      // Clean up deleted block_songs for this block
      const { data: dbBlockSongs, error: fetchBSErr } = await client
        .from('block_songs')
        .select('id, notes, requested_key')
        .eq('block_id', blockUUID);

      if (!fetchBSErr && dbBlockSongs) {
        const localBSUUIDs = new Set(
          (b.items || []).map((item) => {
            const catalogSongId = item.catalogSongId || item.id;
            return toUUID(`${b.id}_${catalogSongId}`);
          })
        );
        const bsToDelete = dbBlockSongs.map((bs: any) => bs.id).filter((id: string) => !localBSUUIDs.has(id));
        if (bsToDelete.length > 0) {
          await client.from('block_songs').delete().in('id', bsToDelete);
        }
      }

      // Build a lookup map of existing Supabase values for merge
      const existingBSMap = new Map<string, { notes?: string | null; requested_key?: string }>();
      (dbBlockSongs || []).forEach((bs: any) => {
        existingBSMap.set(bs.id, { notes: bs.notes, requested_key: bs.requested_key });
      });

      if (b.items && b.items.length > 0) {
        await Promise.all(
          b.items.map(async (item, itemIdx) => {
            const catalogSongId = item.catalogSongId || item.id;
            const songUUID = toUUID(catalogSongId);
            const blockSongUUID = toUUID(`${b.id}_${catalogSongId}`);

            // Merge: preserve existing Supabase values when local has no data
            const existing = existingBSMap.get(blockSongUUID);
            const mergedNotes = item.notes || existing?.notes || null;
            const mergedKey = item.requestedKey || item.songOriginalKey || item.originalKeyAtAssignment || existing?.requested_key || '';

            // Ensure the song exists — use the member's user_id since the song is from their catalog
            if (item.songName && item.songArtist) {
              const localCatalog = StorageEngine.getCatalog();
              const localSong = localCatalog.find((s) => s.id === catalogSongId);
              // Only upsert the song if it belongs to the current member
              const isMySong = localSong && (!localSong.userId || toUUID(localSong.userId) === memberUserIdUUID);
              if (isMySong) {
                await client.from('songs').upsert([{
                  id: songUUID,
                  user_id: memberUserIdUUID,
                  name: item.songName,
                  artist: item.songArtist,
                  original_key: item.songOriginalKey || item.originalKeyAtAssignment || '',
                  slug: '',
                  cifra_url: null
                }], { onConflict: 'id' });
              }
            }

            const { error: bsErr } = await client.from('block_songs').upsert([{
              id: blockSongUUID,
              block_id: blockUUID,
              song_id: songUUID,
              position: item.position !== undefined ? item.position : itemIdx,
              requested_key: mergedKey,
              notes: mergedNotes
            }], { onConflict: 'id' });

            if (bsErr) {
              console.warn('[Sync Member] Could not upsert block_song (RLS policy may be missing):', bsErr.message, {blockId: b.id, songId: catalogSongId, notes: mergedNotes});
            }
          })
        );
      }
    })
  );

  console.log('[Sync Member] Editor edits synced for setlist:', st.id);
}

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

    console.log('[fetchSetlistMembers] Fetched', members.length, 'members for setlist', setlistId);
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
  const targetSetlists = setlists || StorageEngine.getSetlists(); // Removido filtro de usuário
  console.log('[Sync] Target setlists for sync:', JSON.stringify(targetSetlists));
  console.log('[Sync] Raw localStorage string:', localStorage.getItem('repertorio_setlists_v2'));

  try {
    // Ensure the auth session is restored from local storage before making RLS queries
    await client.auth.getSession();

    // FORCE FRESH READ FROM LOCAL STORAGE
    const localSetlists = JSON.parse(localStorage.getItem('repertorio_setlists_v2') || '[]');
    console.log('[Sync] Forcing fresh read from localStorage. Setlists found:', localSetlists.length);
    if (localSetlists.length > 0) {
      console.log('[Sync] First setlist members:', JSON.stringify(localSetlists[0].members));
    }

    // 0. Ensure user profile exists (including email)
    const { error: profileErr } = await client.from('profiles').upsert([
      { id: userIdUUID, display_name: user.name, email: user.email }
    ], { onConflict: 'id' });
    if (profileErr) {
      console.error('[Supabase Profile Upsert Error]', profileErr);
    }

    // Fetch profiles to map member email/names to real user IDs in Supabase (selecting email too)
    const { data: allProfilesData } = await client.from('profiles').select('id, display_name, email');
    const profileEmailMap = new Map<string, string>();
    (allProfilesData || []).forEach((p: any) => {
      const email = (p.email || p.display_name || '').toLowerCase().trim();
      if (email) profileEmailMap.set(email, p.id);
    });

    // 1. Sync Songs — only sync songs that belong to the current logged-in user.
    // Songs from shared setlists (owned by other users) must NOT be re-synced
    // because doing so would violate the RLS policy (songs_insert_own / songs_update_own
    // both require user_id = auth.uid()).
    const ownSongs = targetSongs.filter(
      (s) => !s.userId || toUUID(s.userId) === userIdUUID
    );

    // Delete songs that were deleted locally
    const { data: dbSongs, error: fetchSongsErr } = await client
      .from('songs')
      .select('id')
      .eq('user_id', userIdUUID);

    if (!fetchSongsErr && dbSongs) {
      const localSongUUIDs = new Set(ownSongs.map((s) => toUUID(s.id)));
      const songsToDelete = dbSongs.map((s: any) => s.id).filter((id: string) => !localSongUUIDs.has(id));
      if (songsToDelete.length > 0) {
        const { error: delErr } = await client.from('songs').delete().in('id', songsToDelete);
        if (delErr) {
          console.warn('[Sync] Could not delete songs (RLS policy may prevent this):', delErr.message);
        }
      }
    }

    if (ownSongs.length > 0) {
      const dbSongsData = ownSongs.map((s) => ({
        id: toUUID(s.id),
        user_id: userIdUUID,
        name: s.name,
        artist: s.artist,
        original_key: s.originalKey || '',
        slug: s.slugOverride || '',
        cifra_url: null,
        documents: s.documents || []
      }));

      const { error: songErr } = await client.from('songs').upsert(dbSongsData, { onConflict: 'id' });
      if (songErr) throw new Error(`Erro sincronizando músicas: ${songErr.message}`);
    }

    // Delete setlists that were deleted locally
    const { data: dbSetlists, error: fetchSetlistsErr } = await client
      .from('setlists')
      .select('id')
      .eq('user_id', userIdUUID);

    if (!fetchSetlistsErr && dbSetlists) {
      const ownSetlistUUIDs = new Set(
        targetSetlists
          .filter((st) => !st.ownerEmail || st.ownerEmail.toLowerCase() === user.email.toLowerCase())
          .map((st) => toUUID(st.id))
      );
      const setlistsToDelete = dbSetlists.map((s: any) => s.id).filter((id: string) => !ownSetlistUUIDs.has(id));
      if (setlistsToDelete.length > 0) {
        const { error: delErr } = await client.from('setlists').delete().in('id', setlistsToDelete);
        if (delErr) {
          console.warn('[Sync] Could not delete setlists (RLS policy may prevent this):', delErr.message);
        }
      }
    }

    // 2. Sync Setlists, Blocks, Block Songs, Invites and Members
    for (const st of targetSetlists) {
      const setlistUUID = toUUID(st.id);
      const isOwner = !st.ownerEmail || st.ownerEmail.toLowerCase() === user.email.toLowerCase();

      if (!isOwner) {
        // If the current user is an editor member of this setlist, sync their block edits
        const myMembership = st.members?.find(
          (m) => m.email.toLowerCase() === user.email.toLowerCase()
        );
        if (myMembership?.role === 'edit') {
          await syncMemberEditsToSupabase(client, st, userIdUUID);
        } else {
          // Membership not found locally (e.g. merge overwrote it, or self-join failed).
          // Attempt to create it and then sync block edits.
          const joined = await selfJoinSetlistAsMember(st.id, 'edit');
          if (joined) {
            console.log('[Sync] Self-joined as editor for setlist:', st.id);
            await syncMemberEditsToSupabase(client, st, userIdUUID);
          }
        }
        continue;
      }

      const { error: setlistErr } = await client.from('setlists').upsert([{
        id: setlistUUID,
        user_id: userIdUUID,
        name: st.name,
        updated_at: st.updatedAt || new Date().toISOString()
      }], { onConflict: 'id' });

      if (setlistErr) throw new Error(`Erro sincronizando setlist "${st.name}": ${setlistErr.message}`);

      // Clean up deleted blocks for this setlist
      const { data: dbBlocks, error: fetchBlocksErr } = await client
        .from('blocks')
        .select('id')
        .eq('setlist_id', setlistUUID);

      if (!fetchBlocksErr && dbBlocks) {
        const localBlockUUIDs = new Set((st.blocks || []).map((b) => toUUID(b.id)));
        const blocksToDelete = dbBlocks.map((b: any) => b.id).filter((id: string) => !localBlockUUIDs.has(id));
        if (blocksToDelete.length > 0) {
          const { error: delBlockErr } = await client.from('blocks').delete().in('id', blocksToDelete);
          if (delBlockErr) {
            console.warn('[Sync] Could not delete blocks (RLS policy may prevent this):', delBlockErr.message);
          }
        }
      }

      // Sync Blocks & Block Songs
      if (st.blocks && st.blocks.length > 0) {
        // Phase 1: upsert all blocks in parallel (they are independent of each other)
        await Promise.all(
          st.blocks.map(async (b, blockIdx) => {
            const blockUUID = toUUID(b.id);
            const { error: blockErr } = await client.from('blocks').upsert([{
              id: blockUUID,
              setlist_id: setlistUUID,
              name: b.name,
              theme: b.theme || '',
              position: b.position !== undefined ? b.position : blockIdx
            }], { onConflict: 'id' });
            if (blockErr) throw new Error(`Erro sincronizando bloco "${b.name}": ${blockErr.message}`);
          })
        );

        // Phase 2: process block_songs for each block (blocks now exist, FK is satisfied)
        await Promise.all(
          st.blocks.map(async (b) => {
            const blockUUID = toUUID(b.id);

            // Fetch existing block_songs for this block (merge data before upsert)
            const { data: dbBlockSongs, error: fetchBSErr } = await client
              .from('block_songs')
              .select('id, notes, requested_key')
              .eq('block_id', blockUUID);

            if (!fetchBSErr && dbBlockSongs) {
              const localBSUUIDs = new Set(
                (b.items || []).map((item) => {
                  const catalogSongId = item.catalogSongId || item.id;
                  return toUUID(`${b.id}_${catalogSongId}`);
                })
              );
              const bsToDelete = dbBlockSongs.map((bs: any) => bs.id).filter((id: string) => !localBSUUIDs.has(id));
              if (bsToDelete.length > 0) {
                const { error: delBSErr } = await client.from('block_songs').delete().in('id', bsToDelete);
                if (delBSErr) {
                  console.warn('[Sync] Could not delete block_songs (RLS policy may prevent this):', delBSErr.message);
                }
              }
            }

            // Build a lookup map of existing Supabase values for merge
            const existingBSMap = new Map<string, { notes?: string | null; requested_key?: string }>();
            (dbBlockSongs || []).forEach((bs: any) => {
              existingBSMap.set(bs.id, { notes: bs.notes, requested_key: bs.requested_key });
            });

            if (b.items && b.items.length > 0) {
              await Promise.all(
                b.items.map(async (item, itemIdx) => {
                  const catalogSongId = item.catalogSongId || item.id;
                  const songUUID = toUUID(catalogSongId);
                  const blockSongUUID = toUUID(`${b.id}_${catalogSongId}`);

                  // Merge: preserve existing Supabase values when local has no data
                  const existing = existingBSMap.get(blockSongUUID);
                  const mergedNotes = item.notes || existing?.notes || null;
                  const mergedKey = item.requestedKey || item.songOriginalKey || item.originalKeyAtAssignment || existing?.requested_key || '';

                  const { error: bsErr } = await client.from('block_songs').upsert([{
                    id: blockSongUUID,
                    block_id: blockUUID,
                    song_id: songUUID,
                    position: item.position !== undefined ? item.position : itemIdx,
                    requested_key: mergedKey,
                    notes: mergedNotes
                  }], { onConflict: 'id' });

                  if (bsErr) throw new Error(`Erro vinculando música no bloco: ${bsErr.message}`);
                })
              );
            }
          })
        );
      }

      // Clean up deleted members and invites
      const { data: dbMembers, error: fetchMembersErr } = await client
        .from('setlist_members')
        .select('id, user_id')
        .eq('setlist_id', setlistUUID);

      if (!fetchMembersErr && dbMembers) {
        const localMemberUUIDs = new Set((st.members || []).map((m) => toUUID(`${st.id}_${m.email}`)));
        const membersToDelete = dbMembers
          .filter((m: any) => toUUID(m.user_id) !== userIdUUID)
          .map((m: any) => m.id)
          .filter((id: string) => !localMemberUUIDs.has(id));

        if (membersToDelete.length > 0) {
          const { error: delMemErr } = await client.from('setlist_members').delete().in('id', membersToDelete);
          if (delMemErr) {
            console.error('[Sync] Error deleting member:', delMemErr.message);
          }
        }
      }

      const { data: dbInvites, error: fetchInvitesErr } = await client
        .from('setlist_invites')
        .select('id')
        .eq('setlist_id', setlistUUID);

      if (!fetchInvitesErr && dbInvites) {
        const localInviteUUIDs = new Set(
          (st.members || [])
            .filter((m) => m.status === 'pending')
            .map((m) => toUUID(`invite_${st.id}_${m.email}`))
        );
        const invitesToDelete = dbInvites
          .map((i: any) => i.id)
          .filter((id: string) => {
            if (id === toUUID(`link_share_${st.id}`)) return false;
            return !localInviteUUIDs.has(id);
          });

        if (invitesToDelete.length > 0) {
          const { error: delInvErr } = await client.from('setlist_invites').delete().in('id', invitesToDelete);
          if (delInvErr) {
            console.error('[Sync] Error deleting invite:', delInvErr.message);
          }
        }
      }

      // Sync Members and Pending Invites in parallel
      console.log('[Sync] Setlist ID:', st.id, 'Members array length:', st.members?.length);
      if (st.members && st.members.length > 0) {
        console.log('[Sync] Members data:', JSON.stringify(st.members));
        await Promise.all(
          st.members.map(async (m) => {
            const memberEmailClean = (m.email || '').toLowerCase().trim();
            const targetUserId = profileEmailMap.get(memberEmailClean) || (memberEmailClean === user.email.toLowerCase() ? userIdUUID : null);
            const memberUUID = toUUID(`${st.id}_${m.email}`);

            if (targetUserId) {
              const { error: memErr } = await client.from('setlist_members').upsert([{
                id: memberUUID,
                setlist_id: setlistUUID,
                user_id: targetUserId,
                role: m.role === 'edit' ? 'editor' : 'viewer',
                email: m.email
              }], { onConflict: 'setlist_id,user_id' });

              if (memErr) console.error('[Sync] Error upserting member:', memErr);
              else console.log('[Sync] Member upserted successfully:', m.email);
            } else {
              console.log(`[Sync] Member "${m.email}" has no registered profile in Supabase yet. Skipped setlist_members FK upsert.`);
            }

            // Sync pending invites to setlist_invites table
            if (m.status === 'pending') {
              const inviteId = toUUID(`invite_${st.id}_${m.email}`);
              await client.from('setlist_invites').upsert([{
                id: inviteId,
                setlist_id: setlistUUID,
                inviter_id: userIdUUID,
                invitee_email: m.email,
                status: 'pending'
              }], { onConflict: 'id' });
            }
          })
        );
      }
    }

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
    console.log('[Supabase Fetch] ProfileEmailMap:', Object.fromEntries(profileEmailMap));

    const { data: songsData, error: songsErr } = await client
      .from('songs')
      .select('*')
      .eq('user_id', currentUserUUID);
    const { data: setlistsData, error: setlistsErr } = await client.from('setlists').select('*');
    console.log('[Supabase Fetch] Setlists data query result:', setlistsData, 'Error:', setlistsErr);

    const { data: blocksData, error: blocksErr } = await client.from('blocks').select('*').order('position', { ascending: true });
    const { data: blockSongsData, error: bsErr } = await client.from('block_songs').select('*').order('position', { ascending: true });
    const { data: membersData, error: membersErr } = await client
      .from('setlist_members')
      .select('*')
      .eq('user_id', currentUserUUID);

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
    console.log('[Share Link] Link share enabled in Supabase for setlist:', setlistId);
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
    console.log('[Share Link] Self-join persisted to Supabase. Role:', dbRole);
    return true;
  } catch (e: any) {
    console.error('[Share Link] Exception during self-join:', e);
    return false;
  }
}
