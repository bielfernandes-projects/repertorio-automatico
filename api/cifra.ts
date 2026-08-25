import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { parseCifraClub } from '../src/lib/cifra/parse-cifraclub';
import { buscarLetraLrclib } from '../src/lib/cifra/lrclib';
import { toSlug } from '../src/lib/utils';
import type { CifraLine, CifraSource } from '../src/types';

// Proxy de ingestão de cifra e letra (ADR 0009).
//
// Existe do lado do servidor por três motivos: o Cifra Club bloqueia
// requisição direta do navegador (CORS), a service role key não pode
// chegar ao cliente, e o cache precisa ser compartilhado entre todos
// os usuários — não replicado em cada dispositivo.

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const UA_NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Slug só aceita o que o Cifra Club usa na URL. Barra a montagem de
// caminho arbitrário a partir de query string (path traversal, SSRF).
const SLUG_VALIDO = /^[a-z0-9-]{1,120}$/;

interface Resultado {
  lines: CifraLine[];
  source: CifraSource;
  originalKey?: string;
  syncedLyrics?: string;
  durationSeconds?: number;
  sourceUrl: string;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

async function rasparCifraClub(artistSlug: string, songSlug: string): Promise<Resultado | null> {
  const sourceUrl = `https://www.cifraclub.com.br/${artistSlug}/${songSlug}/`;

  const resposta = await fetch(sourceUrl, { headers: { 'User-Agent': UA_NAVEGADOR } });
  if (!resposta.ok) return null;

  const { lines, originalKey } = parseCifraClub(await resposta.text());
  if (lines.length === 0) return null;

  return { lines, originalKey, source: 'cifraclub', sourceUrl };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'método não suportado' });
    return;
  }

  const artist = texto(req.query.artist);
  const song = texto(req.query.song);
  // `slug` espelha o Override de Slug do catálogo: quando o músico
  // colou uma URL do Cifra Club, ela vence a derivação por nome.
  const slugOverride = texto(req.query.slug);
  const forcarAtualizacao = texto(req.query.refresh) === '1';

  if (!artist || !song) {
    res.status(400).json({ error: 'informe artist e song' });
    return;
  }

  const [artistaOverride, musicaOverride] = slugOverride.split('/');
  const artistSlug = toSlug(artistaOverride || artist);
  const songSlug = toSlug(musicaOverride || song);

  if (!SLUG_VALIDO.test(artistSlug) || !SLUG_VALIDO.test(songSlug)) {
    res.status(400).json({ error: 'artista ou música inválidos' });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    res.status(500).json({ error: 'proxy de cifra não configurado' });
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Cache. Sem TTL de propósito: letra e acorde não mudam, e cada
  // acerto aqui é uma requisição a menos ao Cifra Club.
  if (!forcarAtualizacao) {
    const { data } = await supabase
      .from('cifras_cache')
      .select('*')
      .eq('artist_slug', artistSlug)
      .eq('song_slug', songSlug)
      .maybeSingle();

    if (data) {
      res.setHeader('X-Cifra-Cache', 'hit');
      res.status(200).json(paraResposta(data));
      return;
    }
  }

  // 2. Busca externa: cifra primeiro, letra como fallback.
  let resultado: Resultado | null = null;
  const falhas: string[] = [];

  try {
    resultado = await rasparCifraClub(artistSlug, songSlug);
    if (!resultado) falhas.push('cifraclub: música não encontrada');
  } catch (erro) {
    falhas.push(`cifraclub: ${(erro as Error).message}`);
  }

  if (!resultado) {
    try {
      const letra = await buscarLetraLrclib(artist, song);
      if (letra) {
        resultado = { ...letra, source: 'lrclib' };
      } else {
        falhas.push('lrclib: letra não encontrada');
      }
    } catch (erro) {
      falhas.push(`lrclib: ${(erro as Error).message}`);
    }
  }

  if (!resultado) {
    res.status(404).json({ error: 'cifra e letra não encontradas', detalhes: falhas });
    return;
  }

  // 3. Grava no cache compartilhado. Um upsert concorrente de outra
  // banda pedindo a mesma música é benigno: o conteúdo é o mesmo.
  const linha = {
    artist_slug: artistSlug,
    song_slug: songSlug,
    source: resultado.source,
    original_key: resultado.originalKey ?? null,
    lines: resultado.lines,
    synced_lyrics: resultado.syncedLyrics ?? null,
    duration_seconds: resultado.durationSeconds ?? null,
    source_url: resultado.sourceUrl,
    fetched_at: new Date().toISOString(),
  };

  const { data: gravado, error: erroGravacao } = await supabase
    .from('cifras_cache')
    .upsert(linha, { onConflict: 'artist_slug,song_slug' })
    .select()
    .maybeSingle();

  // Falhar ao cachear não pode impedir o músico de ver a cifra que já
  // foi buscada com sucesso — só custa uma busca a mais da próxima vez.
  res.setHeader('X-Cifra-Cache', erroGravacao ? 'miss-nao-gravado' : 'miss');
  res.status(200).json(paraResposta(gravado ?? linha));
}

function paraResposta(linha: any) {
  return {
    artistSlug: linha.artist_slug,
    songSlug: linha.song_slug,
    source: linha.source as CifraSource,
    originalKey: linha.original_key ?? undefined,
    lines: (linha.lines ?? []) as CifraLine[],
    syncedLyrics: linha.synced_lyrics ?? undefined,
    durationSeconds: linha.duration_seconds ?? undefined,
    sourceUrl: linha.source_url ?? undefined,
    fetchedAt: linha.fetched_at,
  };
}
