// Accent remover for Cifra Club slugs
export function removeAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Slug generator for Cifra Club URLs
export function toSlug(text: string): string {
  if (!text) return '';
  return removeAccents(text)
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces and hyphens
    .trim()
    .replace(/\s+/g, '-') // Convert spaces to hyphens
    .replace(/-+/g, '-'); // Remove duplicate hyphens
}

// Canonical root note mapping
const NOTE_MAP: { [key: string]: number } = {
  // English
  c: 0,
  'c#': 1,
  db: 1,
  d: 2,
  'd#': 3,
  eb: 3,
  e: 4,
  f: 5,
  'f#': 6,
  gb: 6,
  g: 7,
  'g#': 8,
  ab: 8,
  a: 9,
  'a#': 10,
  bb: 10,
  b: 11,
  // Portuguese
  do: 0,
  dó: 0,
  'do#': 1,
  'dó#': 1,
  reb: 1,
  réb: 1,
  re: 2,
  ré: 2,
  're#': 3,
  'ré#': 3,
  mib: 3,
  míb: 3,
  mi: 4,
  mí: 4,
  fa: 5,
  fá: 5,
  'fa#': 6,
  'fá#': 6,
  solb: 6,
  sol: 7,
  'sol#': 8,
  lab: 8,
  láb: 8,
  la: 9,
  lá: 9,
  'la#': 10,
  'lá#': 10,
  sib: 10,
  si: 11,
};

// Standard display names
const CANONICAL_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function parseRootNoteIndex(keyText?: string): { index: number; isMinor: boolean } | null {
  if (!keyText) return null;
  const clean = removeAccents(keyText.trim().toLowerCase());
  if (!clean) return null;

  const isMinor = clean.includes('m') || clean.includes('menor');

  // Find longest matching root prefix
  let matchedIndex: number | null = null;
  let matchLength = 0;

  for (const [prefix, idx] of Object.entries(NOTE_MAP)) {
    if (clean.startsWith(prefix) && prefix.length > matchLength) {
      matchLength = prefix.length;
      matchedIndex = idx;
    }
  }

  if (matchedIndex === null) return null;
  return { index: matchedIndex, isMinor };
}

// Normalize user typed key to clean display (e.g., "dó#" -> "C#", "re m" -> "Dm")
export function normalizeKeyDisplay(keyText?: string): string {
  if (!keyText) return '';
  const parsed = parseRootNoteIndex(keyText);
  if (!parsed) return keyText.trim();
  const canonicalRoot = CANONICAL_KEYS[parsed.index];
  return parsed.isMinor ? `${canonicalRoot}m` : canonicalRoot;
}

// Compute semitones difference for Cifra Club ?tom={N}
export function computeSemitoneShift(originalKey?: string, requestedKey?: string): number | null {
  if (!originalKey || !requestedKey) return null;
  const orig = parseRootNoteIndex(originalKey);
  const req = parseRootNoteIndex(requestedKey);

  if (orig === null || req === null) return null;

  let shift = (req.index - orig.index) % 12;
  if (shift < 0) shift += 12;

  // Cifra Club uses -6 to +6 relative semitone shift
  if (shift > 6) shift -= 12;

  return shift;
}

// Distinct normalized key options (e.g. catalog tom filter), musically sorted (majors, then minors)
export function extractKeyOptions(originalKeys: string[]): string[] {
  const seen = new Set<string>();
  const options: { key: string; order: number }[] = [];

  originalKeys.forEach((k) => {
    const normalized = normalizeKeyDisplay(k);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);

    const parsed = parseRootNoteIndex(normalized);
    const order = parsed ? parsed.index + (parsed.isMinor ? 12 : 0) : 24;
    options.push({ key: normalized, order });
  });

  return options.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)).map((o) => o.key);
}

// Parse full Cifra Club URL to extract artist/song slugs
export function parseCifraClubUrl(urlOrSlug: string): string {
  let clean = urlOrSlug.trim();
  if (clean.includes('cifraclub.com.br')) {
    try {
      let urlStr = clean;
      if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
        urlStr = 'https://' + urlStr;
      }
      const parsed = new URL(urlStr);
      const pathname = parsed.pathname;
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length >= 2) {
        return `${segments[0]}/${segments[1]}`;
      } else if (segments.length === 1) {
        return segments[0];
      }
    } catch (e) {
      // Ignore URL parse errors, fall back to returning trimmed string
    }
  }
  return clean;
}

// Generate Cifra Club URL for artist + song
export function buildCifraClubUrl(
  artist: string,
  songName: string,
  originalKey?: string,
  requestedKey?: string,
  slugOverride?: string
): { url: string; artistSlug: string; songSlug: string; semitones: number | null } {
  let artistSlug = toSlug(artist) || 'desconocido';
  let songSlug = toSlug(songName) || 'musica';

  if (slugOverride) {
    const cleanOverride = slugOverride.trim();
    if (cleanOverride.includes('/')) {
      const parts = cleanOverride.split('/').filter(Boolean);
      if (parts.length >= 2) {
        artistSlug = parts[0];
        songSlug = parts[1];
      } else if (parts.length === 1) {
        songSlug = parts[0];
      }
    } else {
      songSlug = toSlug(cleanOverride);
    }
  }

  const semitones = computeSemitoneShift(originalKey, requestedKey);
  let url = `https://www.cifraclub.com.br/${artistSlug}/${songSlug}/`;

  if (semitones !== null && semitones !== 0) {
    url += `?tom=${semitones}`;
  }

  return { url, artistSlug, songSlug, semitones };
}

// Deterministic Theme Badge Color based on text hash
const THEME_PALETTES = [
  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
  { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30' },
  { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-400', border: 'border-fuchsia-500/30' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  { bg: 'bg-teal-500/15', text: 'text-teal-400', border: 'border-teal-500/30' },
];

export function getThemeColorStyle(themeText: string) {
  if (!themeText) return THEME_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < themeText.length; i++) {
    hash = themeText.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % THEME_PALETTES.length;
  return THEME_PALETTES[index];
}
