import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCifraClub } from './parse-cifraclub';

// Fixture reduzido de uma página real do Cifra Club. Os testes rodam
// sem rede: o scraper depende de HTML de terceiros e vai quebrar um
// dia, mas isso não pode quebrar o CI.
const html = readFileSync(
  join(__dirname, '__fixtures__', 'cifraclub-tempo-perdido.html'),
  'utf-8',
);

describe('parseCifraClub', () => {
  it('extrai o tom da música', () => {
    expect(parseCifraClub(html).originalKey).toBe('Em');
  });

  it('alinha cada acorde à coluna da sílaba correspondente', () => {
    const { lines } = parseCifraClub(html);
    const linha = lines.find((l) => l.text === 'Todos os dias quando acordo');

    expect(linha).toBeDefined();
    expect(linha!.chords).toEqual([
      { position: 10, chord: 'C' },
      { position: 28, chord: 'Am7' },
    ]);
  });

  it('nunca deixa o nome do acorde dentro do texto da letra', () => {
    // Regressão: linhas como "[Intro] C7M  Am7" traziam o acorde no
    // texto E em `chords`, o que faria a interface desenhá-lo duas
    // vezes e poluiria a visualização de letra pura da cantora.
    const { lines } = parseCifraClub(html);

    for (const l of lines) {
      for (const c of l.chords) {
        expect(l.text.slice(c.position, c.position + c.chord.length)).not.toBe(c.chord);
      }
    }

    const intro = lines.find((l) => l.text.trim() === '[Intro]');
    expect(intro).toBeDefined();
    expect(intro!.chords.map((c) => c.chord)).toEqual(['C7M', 'Am7', 'Bm7', 'Em']);
  });

  it('não duplica linhas de blocos de tablatura aninhados', () => {
    // Regressão: `pre.find('div')` visitava div pai e div aninhado,
    // repetindo o bloco inteiro de tablatura.
    const { lines } = parseCifraClub(html);

    // Antes da correção o parser produzia 147 linhas para esta página
    // porque visitava pai e filho; o valor correto é 94.
    expect(lines.length).toBe(94);

    // Não dá para exigir ausência de linhas repetidas: refrão repetido
    // e cordas vazias da tablatura são idênticos de forma legítima. O
    // que trava a regressão é a contagem exata acima.
  });

  it('preserva a letra cantável sem acordes embutidos', () => {
    const { lines } = parseCifraClub(html);
    const comLetra = lines.filter((l) => l.text.trim() !== '');
    expect(comLetra.length).toBeGreaterThan(10);
    expect(lines.some((l) => l.text === 'Todos os dias quando acordo')).toBe(true);
  });

  it('preserva acordes de trechos sem letra, como a introdução', () => {
    const { lines } = parseCifraClub(html);
    const intro = lines.find((l) => l.chords.some((c) => c.chord === 'C7M'));

    expect(intro).toBeDefined();
    expect(intro!.chords.map((c) => c.chord)).toContain('C7M');
  });

  it('falha de forma explícita quando a página não tem bloco de cifra', () => {
    expect(() => parseCifraClub('<html><body>sem cifra</body></html>')).toThrow(
      /bloco de cifra não encontrado/,
    );
  });
});
