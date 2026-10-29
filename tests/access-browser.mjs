// Build first. The real public pages use controlled API responses; no credentials/database are changed.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve('dist');
const web = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  let file = path.join(root, pathname);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  try { if (!(await fs.stat(file)).isFile()) file = path.join(root, 'index.html'); } catch { file = path.join(root, 'index.html'); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream');
  res.end(await fs.readFile(file));
}).listen(0, '127.0.0.1');
await new Promise(resolve => web.once('listening', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const base = `http://127.0.0.1:${web.address().port}`, errors = [];
async function fixture() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  const state = { mode: 'invalid', requests: [], held: null, role: 'siswa' };
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/login') {
      const body = req.postDataJSON(); state.requests.push(body);
      const success = () => json({ token: 'test-token-' + state.role, user: { id: 'id-' + state.role, role: state.role, fullName: 'Siswa Akun Uji', nisn: body.username, className: 'VI A', school: { name: 'Sekolah Uji', npsn: '000001' } } });
      if (state.mode === 'hold') { state.held = () => success().catch(() => {}); return; }
      if (state.mode === 'network') return route.abort('failed');
      if (state.mode === 'server') return route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>Unavailable</h1>' });
      if (state.mode === 'rate') return json({ error: 'RATE_LIMITED' }, 429);
      if (state.mode === 'malformed') return json({ token: 'invalid', user: { id: 'x', role: 'unknown' } });
      if (state.mode === 'invalid') return json({ error: 'Invalid username or password' }, 401);
      return success();
    }
    if (url.pathname === '/api/auth/session-check') return json({ status: 'valid' });
    if (url.pathname === '/api/overview') return json({ totalUsers: 1, students: 1, teachers: 0, packages: 0 });
    if (url.pathname === '/api/users/classes') return json([]);
    return json({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1, hasMore: false, nextCursor: null });
  });
  return { context, page, state };
}
const credentials = async page => { await page.getByLabel('Username / NISN', { exact: true }).fill('0000123401'); await page.getByLabel('Password', { exact: true }).fill(' pA$123 '); };
const submit = page => page.getByRole('button', { name: 'Masuk ke sistem', exact: true }).click();
const noOverflow = async (page, label) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, label);
try {
  const { context, page, state } = await fixture();
  await page.goto(base); await page.getByRole('heading', { name: /Siap melangkah/ }).waitFor();
  assert.equal(await page.title(), 'TOTKA JU1 / Try Out TKA Jakarta Utara I');
  assert.equal(await page.locator('.access-role-card').count(), 4);
  for (const [role, name] of [['siswa', 'Siswa'], ['operator', 'Operator Sekolah'], ['guru', 'Guru Penulis'], ['super_admin', 'Super Admin']]) {
    await page.getByRole('link', { name: `Masuk sebagai ${name}`, exact: true }).click(); await page.waitForURL(`${base}/login/${role}`);
    assert.equal(await page.getByLabel('Peran akses', { exact: true }).inputValue(), role);
    await page.getByRole('link', { name: 'Kembali ke beranda', exact: true }).click();
  }
  await page.screenshot({ path: '/tmp/totka-stage2-landing.png', fullPage: true });
  await page.getByRole('link', { name: 'Mulai sebagai siswa', exact: true }).click();
  await submit(page); assert.equal(state.requests.length, 0); // Native required-field validation.
  await credentials(page);
  await page.getByRole('button', { name: 'Tampilkan password', exact: true }).click(); assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'text'); assert.equal(state.requests.length, 0);
  await page.getByRole('button', { name: 'Sembunyikan password', exact: true }).click();
  await submit(page); await page.getByRole('alert').getByText(/Username\/NISN atau password tidak sesuai/).waitFor();
  assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('aria-invalid'), 'true');
  await page.waitForFunction(() => document.activeElement?.id === 'login-error');
  assert.deepEqual(state.requests[0], { username: '0000123401', password: ' pA$123 ' });
  await page.screenshot({ path: '/tmp/totka-stage2-login-error.png', fullPage: true });
  for (const [mode, message] of [['network', 'Tidak dapat terhubung.'], ['server', 'Login belum berhasil diproses.'], ['rate', 'Terlalu banyak percobaan masuk.'], ['malformed', 'Respons login belum dapat diproses.']]) {
    state.mode = mode; await submit(page); await page.getByRole('alert').getByText(new RegExp(message.replaceAll('.', '\\.'))).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('tka_jwt_token')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('tka_auth_user')), null);
  }
  await page.getByRole('button', { name: 'Tampilkan password', exact: true }).click();
  await page.getByLabel('Peran akses', { exact: true }).selectOption('guru');
  // Route effects clear credentials after navigation commits.
  await page.waitForFunction(() => document.querySelector('#password')?.value === '');
  assert.equal(await page.getByLabel('Password', { exact: true }).inputValue(), ''); assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'password');
  assert.equal(await page.getByRole('alert').count(), 0);
  await credentials(page); state.mode = 'hold'; const count = state.requests.length; await submit(page);
  await page.getByRole('button', { name: 'Memproses...', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Peran akses', { exact: true }).isDisabled(), true);
  await page.locator('form').evaluate(el => { el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  assert.equal(state.requests.length, count + 1);
  await page.getByRole('link', { name: 'Kembali ke beranda', exact: true }).click(); await state.held();
  assert.equal(await page.evaluate(() => localStorage.getItem('tka_auth_user')), null); assert.equal(new URL(page.url()).pathname, '/');
  for (const width of [320, 390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await noOverflow(page, `landing ${width}`);
    await page.getByRole('link', { name: 'Mulai sebagai siswa', exact: true }).click(); await noOverflow(page, `login ${width}`);
    if (width === 390) await page.screenshot({ path: '/tmp/totka-stage2-login-mobile.png', fullPage: true });
    if (width === 1440) await page.screenshot({ path: '/tmp/totka-stage2-login.png', fullPage: true });
    await page.getByRole('link', { name: 'Pilih akses', exact: true }).click(); await page.waitForURL(`${base}/#akses`);
    await page.waitForFunction(() => { const section = document.getElementById('akses'); return section && Math.abs(section.getBoundingClientRect().top) < innerHeight; });
  }
  await context.close();
  // The destination is determined by the returned account, even when the selected role differs.
  for (const role of ['siswa', 'operator', 'guru', 'admin', 'super_admin']) {
    const f = await fixture(); f.state.mode = 'success'; f.state.role = role;
    await f.page.goto(base + '/login/siswa'); await credentials(f.page); await submit(f.page);
    await f.page.waitForURL(base + (role.includes('admin') ? '/admin' : '/' + role));
    assert.equal(await f.page.evaluate(() => localStorage.getItem('tka_jwt_token')), 'test-token-' + role);
    const stored = await f.page.evaluate(() => JSON.parse(localStorage.getItem('tka_auth_user'))); assert.equal(stored.role, role); assert.equal(stored.password, undefined);
    if (role === 'siswa') { assert.ok(await f.page.getByPlaceholder('Masukkan Token').isVisible()); assert.equal(f.state.requests.length, 1); }
    await f.context.close();
  }
  const timed = await fixture(); await timed.page.clock.install(); timed.state.mode = 'hold';
  await timed.page.goto(base + '/login/siswa'); await credentials(timed.page); await submit(timed.page); await timed.page.waitForFunction(() => document.querySelector('form').getAttribute('aria-busy') === 'true');
  await timed.page.clock.runFor(15100); await timed.page.getByRole('alert').getByText(/Permintaan masuk terlalu lama/).waitFor();
  assert.equal(await timed.page.getByRole('button', { name: 'Masuk ke sistem', exact: true }).isEnabled(), true);
  await timed.state.held(); await timed.context.close();
  assert.deepEqual(errors, []);
  console.log('PASS: public role links, responsive pages, required inputs, password toggle, exact credential payload, errors/retry, duplicate guard/abort/timeout, server-role redirects and existing token flow.');
} finally { await browser.close(); web.closeAllConnections(); await new Promise(resolve => web.close(resolve)); }
