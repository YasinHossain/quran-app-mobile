export class LruCache<TKey, TValue> {
  private readonly values = new Map<TKey, TValue>();

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('LRU cache capacity must be a positive integer');
    }
  }

  get(key: TKey): TValue | undefined {
    const value = this.values.get(key);
    if (value === undefined) return undefined;
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  peek(key: TKey): TValue | undefined {
    return this.values.get(key);
  }

  set(key: TKey, value: TValue): void {
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > this.capacity) {
      const oldestKey = this.values.keys().next().value as TKey | undefined;
      if (oldestKey === undefined) break;
      this.values.delete(oldestKey);
    }
  }

  delete(key: TKey): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }

  get size(): number {
    return this.values.size;
  }
}
