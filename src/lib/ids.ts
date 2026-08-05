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

/**
 * Canonical tombstone key for an entity. Two users deleting the same
 * entity produce the same key, which drives the unique constraint.
 */
export function deletionKey(entityType: string, entityId: string): string {
  return `deleted_${entityType}_${entityId}`;
}

/**
 * Tombstone id used in the deletions table (deterministic uuid).
 */
export function deletionUUID(entityType: string, entityId: string): string {
  return toUUID(deletionKey(entityType, entityId));
}

import type { CatalogSong } from '../types';

/**
 * Leve fingerprint dos documentos anexados a uma música (id/nome/tipo/tamanho/
 * createdAt — nunca o dataUrl base64). Se o fingerprint não muda entre syncs,
 * o upsert da música omite o campo `documents`, preservando os docs na nuvem.
 */
export function songDocsFingerprint(song: CatalogSong): string {
  const meta = (song.documents || [])
    .map((d) => `${d.id}|${d.name}|${d.type}|${d.fileSize}|${d.createdAt}`)
    .sort()
    .join('~');
  let hash = 0;
  for (let i = 0; i < meta.length; i++) {
    hash = (hash << 5) - hash + meta.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}
