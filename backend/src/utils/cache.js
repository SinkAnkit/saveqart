/**
 * Reusable in-memory TTL cache with bounded size.
 *
 * Evicts the oldest entries (by insertion order) when capacity is exceeded.
 * Entries expire after `ttlMs` milliseconds and are lazily removed on read.
 *
 * Usage:
 *   const { get, set } = createCache({ maxSize: 500, ttlMs: 30 * 60 * 1000 });
 *   const cached = get('key');
 *   if (!cached) { set('key', value); }
 */

function createCache({ maxSize = 500, ttlMs = 30 * 60 * 1000 } = {}) {
  const store = new Map();

  function get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }

  function set(key, value) {
    if (store.size >= maxSize) {
      // Evict ~10% of oldest entries (insertion order)
      const evictCount = Math.max(1, Math.ceil(maxSize * 0.1));
      const keys = Array.from(store.keys()).slice(0, evictCount);
      for (const staleKey of keys) store.delete(staleKey);
    }
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  function clear() {
    store.clear();
  }

  function size() {
    return store.size;
  }

  return { get, set, clear, size };
}

module.exports = { createCache };
