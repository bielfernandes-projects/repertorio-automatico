import { describe, it, expect, vi } from 'vitest';
import { RevisionCache } from './revision-cache';

describe('RevisionCache', () => {
  it('chama o load apenas na primeira leitura e serve a mesma instância', () => {
    const load = vi.fn(() => ({ a: 1 }));
    const cache = new RevisionCache(load);

    const first = cache.get();
    const second = cache.get();

    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('recarrega após invalidate e incrementa a revisão', () => {
    const load = vi.fn(() => ({ a: 1 }));
    const cache = new RevisionCache(load);

    cache.get();
    expect(cache.revision).toBe(0);

    cache.invalidate();
    expect(cache.revision).toBe(1);
    cache.get();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('valores null são cacheados como válidos (não recarrega a cada get)', () => {
    const load = vi.fn(() => null);
    const cache = new RevisionCache<null>(load);

    cache.get();
    cache.get();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('revisões continuam incrementando a cada invalidate', () => {
    const cache = new RevisionCache(() => 0);
    cache.invalidate();
    cache.invalidate();
    cache.invalidate();
    expect(cache.revision).toBe(3);
  });
});
