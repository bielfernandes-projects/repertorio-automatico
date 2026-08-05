// Cache de leitura com invalidação por revisão.
//
// Embrulha um "load" caro (ex: JSON.parse + sort de um catálogo com
// base64) para que ele rode UMA vez por ciclo de validade. A interface é
// pequena (get / invalidate / revision) e a implementação concentra o
// comportamento de cache — testável isoladamente sem tocar em localStorage.

export class RevisionCache<T> {
  private current: T | null = null;
  private loaded = false;
  private rev = 0;

  constructor(private readonly load: () => T) {}

  get(): T {
    if (!this.loaded) {
      this.current = this.load();
      this.loaded = true;
    }
    return this.current as T;
  }

  invalidate(): void {
    this.current = null;
    this.loaded = false;
    this.rev++;
  }

  get revision(): number {
    return this.rev;
  }
}
