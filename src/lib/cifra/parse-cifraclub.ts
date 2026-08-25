import * as cheerio from 'cheerio';
import type { CifraLine, CifraChord } from '../../types';

// Parser do HTML público do Cifra Club (ADR 0009).
//
// Estrutura da página: um <pre data-chord-content> contendo um <div>
// por par de linhas. Dentro do div, a linha de acordes e a linha de
// letra vêm separadas por \n, e cada acorde é um <b data-chord-name>:
//
//   <div>          <b data-chord-name="C">C</b>       <b ...>Am7</b>
//   Todos os dias quando acordo
//   </div>
//
// A coluna em que o <b> aparece no texto puro é o que alinha o acorde
// à sílaba certa da letra logo abaixo — por isso o parser trabalha com
// deslocamento de caractere, e não com o HTML renderizado.

export interface CifraParseada {
  lines: CifraLine[];
  originalKey?: string;
}

interface AcordeCru {
  offset: number; // posição no texto puro acumulado do <div>
  chord: string;
}

// Percorre os nós do <div> montando o texto puro e anotando em que
// deslocamento cada acorde começou.
function extrairLinhaBruta($: cheerio.CheerioAPI, div: any): { texto: string; acordes: AcordeCru[] } {
  let texto = '';
  const acordes: AcordeCru[] = [];

  const visitar = (no: any): void => {
    if (no.type === 'text') {
      texto += no.data ?? '';
      return;
    }
    if (no.type !== 'tag') return;

    const nome = $(no).attr('data-chord-name');
    if (no.name === 'b' && nome) {
      // O acorde ocupa a coluna onde o texto puro está agora.
      acordes.push({ offset: texto.length, chord: nome.trim() });
      texto += $(no).text();
      return;
    }
    for (const filho of no.children ?? []) visitar(filho);
  };

  for (const filho of div.children ?? []) visitar(filho);
  return { texto, acordes };
}

// Uma sub-linha é "de acordes" quando tudo que não é acorde é espaço.
// É esse teste que distingue a linha que fica ACIMA da letra de uma
// linha de letra que por acaso contenha um <b>.
function ehLinhaDeAcordes(texto: string, acordes: AcordeCru[]): boolean {
  if (acordes.length === 0) return false;
  let semAcordes = texto;
  // Remove da direita para a esquerda para não invalidar os offsets.
  for (const a of [...acordes].sort((x, y) => y.offset - x.offset)) {
    semAcordes = semAcordes.slice(0, a.offset) + semAcordes.slice(a.offset + a.chord.length);
  }
  return semAcordes.trim() === '';
}

export function parseCifraClub(html: string): CifraParseada {
  const $ = cheerio.load(html);

  const pre = $('pre[data-chord-content]').first();
  if (pre.length === 0) {
    throw new Error('bloco de cifra não encontrado na página');
  }

  const originalKey = $('[data-anchor="--chord-tone"]').first().text().trim() || undefined;

  // Cada sub-linha vira um item desta lista antes do pareamento.
  const subLinhas: Array<{ texto: string; acordes: AcordeCru[] }> = [];

  // children, nao find: blocos de tablatura vem em div aninhado, e
  // visitar pai e filho duplicaria o trecho inteiro.
  pre.children('div').each((_, div) => {
    const { texto, acordes } = extrairLinhaBruta($, div);

    // Reparte o bloco nas quebras, reposicionando cada acorde para a
    // coluna relativa à sua própria sub-linha.
    let inicio = 0;
    for (const pedaco of texto.split('\n')) {
      const fim = inicio + pedaco.length;
      subLinhas.push({
        texto: pedaco,
        acordes: acordes
          .filter((a) => a.offset >= inicio && a.offset < fim)
          .map((a) => ({ offset: a.offset - inicio, chord: a.chord })),
      });
      inicio = fim + 1; // +1 pelo \n consumido
    }
  });

  const lines: CifraLine[] = [];

  for (let i = 0; i < subLinhas.length; i++) {
    const atual = subLinhas[i];

    if (!ehLinhaDeAcordes(atual.texto, atual.acordes)) {
      // Linha de letra solta (ou marcador tipo "[Refrão]").
      if (atual.texto.trim() !== '' || atual.acordes.length > 0) {
        lines.push(emitirLinha(atual.texto, atual.acordes));
      }
      continue;
    }

    // Linha de acordes: gruda na letra seguinte, quando existir.
    const proxima = subLinhas[i + 1];
    const temLetra = proxima && proxima.texto.trim() !== '' && !ehLinhaDeAcordes(proxima.texto, proxima.acordes);

    if (temLetra) {
      lines.push(emitirLinha(proxima.texto, atual.acordes));
      i++; // consome a linha de letra
    } else {
      // Intro, virada, final: acordes sem letra embaixo.
      lines.push(emitirLinha(atual.texto, atual.acordes));
    }
  }

  return { lines, originalKey };
}

function paraChord(a: AcordeCru): CifraChord {
  return { position: a.offset, chord: a.chord };
}

// O acorde vive em `chords`, com a coluna onde incide — nunca dentro
// de `text`. Em linhas como "[Intro] C7M  Am7" o nome do acorde está
// no meio do próprio texto; deixá-lo ali faria a interface desenhar o
// acorde duas vezes e poluiria a visualização de letra pura.
// A troca é por ESPAÇO, e não remoção, para preservar as colunas de
// que as posições dependem.
function emitirLinha(texto: string, acordes: AcordeCru[]): CifraLine {
  let limpo = texto;
  for (const a of acordes) {
    if (limpo.slice(a.offset, a.offset + a.chord.length) === a.chord) {
      limpo = limpo.slice(0, a.offset) + ' '.repeat(a.chord.length) + limpo.slice(a.offset + a.chord.length);
    }
  }
  return { text: limpo.replace(/\s+$/, ''), chords: acordes.map(paraChord) };
}
