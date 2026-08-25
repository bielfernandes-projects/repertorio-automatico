import { describe, expect, it } from 'vitest';
import { buscarLetraLrclib } from './lrclib';

function respostaFalsa(status: number, corpo?: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => corpo,
    }) as unknown as Response) as unknown as typeof fetch;
}

describe('buscarLetraLrclib', () => {
  it('converte a letra em linhas sem acorde', async () => {
    const letra = await buscarLetraLrclib('Legião Urbana', 'Tempo Perdido', respostaFalsa(200, {
      id: 42,
      plainLyrics: 'Todos os dias quando acordo\nNão tenho mais o tempo que passou',
      syncedLyrics: '[00:11.33] Todos os dias quando acordo',
      duration: 196,
    }));

    expect(letra).not.toBeNull();
    expect(letra!.lines).toEqual([
      { text: 'Todos os dias quando acordo', chords: [] },
      { text: 'Não tenho mais o tempo que passou', chords: [] },
    ]);
    expect(letra!.durationSeconds).toBe(196);
    expect(letra!.syncedLyrics).toContain('[00:11.33]');
  });

  it('devolve null quando a música não existe', async () => {
    expect(await buscarLetraLrclib('X', 'Y', respostaFalsa(404))).toBeNull();
  });

  it('devolve null para faixa instrumental, que não tem o que exibir', async () => {
    const letra = await buscarLetraLrclib('X', 'Y', respostaFalsa(200, {
      instrumental: true,
      plainLyrics: '',
    }));
    expect(letra).toBeNull();
  });

  it('propaga erro do serviço para que o Sentry registre a queda da fonte', async () => {
    await expect(buscarLetraLrclib('X', 'Y', respostaFalsa(503))).rejects.toThrow(/503/);
  });
});
