/** In-memory TTL cache that also de-duplicates concurrent loads of the same key. */
export class TtlCache {
  constructor(ttlMs, now = Date.now) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  async wrap(key, load) {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value;

    const value = load();
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    try {
      return await value;
    } catch (err) {
      this.entries.delete(key); // never cache failures
      throw err;
    }
  }
}
