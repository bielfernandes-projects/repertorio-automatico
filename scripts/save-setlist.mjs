#!/usr/bin/env node

/**
 * save-setlist.mjs
 *
 * Salva um setlist específico no Supabase com todos os seus blocos,
 * músicas e referências (block_songs).
 *
 * Uso:
 *   node scripts/save-setlist.mjs <setlist-id>
 *   node scripts/save-setlist.mjs <setlist-id> --data-file=export.json
 *
 * Requer as variáveis de ambiente:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (opcional, senão lê de --service-key)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Utils ──────────────────────────────────────────────────────────────────

function toUUID(id) {
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

// ── Config ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const setlistId = args.find(a => !a.startsWith('--'));
const dataFileArg = args.find(a => a.startsWith('--data-file='));
const dataFile = dataFileArg ? dataFileArg.split('=')[1] : null;
const serviceKeyArg = args.find(a => a.startsWith('--service-key='));
const serviceRoleKey = serviceKeyArg ? serviceKeyArg.split('=')[1] : (process.env.SUPABASE_SERVICE_ROLE_KEY || '');

// Try to load .env if exists
const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^"(.*)"$/, '$1');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;

if (!setlistId && !dataFile) {
  console.error('Uso: node scripts/save-setlist.mjs <setlist-id> [--data-file=export.json] [--service-key=key]');
  process.exit(1);
}

if (!supabaseUrl) {
  console.error('ERRO: Defina VITE_SUPABASE_URL no .env');
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error('ERRO: Defina SUPABASE_SERVICE_ROLE_KEY no .env ou passe --service-key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ── Main ────────────────────────────────────────────────────────────────────

async function loadFromDataFile(filePath) {
  const raw = readFileSync(resolve(filePath), 'utf-8');
  const allSetlists = JSON.parse(raw);
  const setlist = allSetlists.find(s => s.id === setlistId);
  if (!setlist) {
    throw new Error(`Setlist ${setlistId} não encontrado no arquivo.`);
  }
  return setlist;
}

async function loadFromSupabase(sid) {
  const setlistUUID = toUUID(sid);

  const { data: st, error: stErr } = await supabase
    .from('setlists')
    .select('*')
    .eq('id', setlistUUID)
    .maybeSingle();
  if (stErr || !st) throw new Error(`Setlist não encontrado no Supabase: ${stErr?.message || 'não existe'}`);

  const { data: blocks } = await supabase
    .from('blocks')
    .select('*')
    .eq('setlist_id', setlistUUID)
    .order('position');

  const blockIds = (blocks || []).map(b => b.id);

  const { data: blockSongs } = await supabase
    .from('block_songs')
    .select('*')
    .in('block_id', blockIds.length > 0 ? blockIds : ['00000000-0000-4000-a000-000000000000'])
    .order('position');

  const songIds = [...new Set((blockSongs || []).map(bs => bs.song_id))];

  const { data: songs } = await supabase
    .from('songs')
    .select('*')
    .in('id', songIds.length > 0 ? songIds : ['00000000-0000-4000-a000-000000000000']);

  return { setlist: st, blocks: blocks || [], blockSongs: blockSongs || [], songs: songs || [] };
}

async function saveFromSupabaseData({ setlist, blocks, blockSongs, songs }) {
  console.log(`\nSetlist: ${setlist.name || setlist.id}`);

  if (songs.length > 0) {
    const songsPayload = songs.map(s => ({
      id: s.id,
      user_id: s.user_id,
      name: s.name,
      artist: s.artist,
      original_key: s.original_key || '',
      slug: s.slug || '',
      cifra_url: s.cifra_url || null,
      documents: s.documents || []
    }));
    const { error: e } = await supabase.from('songs').upsert(songsPayload, { onConflict: 'id' });
    if (e) throw new Error(`Erro em songs: ${e.message}`);
    console.log(`  ${songs.length} música(s) — OK`);
  }

  const { error: stErr } = await supabase.from('setlists').upsert([{
    id: setlist.id,
    user_id: setlist.user_id,
    name: setlist.name,
    updated_at: setlist.updated_at || new Date().toISOString()
  }], { onConflict: 'id' });
  if (stErr) throw new Error(`Erro em setlists: ${stErr.message}`);
  console.log(`  Setlist — OK`);

  if (blocks.length > 0) {
    await Promise.all(blocks.map(async (b) => {
      const { error: e } = await supabase.from('blocks').upsert([{
        id: b.id,
        setlist_id: b.setlist_id,
        name: b.name,
        theme: b.theme || '',
        position: b.position
      }], { onConflict: 'id' });
      if (e) throw new Error(`Erro em blocks: ${e.message}`);
    }));
    console.log(`  ${blocks.length} bloco(s) — OK`);
  }

  if (blockSongs.length > 0) {
    await Promise.all(blockSongs.map(async (bs) => {
      const { error: e } = await supabase.from('block_songs').upsert([{
        id: bs.id,
        block_id: bs.block_id,
        song_id: bs.song_id,
        position: bs.position,
        requested_key: bs.requested_key || '',
        notes: bs.notes || null
      }], { onConflict: 'id' });
      if (e) throw new Error(`Erro em block_songs: ${e.message}`);
    }));
    console.log(`  ${blockSongs.length} música(s) nos blocos — OK`);
  }

  console.log('\n✓ Setlist salvo com sucesso!\n');
}

async function saveFromDataFile(filePath) {
  const raw = readFileSync(resolve(filePath), 'utf-8');
  const allSetlists = JSON.parse(raw);
  const user = JSON.parse(readFileSync(resolve(filePath.replace('setlists', 'user')), 'utf-8') || '{}');

  const setlist = allSetlists.find(s => s.id === setlistId);
  if (!setlist) throw new Error(`Setlist ${setlistId} não encontrado no arquivo.`);

  const allSongs = JSON.parse(readFileSync(resolve(filePath.replace('setlists', 'catalog')), 'utf-8') || '[]');

  const setlistUUID = toUUID(setlist.id);
  const userIdUUID = toUUID(user.id || setlist.ownerId);

  // Upsert setlist
  const { error: stErr } = await supabase.from('setlists').upsert([{
    id: setlistUUID,
    user_id: userIdUUID,
    name: setlist.name,
    updated_at: setlist.updatedAt || new Date().toISOString()
  }], { onConflict: 'id' });
  if (stErr) throw new Error(`Setlist upsert error: ${stErr.message}`);

  // Upsert blocks + block songs
  if (setlist.blocks) {
    await Promise.all(setlist.blocks.map(async (b, idx) => {
      const blockUUID = toUUID(b.id);
      const { error: bErr } = await supabase.from('blocks').upsert([{
        id: blockUUID,
        setlist_id: setlistUUID,
        name: b.name,
        theme: b.theme || '',
        position: b.position !== undefined ? b.position : idx
      }], { onConflict: 'id' });
      if (bErr) throw new Error(`Block upsert error: ${bErr.message}`);

      if (b.items) {
        await Promise.all(b.items.map(async (item, itemIdx) => {
          const catalogSongId = item.catalogSongId || item.id;
          const songUUID = toUUID(catalogSongId);
          const blockSongUUID = toUUID(`${b.id}_${catalogSongId}`);

          // Upsert the song if found in catalog
          const song = allSongs.find(s => s.id === catalogSongId);
          if (song) {
            await supabase.from('songs').upsert([{
              id: songUUID,
              user_id: userIdUUID,
              name: song.name,
              artist: song.artist,
              original_key: song.originalKey || '',
              slug: song.slugOverride || '',
              documents: song.documents || []
            }], { onConflict: 'id' }).catch(() => {});
          }

          const { error: bsErr } = await supabase.from('block_songs').upsert([{
            id: blockSongUUID,
            block_id: blockUUID,
            song_id: songUUID,
            position: item.position !== undefined ? item.position : itemIdx,
            requested_key: item.requestedKey || '',
            notes: item.notes || null
          }], { onConflict: 'id' });
          if (bsErr) throw new Error(`Block song upsert error: ${bsErr.message}`);
        }));
      }
    }));
  }

  console.log(`\n✓ Setlist "${setlist.name}" salvo com sucesso (via ${filePath})!\n`);
}

// ── Run ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    if (dataFile) {
      await saveFromDataFile(dataFile);
    } else {
      console.log(`Buscando setlist ${setlistId} no Supabase...`);
      const data = await loadFromSupabase(setlistId);
      await saveFromSupabaseData(data);
    }
  } catch (err) {
    console.error('\n✗ Erro:', err.message);
    process.exit(1);
  }
})();
