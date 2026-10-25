import { createClient } from 'redis';
import './config.js';

export interface CacheBackend {
  get(key: string): Promise<string | null>;
  mGet(keys: string[]): Promise<(string | null)[]>;
  setEx(key: string, ttl: number, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  incr(key: string): Promise<unknown>;
}

/** Coalesce concurrent misses even without Redis. Revisions prevent a fetch begun
 * before invalidation from repopulating a key that new readers will consume. */
export function createCache(backend: () => CacheBackend | null, namespace = 'tka') {
  if (!/^[A-Za-z0-9:_-]{1,100}$/.test(namespace)) throw new Error('CACHE_NAMESPACE tidak valid.');
  const pending = new Map<string, Promise<unknown>>();
  const generations = new Map<string, number>();
  return {
    async get<T>(key: string, ttl: number, fetcher: () => Promise<T>, tags: string[] = [key]): Promise<T> {
      const local = tags.map(tag => generations.get(tag) || 0).join(':');
      const client = ttl > 0 ? backend() : null;
      let versionedKey: string | null = null;
      if (client) {
        try {
          const revisions = await client.mGet(tags.map(tag => `${namespace}:revision:${tag}`));
          versionedKey = `${namespace}:v4:${key}:${revisions.map(value => value || '0').join(':')}`;
        } catch { /* Bypass Redis on failure; no offline command queue. */ }
      }
      const flightKey = `${key}:${tags.join('|')}:${local}:${versionedKey || 'db'}`;
      const existing = pending.get(flightKey);
      if (existing) return existing as Promise<T>;
      const task = (async () => {
        if (client && versionedKey) {
          try {
            const cached = await client.get(versionedKey);
            if (cached !== null) return JSON.parse(cached) as T;
          } catch { versionedKey = null; }
        }
        const data = await fetcher();
        if (client && versionedKey) {
          try { await client.setEx(versionedKey, ttl, JSON.stringify(data)); }
          catch { /* Cache failure must not fail the database operation. */ }
        }
        return data;
      })().finally(() => { if (pending.get(flightKey) === task) pending.delete(flightKey); });
      pending.set(flightKey, task);
      return task;
    },
    async invalidate(tag: string) {
      generations.set(tag, (generations.get(tag) || 0) + 1);
      const client = backend();
      if (!client) return;
      try { await client.incr(`${namespace}:revision:${tag}`); await client.del(tag); }
      catch { /* Short TTLs limit staleness while Redis is unavailable. */ }
    },
  };
}

const enabled = process.env.USE_REDIS === 'true';
const client = enabled ? createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  disableOfflineQueue: true,
  commandsQueueMaxLength: 1000,
  socket: { connectTimeout: 1000, reconnectStrategy: retries => Math.min(10000, 500 * (retries + 1)) },
}) : null;
if (client) {
  client.on('error', () => { /* Requests fall back to PostgreSQL without logging credentials. */ });
  void client.connect().catch(() => {});
}
const cache = createCache(() => client?.isReady ? client.withCommandOptions({ timeout: 150 }) as unknown as CacheBackend : null, process.env.CACHE_NAMESPACE || 'tka');
export const getOrSetCache = cache.get;
export const deleteCache = cache.invalidate;
export async function closeCache() { if (client?.isOpen) client.destroy(); }
export async function invalidateExamCache(packageId: string) {
  await Promise.all([deleteCache(`analytics:pkg:${packageId}`), deleteCache('analytics:packages'), deleteCache('monitoring')]);
}
