import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../dist/cache.js';
import { pagination, pageResult, studentWhere } from '../dist/pagination.js';
import { poolConfig } from '../dist/pool-config.js';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function backend() {
  const data = new Map();
  return { data, async get(key) { return data.get(key) ?? null; }, async mGet(keys) { return keys.map(key => data.get(key) ?? null); }, async setEx(key, _ttl, value) { data.set(key, value); }, async del(key) { data.delete(key); }, async incr(key) { data.set(key, String(Number(data.get(key) || 0) + 1)); } };
}
test('pagination caps database reads, rejects invalid controls, and supplies deterministic cursors', () => {
  assert.deepEqual(pagination({}), { page: 1, pageSize: 50, after: '', skip: 0, take: 51 });
  assert.equal(pagination({ page: '3', pageSize: '20' }).skip, 40);
  for (const query of [{ pageSize: '101' }, { page: '0' }, { page: '-1' }, { page: ['1', '2'] }, { pageSize: 'all' }, { page: '2', after: 'id' }]) assert.throws(() => pagination(query));
  const result = pageResult([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 9, pagination({ pageSize: '2' }), row => row.id);
  assert.deepEqual(result.items.map(row => row.id), ['a', 'b']);
  assert.equal(result.nextCursor, 'b');
  assert.equal(result.totalPages, 5);
});
test('student filters bind operator scope independently of client query values', () => {
  const req = { query: { search: 'Budi', className: '6A' }, user: { role: 'operator', schoolNpsn: '11111111' } };
  const where = studentWhere(req);
  assert.equal(where.schoolNpsn, '11111111');
  assert.equal(where.className, '6A');
  assert.equal(where.role, 'siswa');
  assert.throws(() => studentWhere({ ...req, query: { schoolNpsn: '22222222' } }), { status: 403 });
});
test('pool max accounts for every PM2 worker and rejects an impossible budget', () => {
  assert.equal(poolConfig({ APP_WORKERS: '8', DB_POOL_MAX: '20', DB_CONNECTION_BUDGET: '40' }).max, 5);
  assert.equal(poolConfig({ APP_WORKERS: '2', DB_CONNECTION_BUDGET: '40' }).max, 5);
  assert.equal(poolConfig({}).connectionTimeoutMillis, 5000);
  assert.throws(() => poolConfig({ APP_WORKERS: '8', DB_CONNECTION_BUDGET: '4' }));
  for (const env of [{ DB_POOL_MAX: '0' }, { DB_POOL_MAX: 'NaN' }, { APP_WORKERS: '-1' }]) assert.throws(() => poolConfig(env));
});
test('concurrent cold reads coalesce within a worker with Redis disabled', async () => {
  const cache = createCache(() => null), gate = deferred();
  let calls = 0;
  const requests = Array.from({ length: 100 }, () => cache.get('same', 15, async () => { calls++; return gate.promise; }));
  assert.equal(calls, 1);
  gate.resolve({ value: 'database' });
  assert.ok((await Promise.all(requests)).every(value => value.value === 'database'));
  await cache.get('same', 15, async () => { calls++; return {}; });
  assert.equal(calls, 2, 'no mutable per-process result cache without Redis');
});
test('Redis cache hits skip database reads and keys isolate scopes', async () => {
  const redis = backend(), cache = createCache(() => redis);
  let calls = 0;
  const load = async value => { calls++; return { value }; };
  await cache.get('school:a', 15, () => load('A'), ['users']);
  assert.deepEqual(await cache.get('school:a', 15, () => load('wrong'), ['users']), { value: 'A' });
  assert.deepEqual(await cache.get('school:b', 15, () => load('B'), ['users']), { value: 'B' });
  assert.equal(calls, 2);
});
test('invalidation prevents a delayed old fetch from repopulating the current generation across workers', async () => {
  const redis = backend(), a = createCache(() => redis), b = createCache(() => redis), old = deferred();
  const request = a.get('summary', 15, () => old.promise, ['package']);
  await new Promise(resolve => setImmediate(resolve));
  await b.invalidate('package');
  assert.deepEqual(await a.get('summary', 15, async () => ({ value: 'new' }), ['package']), { value: 'new' });
  old.resolve({ value: 'old' });
  await request;
  assert.deepEqual(await b.get('summary', 15, async () => ({ value: 'wrong' }), ['package']), { value: 'new' });
});
test('cache outages and malformed values fall back without caching failures forever', async () => {
  const bad = { ...backend(), async mGet() { throw new Error('offline'); } };
  const cache = createCache(() => bad);
  assert.equal(await cache.get('key', 15, async () => 7), 7);
  await assert.rejects(() => cache.get('fail', 15, async () => { throw new Error('DB unavailable'); }), /DB unavailable/);
  assert.equal(await cache.get('fail', 15, async () => 8), 8);
  const redis = backend(); redis.data.set('tka:v4:key:0', 'invalid JSON');
  assert.equal(await createCache(() => redis).get('key', 15, async () => 9), 9);
});
test('editable exam content bypasses Redis entirely even if an old value exists', async () => {
  const redis = backend(); let reads = 0;
  const cache = createCache(() => { reads++; return redis; });
  redis.data.set('tka:v4:exam:0', JSON.stringify({ content: 'old' }));
  assert.deepEqual(await cache.get('exam', 0, async () => ({ content: 'current' })), { content: 'current' });
  assert.equal(reads, 0);
});
