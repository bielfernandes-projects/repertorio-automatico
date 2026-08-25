import type { CifraLine } from '../../types';

// Cliente da LRCLIB (ADR 0009), fonte de fallback para letra-apenas.
// Não exige API key. Escolhida no lugar da Vagalume — que saiu do ar
// durante o planejamento, derrubando junto o portal de geração de
// token — porque é MIT e auto-hospedável: se o serviço público cair,
// a instância pode ser nossa.

const BASE = 'https://lrclib.net/api/get';

// A LRCLIB pede, por cortesia, que clientes se identifiquem.
const USER_AGENT = 'SetSync (https://github.com/bielfernandes-projects/repertorio-automatico)';

export interface LetraLrclib {
  lines: CifraLine[];
  syncedLyrics?: string;
  durationSeconds?: number;
  sourceUrl: string;
}

interface RespostaLrclib {
  id?: number;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  duration?: number | null;
  instrumental?: boolean;
}

export async function buscarLetraLrclib(
  artist: string,
  track: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LetraLrclib | null> {
  const url = `${BASE}?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`;

  const resposta = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
  if (resposta.status === 404) return null;
  if (!resposta.ok) {
    throw new Error(`LRCLIB respondeu ${resposta.status}`);
  }

  const dados = (await resposta.json()) as RespostaLrclib;
  if (dados.instrumental) return null;

  const plain = (dados.plainLyrics ?? '').trim();
  if (!plain) return null;

  return {
    // Sem acordes: a fonte só tem letra. `chords` vazio é o que faz a
    // interface saber que não há cifra para exibir a quem toca.
    lines: plain.split('\n').map((linha): CifraLine => ({ text: linha.replace(/\s+$/, ''), chords: [] })),
    syncedLyrics: dados.syncedLyrics ?? undefined,
    durationSeconds: dados.duration ?? undefined,
    sourceUrl: dados.id ? `https://lrclib.net/api/get/${dados.id}` : url,
  };
}
