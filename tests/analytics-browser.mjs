// Run after npm run build. Set PLAYWRIGHT_MODULE to a local Playwright installation.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve('dist');
const web = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  let file = path.join(root, pathname);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try { if (!(await fs.stat(file)).isFile()) file = path.join(root, 'index.html'); }
  catch { file = path.join(root, 'index.html'); }
  const ext = path.extname(file);
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[ext] || 'application/octet-stream');
  res.end(await fs.readFile(file));
});
web.listen(0, '127.0.0.1');
await new Promise(resolve => web.once('listening', resolve));
let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('tka_auth_user',JSON.stringify({id:'admin',role:'super_admin',fullName:'Super Admin'}));
    localStorage.setItem('tka_jwt_token','test-only');localStorage.setItem('tka_token_created_at',String(Date.now()));localStorage.setItem('tka_last_activity_at',String(Date.now()));
  });
  const pack=(items, cursor=null, total=items.length)=>({items,total,page:1,pageSize:100,totalPages:2,hasMore:!!cursor,nextCursor:cursor});
  let failSummary=true, failItems=true, exportFails=true, heldSummary, heldExport;
  let summaryRequests=0, exportRequests=0, downloads=0;
  page.on('download',()=>downloads++);
  const row={id:'s',studentName:'Nama, "A"\nBaru',nisn:'000123',npsn:'001',school:'Sekolah',score:0,status:'Selesai',elementBreakdown:{}};
  const summary={summary:{totalStudents:0,startedCount:0,ongoingCount:0,finishedCount:0,notStartedCount:0,otherCount:0},schools:[]};
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname==='/api/auth/session-check')return json({status:'valid'});
    if(url.pathname==='/api/users/classes')return json([]);
    if(url.pathname==='/api/overview')return json({totalUsers:0,students:0,teachers:0,packages:2});
    if(url.pathname==='/api/analytics/packages')return json(pack([{id:'p',name:'Paket A',mapel:'Matematika'},{id:'b',name:'Paket B',mapel:'Matematika'}]));
    if(url.pathname==='/api/analytics/packages/p'){
      summaryRequests++;
      if(failSummary)return json({message:'Ringkasan gagal diuji'},503);
      if(summaryRequests===3){heldSummary=()=>json({...summary,schools:[{name:'SEKOLAH RESPONS LAMA',npsn:'old'}]});return;}
      return json(summary);
    }
    if(url.pathname==='/api/analytics/packages/b')return json(summary);
    if(url.pathname.endsWith('/items')){
      if(failItems)return route.abort('failed');
      return json({totalParticipants:0,items:[]});
    }
    if(url.pathname.endsWith('/all-students')){
      exportRequests++;
      if(!url.searchParams.get('after'))return json(pack([row],'page2',2));
      if(exportFails){heldExport=()=>json({message:'Halaman ekspor kedua gagal'},503);return;}
      return json(pack([{...row,id:'s2',score:null}],null,2));
    }
    return json(pack([]));
  });
  const base=`http://127.0.0.1:${web.address().port}/admin`;
  const results=async()=>{await page.goto(base);await page.getByRole('button',{name:'Analitik Hasil',exact:true}).click();};
  const packageRow=name=>page.getByRole('row').filter({hasText:name});
  await results();await packageRow('Paket A').getByRole('button',{name:'Lihat Analitik',exact:true}).click();
  await page.getByText('Ringkasan gagal diuji',{exact:true}).waitFor();
  failSummary=false;await page.getByRole('button',{name:'Coba Lagi',exact:true}).click();
  await page.getByText('Belum ada data sekolah.',{exact:true}).waitFor();
  // Start a delayed request, leave its context and select a different package.
  await page.locator('button').filter({has:page.locator('svg.lucide-chevron-left')}).click();
  await packageRow('Paket A').getByRole('button',{name:'Lihat Analitik',exact:true}).click();
  await page.getByText('Memuat data sekolah...', {exact:true}).waitFor();
  await page.locator('button').filter({has:page.locator('svg.lucide-chevron-left')}).click();
  await packageRow('Paket B').getByRole('button',{name:'Lihat Analitik',exact:true}).click();
  await page.getByText('Belum ada data sekolah.',{exact:true}).waitFor();
  await heldSummary().catch(()=>{});
  assert.equal(await page.getByText('SEKOLAH RESPONS LAMA').count(),0);
  await results();await packageRow('Paket A').getByRole('button',{name:'Butir Soal',exact:true}).click();
  await page.getByRole('button',{name:'Coba Lagi',exact:true}).waitFor();
  failItems=false;await page.getByRole('button',{name:'Coba Lagi',exact:true}).click();
  await page.getByText('Belum ada soal pada paket ini.',{exact:true}).waitFor();
  await results();await packageRow('Paket A').getByRole('button',{name:'Unduh CSV',exact:true}).click();
  await page.getByRole('status').filter({hasText:'1 siswa dimuat dari 2'}).waitFor();
  assert.equal(await packageRow('Paket B').getByRole('button',{name:'Unduh CSV',exact:true}).isDisabled(),true);
  await heldExport();await page.getByText('Halaman ekspor kedua gagal',{exact:true}).waitFor();
  assert.equal(downloads,0);assert.equal(exportRequests,2);
  exportFails=false;
  const downloadPromise=page.waitForEvent('download');
  await packageRow('Paket A').getByRole('button',{name:'Unduh CSV',exact:true}).click();
  const download=await downloadPromise;
  const csv=await fs.readFile(await download.path(),'utf8');
  assert.ok(csv.includes('000123,"Nama, ""A""\nBaru",001,Sekolah,0,'));
  assert.ok(csv.includes('Belum tersedia'));assert.equal(downloads,1);
  // Filtered export uses the same school/status/search/sort as the student list.
  await results();await packageRow('Paket B').getByRole('button',{name:'Lihat Analitik',exact:true}).click();
  await page.getByRole('button',{name:'Lihat Semua Siswa',exact:true}).click();
  await page.getByLabel('Status pengerjaan',{exact:true}).selectOption('selesai');
  await page.getByLabel('Urutkan hasil',{exact:true}).selectOption('score_desc');
  await page.getByLabel('Cari siswa',{exact:true}).fill('Nama');
  const filteredButton=page.getByRole('button',{name:'Unduh CSV Hasil',exact:true});
  await filteredButton.waitFor();
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Unduh CSV Hasil'))?.disabled);
  const requestPromise=page.waitForRequest(request=>{
    const u=new URL(request.url());return u.pathname.endsWith('/all-students') && u.searchParams.get('search')==='Nama' && u.searchParams.get('status')==='selesai' && u.searchParams.get('sort')==='score_desc' && u.searchParams.get('pageSize')==='100';
  });
  const filteredDownload=page.waitForEvent('download');
  await filteredButton.click();await requestPromise;
  const filteredCsv=await fs.readFile(await (await filteredDownload).path(),'utf8');
  assert.ok(!filteredCsv.split('\r\n')[0].includes('Sekolah'));
  assert.ok(filteredCsv.includes('000123'));assert.deepEqual(errors,[]);
  console.log('PASS: summary error/retry, stale response isolation, item network failure/retry/empty, export progress/duplicate guard/middle-page failure/no partial download/retry/CSV escaping');
} finally {await browser?.close();await new Promise(resolve=>web.close(resolve));}
