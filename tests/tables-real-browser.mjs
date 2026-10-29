const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const cwd = process.cwd();
const require = createRequire(cwd + '/backend/package.json');
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
process.env.USE_REDIS = 'false'; process.env.STORAGE_PROVIDER = 'LOCAL';
const { createApp } = await import(cwd + '/backend/dist/app.js');
const { createLoginCardCipher } = await import(cwd + '/backend/dist/login-cards.js');
const url = process.env.INTEGRITY_TEST_DATABASE_URL;
if (!url) throw new Error('Set INTEGRITY_TEST_DATABASE_URL to a disposable PostgreSQL instance.');
const schema = 'tka_browser_' + crypto.randomUUID().replaceAll('-', '');
const admin = new Pool({ connectionString: url });
let pool, prisma, api, web, browser;
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const ddl = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { cwd: cwd + '/backend', encoding: 'utf8' });
  const connection = await admin.connect();
  try { await connection.query(`SET search_path TO "${schema}"`); await connection.query(ddl); } finally { connection.release(); }
  pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 5 });
  prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  const secret = 'browser-performance-secret-with-at-least-32-characters';
  const cipher = createLoginCardCipher(secret);
  await prisma.school.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ npsn: String(10000001 + i), name: `Sekolah ${String(i + 1).padStart(2, '0')}` })) });
  const password = await bcrypt.hash('ABC234', 10);
  const profiles = [{ id: 'admin', role: 'admin', fullName: 'Admin' }, { id: 'op', role: 'operator', fullName: 'Operator', schoolNpsn: '10000001' }, { id: 'guru', role: 'guru', fullName: 'Guru', schoolNpsn: '10000001' }];
  await prisma.user.createMany({ data: [...profiles.map(row => ({ ...row, username: row.id, password, activeToken: `sid-${row.id}` })), ...Array.from({ length: 130 }, (_, i) => { const id = `s${String(i + 1).padStart(3, '0')}`; return { id, username: id, nisn: String(i+1).padStart(10, '0'), fullName: `Siswa ${String(i + 1).padStart(3, '0')}`, role: 'siswa', schoolNpsn: i < 100 ? '10000001' : '10000002', className: i < 100 ? (i % 2 ? '6A' : '6B') : '9A', password, loginCardPassword: cipher.seal(id, 'ABC234'), activeToken: `sid-${id}` }; })] });
  await prisma.question.createMany({ data: Array.from({ length: 27 }, (_, i) => ({ id: `q${String(i + 1).padStart(2, '0')}`, authorId: 'guru', type: 'Pilihan Ganda Sederhana', mapel: i % 2 ? 'Bahasa Indonesia' : 'Matematika', element: 'Bilangan', content: `Soal bank ${String(i + 1).padStart(2, '0')}`, options: [{ text: 'A' }, { text: 'B' }], correctAnswer: [0] })) });
  await prisma.package.createMany({ data: Array.from({ length: 22 }, (_, i) => ({ id: `p${String(i + 1).padStart(2, '0')}`, name: `Paket ${String(i + 1).padStart(2, '0')}`, token: `TOKEN${i + 1}`, status: 'aktif', mapel: 'Matematika' })) });
  await prisma.packageQuestion.createMany({ data: ['q01', 'q02'].map(questionId => ({ packageId: 'p01', questionId })) });
  await prisma.examSession.createMany({ data: Array.from({length:130},(_,i)=>i>=120&&i<125?null:({id:'e'+(i+1),studentId:`s${String(i+1).padStart(3,'0')}`,packageId:'p01',status:i<110?'selesai':i<120?'sedang_mengerjakan':'dibatalkan',totalScore:i<110?(i%4)*25:i<120?80:null,endTime:i<110?new Date():null})).filter(Boolean) });
  await prisma.examSession.create({data:{id:'second-package',studentId:'s001',packageId:'p02',status:'selesai',totalScore:95,endTime:new Date()}});
  await prisma.packageQuestion.create({data:{packageId:'p02',questionId:'q01'}});
  api = createApp(prisma, secret, secret).listen(0, '127.0.0.1'); await new Promise(resolve => api.once('listening', resolve));
  web = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname.startsWith('/api/')) {
      const upstream = http.request({ hostname: '127.0.0.1', port: api.address().port, path: req.url, method: req.method, headers: req.headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
      upstream.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(upstream); return;
    }
    let file = path.join(cwd, 'dist', pathname);
    try { if (!(await fs.stat(file)).isFile()) file = cwd + '/dist/index.html'; } catch { file = cwd + '/dist/index.html'; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream'); res.end(await fs.readFile(file));
  }).listen(0, '127.0.0.1'); await new Promise(resolve => web.once('listening', resolve));
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const open = async role => {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
    const profile = profiles.find(row => row.role === role);
    await context.addInitScript(({ profile, token }) => {
      localStorage.setItem('tka_auth_user', JSON.stringify({ ...profile, school: { npsn: '10000001', name: 'Sekolah 01' } }));
      localStorage.setItem('tka_jwt_token', token); localStorage.setItem('tka_token_created_at', String(Date.now())); localStorage.setItem('tka_last_activity_at', String(Date.now()));
    }, { profile, token: jwt.sign({ id: profile.id, sid: `sid-${profile.id}` }, secret) });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${web.address().port}/${role === 'operator' ? 'operator' : role}`);
    return page;
  };

  const page = await open('admin');
  const requests=[];page.on('request',r=>{if(r.url().includes('/api/'))requests.push(new URL(r.url()));});
  const waitTotal=async(p,total)=>p.locator('.table-counter').filter({hasText:new RegExp(`^${total.toLocaleString('id-ID')} entri$`)}).waitFor();
  const pick=async(p,name)=>{await p.getByRole('button',{name:'Paket try out',exact:true}).click();if(name==='Semua Paket')await p.getByRole('button',{name:'Semua Paket',exact:true}).click();else{await p.getByLabel('Cari paket try out',{exact:true}).fill(name);await p.getByRole('button',{name:new RegExp('^'+name+'\\s*Matematika$')}).click();}};
  const exportCsv=async(p)=>{const waiting=p.waitForEvent('download');await p.getByRole('button',{name:'Unduh CSV Hasil',exact:true}).click();return fs.readFile(await (await waiting).path(),'utf8');};
  await page.getByRole('button',{name:'Analitik Hasil',exact:true}).click();await waitTotal(page,2860);
  assert.equal(await page.locator('tbody tr').count(),10);
  await pick(page,'Paket 01');await waitTotal(page,130);
  await page.getByLabel('Urutkan hasil',{exact:true}).selectOption('score_desc');
  await page.getByRole('button',{name:'Halaman berikutnya',exact:true}).click();
  await page.getByText(/Menampilkan 11–20/).waitFor();
  await page.getByLabel('Jumlah baris Hasil siswa',{exact:true}).selectOption('20');
  await page.getByText(/Menampilkan 1–20/).waitFor();
  await page.getByRole('button',{name:'Ringkas',exact:true}).click();assert.equal(await page.locator('.table-compact').count(),1);
  const csv=await exportCsv(page);assert.equal(csv.trimEnd().split('\n').length,131);assert.match(csv,/Paket Try Out,Mata Pelajaran,NISN/);assert.ok(csv.includes('0000000001'));assert.ok(requests.some(u=>u.pathname.endsWith('/reports/students')&&u.searchParams.has('after')));
  await page.getByRole('combobox',{name:'Semua Sekolah',exact:true}).selectOption('10000002');await waitTotal(page,30);
  await page.getByLabel('Kelas',{exact:true}).selectOption('9A');
  await page.getByLabel('Status pengerjaan',{exact:true}).selectOption('selesai');await waitTotal(page,10);
  await page.getByLabel('Cari data laporan',{exact:true}).fill('Siswa 105');await waitTotal(page,1);
  const filtered=await exportCsv(page);assert.equal(filtered.trimEnd().split('\n').length,2);assert.ok(filtered.includes('0000000105,Siswa 105,10000002,Sekolah 02,0,'));
  await page.getByRole('button',{name:'Reset Filter',exact:true}).click();await waitTotal(page,2860);
  await pick(page,'Paket 22');await waitTotal(page,130);assert.ok((await page.locator('tbody').innerText()).includes('Paket 22'));
  await page.getByRole('button',{name:'Analisis butir soal',exact:true}).click();await waitTotal(page,3);
  assert.equal(await page.getByRole('columnheader',{name:'Paket Try Out',exact:true}).count(),1);
  await pick(page,'Paket 02');await waitTotal(page,1);
  assert.ok((await exportCsv(page)).includes('Paket 02'));
  await page.getByRole('button',{name:'Hasil per sekolah',exact:true}).click();await waitTotal(page,44);
  await pick(page,'Paket 01');await waitTotal(page,2);
  await page.getByRole('row').filter({hasText:'Sekolah 02'}).getByRole('button',{name:'Lihat siswa',exact:true}).click();await waitTotal(page,30);
  await page.getByLabel('Cari data laporan',{exact:true}).fill('does not exist');
  await page.getByText('Belum ada data yang sesuai',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Reset Tampilan',exact:true}).click();await waitTotal(page,2860);
  await page.screenshot({path:'/tmp/totka-tables-admin.png',fullPage:true});
  await page.getByRole('button',{name:'Manajemen Akun',exact:true}).click();
  await page.getByRole('combobox',{name:'Peran pengguna',exact:true}).selectOption('siswa');await waitTotal(page,130);
  await page.getByRole('button',{name:'Nama',exact:true}).click();
  await page.getByRole('row').filter({hasText:'Siswa 130'}).waitFor();
  await page.getByRole('button',{name:'Data Sekolah',exact:true}).click();await waitTotal(page,25);
  await page.getByRole('button',{name:'Paket Try Out',exact:true}).click();await waitTotal(page,22);
  assert.equal(await page.getByRole('columnheader',{name:'Jumlah Soal',exact:true}).count(),1);
  const adminExport=page.waitForEvent('download');await page.getByRole('button',{name:'Unduh CSV',exact:true}).click();const packageCsv=await fs.readFile(await (await adminExport).path(),'utf8');assert.equal(packageCsv.trimEnd().split('\n').length,23);assert.ok(!packageCsv.includes('TOKEN1'));
  await page.getByRole('row').filter({hasText:'Paket 01'}).getByRole('button',{name:'Edit Paket',exact:true}).click();
  await page.getByText('Edit Paket Ujian',{exact:true}).waitFor();await page.getByRole('button',{name:'Batal',exact:true}).click();
  const op=await open('operator');await waitTotal(op,100);
  assert.ok((await op.locator('tbody').innerText()).includes('ABC234'));
  const identityExport=op.waitForEvent('download');await op.getByRole('button',{name:'Unduh CSV',exact:true}).click();const studentCsv=await fs.readFile(await (await identityExport).path(),'utf8');assert.equal(studentCsv.trimEnd().split('\n').length,101);assert.ok(!studentCsv.includes('ABC234'));
  await op.getByRole('button',{name:'Riwayat Ujian',exact:true}).click();await waitTotal(op,101);
  await pick(op,'Paket 02');await waitTotal(op,1);assert.ok((await op.locator('tbody').innerText()).includes('95'));
  assert.ok((await exportCsv(op)).includes('Paket 02'));
  await op.getByRole('button',{name:'Pantau Ujian',exact:true}).click();await op.getByText('TOKEN1',{exact:true}).waitFor();
  await op.getByRole('button',{name:'Lihat peserta',exact:true}).first().click();await waitTotal(op,100);
  assert.equal(await op.getByRole('columnheader',{name:'NISN',exact:true}).count(),1);
  const guru=await open('guru');await waitTotal(guru,27);
  assert.equal(await guru.getByRole('button',{name:'Manajemen Bacaan',exact:true}).count(),0);
  await guru.getByRole('button',{name:'Cuplikan Soal',exact:true}).click();
  await guru.getByLabel('Mata pelajaran soal',{exact:true}).selectOption('Matematika');await waitTotal(guru,14);
  await guru.getByRole('button',{name:'Reset Filter',exact:true}).click();await waitTotal(guru,27);
  // Every administrative table uses one shared scroll container; narrow screens scroll within it.
  for(const p of [page,op,guru]){
    await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.ok(await p.locator('.data-table-scroll').evaluate(el=>el.scrollWidth>el.clientWidth));
  }
  await guru.screenshot({path:'/tmp/totka-tables-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: real API cross-package reports, searchable package picker >20 entries, school drilldown, filters/sorting/page size/density/CSV, admin tables/edit form, operator credentials/history/token/scope, teacher tables, mobile internal scroll.');
} finally {
  await browser?.close();
  if (web) { web.closeAllConnections(); await new Promise(resolve => web.close(resolve)); }
  if (api) { api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); }
  await prisma?.$disconnect(); if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end();
}
