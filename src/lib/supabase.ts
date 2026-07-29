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

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null default '',
  created_at timestamp with time zone default now() not null
);

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

-- Migração caso a tabela já exista:
-- alter table public.songs add column if not exists documents jsonb default '[]'::jsonb;

create table if not exists public.setlists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  unique(user_id, name)
);

create table if not exists public.blocks (
  id uuid default uuid_generate_v4() primary key,
  setlist_id uuid references public.setlists(id) on delete cascade not null,
  name text not null,
  theme text not null default '',
  position integer not null default 0,
  created_at timestamp with time zone default now() not null
);

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

-- Migração caso a tabela já exista:
-- alter table public.block_songs add column if not exists notes text;

create table if not exists public.setlist_members (
  id uuid default uuid_generate_v4() primary key,
  setlist_id uuid references public.setlists(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamp with time zone default now() not null,
  unique(setlist_id, user_id)
);

create table if not exists public.setlist_invites (
  id uuid default uuid_generate_v4() primary key,
  setlist_id uuid references public.setlists(id) on delete cascade not null,
  inviter_id uuid references public.profiles(id) on delete cascade not null,
  invitee_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamp with time zone default now() not null
);
`;

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
  const targetSetlists = setlists || StorageEngine.getSetlistsForUser(user.email);

  try {
    // Ensure the auth session is restored from local storage before making RLS queries
    await client.auth.getSession();

    // 0. Ensure user profile exists
    const { error: profileErr } = await client.from('profiles').upsert([
      { id: userIdUUID, display_name: user.name }
    ], { onConflict: 'id' });
    if (profileErr) {
      console.error('[Supabase Profile Upsert Error]', profileErr);
    }

    // 1. Sync Songs (Force the current logged in user ID to avoid RLS mismatches)
    if (targetSongs.length > 0) {
      const dbSongs = targetSongs.map((s) => ({
        id: toUUID(s.id),
        user_id: userIdUUID, // Always force logged-in user UUID
        name: s.name,
        artist: s.artist,
        original_key: s.originalKey || '',
        slug: s.slugOverride || '',
        cifra_url: null,
        documents: s.documents || []
      }));

      const { error: songErr } = await client.from('songs').upsert(dbSongs, { onConflict: 'id' });
      if (songErr) throw new Error(`Erro sincronizando músicas: ${songErr.message}`);
    }

    // 2. Sync Setlists, Blocks, Block Songs, Invites and Members
    for (const st of targetSetlists) {
      const setlistUUID = toUUID(st.id);
      const isOwner = !st.ownerEmail || st.ownerEmail.toLowerCase() === user.email.toLowerCase();

      // Only sync setlist data if the current user is the owner
      if (!isOwner) continue;

      const { error: setlistErr } = await client.from('setlists').upsert([{
        id: setlistUUID,
        user_id: userIdUUID,
        name: st.name,
        updated_at: st.updatedAt || new Date().toISOString()
      }], { onConflict: 'id' });

      if (setlistErr) throw new Error(`Erro sincronizando setlist "${st.name}": ${setlistErr.message}`);

      // Sync Blocks & Block Songs
      if (st.blocks && st.blocks.length > 0) {
        for (let blockIdx = 0; blockIdx < st.blocks.length; blockIdx++) {
          const b = st.blocks[blockIdx];
          const blockUUID = toUUID(b.id);

          const { error: blockErr } = await client.from('blocks').upsert([{
            id: blockUUID,
            setlist_id: setlistUUID,
            name: b.name,
            theme: b.theme || '',
            position: b.position !== undefined ? b.position : blockIdx
          }], { onConflict: 'id' });

          if (blockErr) throw new Error(`Erro sincronizando bloco "${b.name}": ${blockErr.message}`);

          if (b.items && b.items.length > 0) {
            for (let itemIdx = 0; itemIdx < b.items.length; itemIdx++) {
              const item = b.items[itemIdx];
              const catalogSongId = item.catalogSongId || item.id;
              const songUUID = toUUID(catalogSongId);
              const blockSongUUID = toUUID(`${b.id}_${catalogSongId}`);

              if (item.songName && item.songArtist) {
                await client.from('songs').upsert([{
                  id: songUUID,
                  user_id: userIdUUID,
                  name: item.songName,
                  artist: item.songArtist,
                  original_key: item.songOriginalKey || item.originalKeyAtAssignment || '',
                  slug: '',
                  cifra_url: null
                }], { onConflict: 'id' });
              }

              const { error: bsErr } = await client.from('block_songs').upsert([{
                id: blockSongUUID,
                block_id: blockUUID,
                song_id: songUUID,
                position: item.position !== undefined ? item.position : itemIdx,
                requested_key: item.requestedKey || item.songOriginalKey || item.originalKeyAtAssignment || '',
                notes: item.notes || null
              }], { onConflict: 'id' });

              if (bsErr) throw new Error(`Erro vinculando música no bloco: ${bsErr.message}`);
            }
          }
        }
      }

      // Sync Members and Pending Invites
      console.log('[Sync] Members to sync:', st.members?.length || 0);
      if (st.members && st.members.length > 0) {
        for (const m of st.members) {
          console.log('[Sync] Processing member:', m.email, m.role, m.status);
          const memberUserUUID = toUUID(m.email);
          const memberUUID = toUUID(`${st.id}_${m.email}`);

          await client.from('profiles').upsert([
            { id: memberUserUUID, display_name: m.email }
          ], { onConflict: 'id' });

          const { error: memErr } = await client.from('setlist_members').upsert([{
            id: memberUUID,
            setlist_id: setlistUUID,
            user_id: memberUserUUID,
            role: m.role === 'edit' ? 'editor' : 'viewer',
            email: m.email
          }], { onConflict: 'id' });
          
          if (memErr) console.error('[Sync] Error upserting member:', memErr);
          else console.log('[Sync] Member upserted successfully');

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
        }
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

    // Fetch all profiles to build a email -> id lookup for member matching
    const { data: allProfilesData } = await client.from('profiles').select('id, display_name');
    const profileEmailMap = new Map<string, string>();
    (allProfilesData || []).forEach((p: any) => {
      const email = (p.display_name || '').toLowerCase().trim();
      if (email) profileEmailMap.set(email, p.id);
    });
    console.log('[Supabase Fetch] ProfileEmailMap:', Object.fromEntries(profileEmailMap));

    const { data: songsData, error: songsErr } = await client.from('songs').select('*');
    const { data: setlistsData, error: setlistsErr } = await client.from('setlists').select('*');
    console.log('[Supabase Fetch] Setlists data query result:', setlistsData, 'Error:', setlistsErr);

    const { data: blocksData, error: blocksErr } = await client.from('blocks').select('*').order('position', { ascending: true });
    const { data: blockSongsData, error: bsErr } = await client.from('block_songs').select('*').order('position', { ascending: true });
    const { data: membersData, error: membersErr } = await client.from('setlist_members').select('*');

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
          let memberEmail = 'membro@repertorio.app';
          for (const [email, uid] of profileEmailMap.entries()) {
            if (uid === memberProfileId) {
              memberEmail = email;
              break;
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
      const setlist: Setlist = {
        id: stRow.id,
        ownerId: stRow.user_id,
        ownerEmail: isOwner ? user.email : (stRow.user_id || 'dono@repertorio.app'),
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
