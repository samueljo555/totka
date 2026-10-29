import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the real runner helper without reading credentials or reaching a website.
const source = fs.readFileSync(new URL('../scripts/run-live-load.mjs', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('async function api('), source.indexOf('async function availablePort('));
function client(responses) {
  const calls = [];
  const context = vm.createContext({ fixture: { base: 'https://example.invalid' }, token: 'old',
    admin: { username: 'fixture', password: 'fixture' }, assert, URL, AbortSignal,
    fetch: async (url, options) => {
      calls.push({ url, authorization: options.headers.Authorization });
      const next = responses.shift(); assert.ok(next, 'Unexpected extra request');
      return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
    } });
  vm.runInContext(helper, context);
  return { api: context.api, calls };
}
test('live runner renews a rejected admin session and retries an authenticated control operation once', async () => {
  const c = client([{ status: 401, body: { error: 'SESSION_KICKED' } },
    { status: 200, body: { token: 'new', user: { role: 'super_admin' } } },
    { status: 200, body: { status: 'selesai' } }]);
  assert.equal((await c.api('/api/packages/dummy', 'PUT', { status: 'selesai' })).status, 'selesai');
  assert.equal(c.calls.length, 3);
  assert.equal(c.calls[0].authorization, 'Bearer old');
  assert.equal(c.calls[2].authorization, 'Bearer new');
});
test('live runner preserves HTTP errors and does not retry a denied request', async () => {
  const c = client([{ status: 403, body: { error: 'FORBIDDEN' } }]);
  await assert.rejects(c.api('/api/packages/dummy', 'PUT', {}), /HTTP 403 FORBIDDEN/);
  assert.equal(c.calls.length, 1);
});
test('live runner stops after one failed session renewal instead of looping', async () => {
  const c = client([{ status: 401, body: { error: 'TOKEN_EXPIRED' } },
    { status: 200, body: { token: 'new', user: { role: 'admin' } } },
    { status: 401, body: { error: 'UNAUTHORIZED' } }]);
  await assert.rejects(c.api('/api/packages/dummy'), /HTTP 401 UNAUTHORIZED/);
  assert.equal(c.calls.length, 3);
});
