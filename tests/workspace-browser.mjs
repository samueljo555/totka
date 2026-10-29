// Build first. The real dashboards run against controlled API responses, without a database.
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
const errors = [], requests = [], pack = items => ({ items, total: items.length, page: 1, pageSize: 10, totalPages: 1, hasMore: false, nextCursor: null });
try {
  for (const role of ['super_admin', 'admin', 'operator', 'guru', 'siswa']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(role => {
      localStorage.setItem('tka_auth_user', JSON.stringify({ id: role, role, fullName: 'Nadia Putri Salsabila', nisn: '0000123401', className: 'VI A', schoolNpsn: '20101234', school: { name: 'SD Negeri Harapan Nusantara Indonesia', npsn: '20101234' } }));
      localStorage.setItem('tka_jwt_token', 'workspace-test-token'); localStorage.setItem('tka_token_created_at', String(Date.now())); localStorage.setItem('tka_last_activity_at', String(Date.now()));
    }, role);
    const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      const req = route.request(), url = new URL(req.url()); requests.push({ role, path: url.pathname, search: url.searchParams.get('search'), method: req.method(), authorization: req.headers().authorization });
      const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/auth/session-check') return json({ status: 'valid' });
      if (url.pathname === '/api/overview') return json({ totalUsers: 100, students: 90, teachers: 5, packages: 3 });
      if (url.pathname === '/api/users/classes') return json(['VI A', 'VI B']);
      return json(pack([]));
    });
    await page.goto(`http://127.0.0.1:${web.address().port}/${role.includes('admin') ? 'admin' : role}`);
    await page.locator('.workspace-main h1').waitFor();
    assert.equal(await page.locator('.workspace-topbar-profile strong').innerText(), 'Nadia Putri Salsabila');
    assert.equal(await page.locator('.workspace-desktop-nav .workspace-avatar').innerText(), 'NP');
    const menu = page.getByRole('navigation', { name: 'Menu utama', exact: true });
    const names = await menu.getByRole('button').allTextContents();
    assert.equal(names.length, role.includes('admin') ? 6 : role === 'operator' ? 3 : 1);
    for (const name of names) {
      await menu.getByRole('button', { name, exact: true }).click();
      assert.equal(await page.locator('.workspace-main h1').innerText(), name);
      assert.equal(await menu.getByRole('button', { name, exact: true }).getAttribute('aria-current'), 'page');
    }
    if (role.includes('admin') || role === 'guru') {
      const label = role === 'guru' ? 'Cari soal' : 'Cari data';
      if (role.includes('admin')) await menu.getByRole('button', { name: 'Manajemen Akun', exact: true }).click();
      await page.getByLabel(label, { exact: true }).fill('contoh pencarian');
      if (role.includes('admin')) await menu.getByRole('button', { name: 'Data Sekolah', exact: true }).click();
      else await menu.getByRole('button', { name: 'Bank Soal', exact: true }).click();
      if (role.includes('admin')) assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), '');
      else await page.waitForFunction(() => document.querySelector('[aria-label="Cari soal"]').value === 'contoh pencarian');
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: `/tmp/totka-stage1-${role}.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('.workspace-desktop-nav').isVisible(), false);
    const toggle = page.getByRole('button', { name: 'Buka menu', exact: true });
    await toggle.click();
    const drawer = page.getByRole('dialog'); assert.equal(await drawer.isVisible(), true); assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    // The native dialog traps keyboard focus and makes the page behind it inert.
    for (let i = 0; i < 15; i++) { await page.keyboard.press('Tab'); assert.equal(await drawer.evaluate(el => el.contains(document.activeElement)), true); }
    await page.keyboard.press('Escape'); assert.equal(await drawer.isVisible(), false); await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Buka menu');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    await toggle.click(); await drawer.getByRole('button', { name: names[0], exact: true }).click(); assert.equal(await drawer.isVisible(), false);
    await page.waitForFunction(() => document.activeElement?.tagName === 'H1');
    await toggle.click(); await page.mouse.click(375, 400); assert.equal(await drawer.isVisible(), false);
    await toggle.click(); await page.setViewportSize({ width: 1100, height: 900 }); await page.waitForFunction(() => !document.querySelector('.workspace-nav-dialog').open);
    assert.equal(await page.evaluate(() => document.body.style.overflow), ''); assert.equal(await page.locator('.workspace-desktop-nav').isVisible(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${role} mobile overflow`);
    await page.screenshot({ path: `/tmp/totka-stage1-${role}-mobile.png`, fullPage: true });
    await toggle.click(); await drawer.getByRole('button', { name: 'Keluar', exact: true }).click();
    await page.waitForURL(`http://127.0.0.1:${web.address().port}/`);
    assert.equal(await page.evaluate(() => localStorage.getItem('tka_auth_user')), null);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    await context.close();
  }
  assert.ok(requests.some(r => r.role === 'guru' && r.path === '/api/questions' && r.search === 'contoh pencarian'));
  assert.ok(requests.every(r => r.method === 'GET' && r.authorization === 'Bearer workspace-test-token'));
  assert.deepEqual(errors, []);
  console.log('PASS: real dashboards for all roles, profile/menus/search, mobile focus trap/Escape/backdrop, menu selection, resize, overflow, logout cleanup and authenticated read-only requests.');
} finally { await browser.close(); web.closeAllConnections(); await new Promise(resolve => web.close(resolve)); }
