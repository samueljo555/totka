// Build first. Uses the real UI and AnswerSync with controlled API responses; no database changes.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('dist');
const web=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 let file=path.join(root,pathname);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
 try{if(!(await fs.stat(file)).isFile())file=path.join(root,'index.html');}catch{file=path.join(root,'index.html');}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
}).listen(0,'127.0.0.1');await new Promise(resolve=>web.once('listening',resolve));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const errors=[];
const questions=[
 {id:'q1',type:'Pilihan Ganda Sederhana',content:'Hitung $\\frac{2}{3} + \\frac{1}{4}$.',imageUrl:'/uploads/exam.svg',options:[{text:'$7/12$'},{text:'$3/7$'},{text:'$11/12$'},{text:'$5/6$'}]},
 {id:'q2',type:'Pilihan Ganda Kompleks',content:'Pilih semua bilangan prima.',options:[{text:'2'},{text:'9'},{text:'11'},{text:'15'}]},
 {id:'q3',type:'Pilihan Ganda Kompleks Kategori',content:'Persegi panjang berukuran 12 cm × 8 cm.',options:[{text:'Luasnya 96 cm².'},{text:'Kelilingnya 20 cm.'},{text:'Selisih panjang dan lebar 4 cm.'}]},
 {id:'q4',type:'Pilihan Ganda Sederhana',content:'Apa manfaat utama pohon?',reading:{title:'Sekolah Hijau',content:'Pohon membantu menjaga **kebersihan udara**.\n\nSiswa merawat tanaman bersama.'},options:[{text:'Udara bersih'},{text:'Halaman sempit'}]},
];
let sequence=0;
async function openFixture({remaining=5400,release='langsung',holdFinish=false,authFail=false,blockReviews=false}={}){
 const fixture={id:'exam-ui-'+(++sequence),remaining,release,holdFinish,authFail,holdSave:false,conflict:false,held:[],heldFinish:null,records:new Map(),saves:[],finishes:[],startCount:0};
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(blockReviews=>{
  if(blockReviews){for(const method of ['setItem','removeItem']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(String(key).startsWith('tka_exam_review_v1_'))throw new DOMException('Blocked test review storage','SecurityError');return original.call(this,key,...args);};}}
  localStorage.setItem('tka_auth_user',JSON.stringify({id:'student-actual',role:'siswa',fullName:'Nama Lama',school:{name:'Sekolah Lama'}}));
  localStorage.setItem('tka_jwt_token','test-only-token');localStorage.setItem('tka_token_created_at',String(Date.now()));localStorage.setItem('tka_last_activity_at',String(Date.now()));
 },blockReviews);
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/uploads/exam.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect x="5" y="5" width="190" height="90" fill="#dbeafe"/><text x="50" y="55" fill="#2563eb">Gambar soal</text></svg>'}));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname==='/api/auth/session-check')return json({status:'valid'});
  if(url.pathname==='/api/sessions/start'){
   fixture.startCount++;
   return json({session:{id:fixture.id,status:'sedang_mengerjakan',totalScore:null},student:{id:'student-actual',role:'siswa',fullName:'Nadia Putri Salsabila',nisn:'0001234567',className:'VI B',school:{name:'SD Negeri Sekolah Uji'}},package:{name:'Paket Aktual dari API',mapel:'Matematika',durationMinutes:90,releaseScoreMode:release},questions,existingAnswers:[...fixture.records.values()],remainingSeconds:fixture.remaining});
  }
  if(url.pathname.endsWith('/answer')){
   assert.equal(req.headers().authorization,'Bearer test-only-token');const answer=req.postDataJSON();fixture.saves.push(answer);
   if(fixture.authFail){const reject=()=>json({message:'Sesi perangkat telah dinonaktifkan.'},401);if(fixture.holdSave){fixture.held.push(reject);return;}return reject();}
   if(fixture.conflict){fixture.conflict=false;const currentAnswer={questionId:answer.questionId,answerData:0,version:answer.version+1,mutationId:'server-current-mutation-abcdefgh'};fixture.records.set(answer.questionId,currentAnswer);return json({error:'ANSWER_VERSION_CONFLICT',currentAnswer},409);}
   const ack=async()=>{fixture.records.set(answer.questionId,answer);await json({...answer,acknowledged:true}).catch(()=>{});};
   if(fixture.holdSave){fixture.held.push(ack);return;}return ack();
  }
  if(url.pathname.endsWith('/finish')){
   fixture.finishes.push(req.postDataJSON());const done=()=>json({id:fixture.id,status:'selesai',releaseScoreMode:release,totalScore:release==='langsung'?75:null});
   if(fixture.holdFinish){fixture.heldFinish=done;return;}return done();
  }
  return json({message:'Unexpected API'},404);
 });
 await page.goto(`http://127.0.0.1:${web.address().port}/siswa`);await page.getByPlaceholder('Masukkan Token').fill('TOKEN_UJI');await page.getByRole('button',{name:'Mulai Kerjakan',exact:true}).click();
 await page.getByRole('heading',{name:'Paket Aktual dari API',exact:true}).waitFor();return{fixture,context,page};
}
const waitSaved=page=>page.locator('.exam-save-status').getByText('Jawaban telah diterima server.',{exact:true}).waitFor();
const go=async(page,n)=>{await page.locator('.exam-sidebar').getByRole('button',{name:new RegExp('^Soal '+n+':')}).click();await page.getByRole('article',{name:'Soal '+n,exact:true}).waitFor();};
try{
 const {fixture,context,page}=await openFixture();
 const side=page.locator('.exam-sidebar');await side.getByText('Nadia Putri Salsabila',{exact:true}).waitFor();assert.ok((await side.innerText()).includes('0001234567'));assert.ok((await side.innerText()).includes('VI B'));assert.ok(!(await side.innerText()).includes('Nama Lama'));assert.ok((await side.innerText()).includes('SD Negeri Sekolah Uji'));
 assert.equal(await page.locator('.exam-question-content .katex').count(),1);assert.equal(await page.locator('.exam-number:visible').count(),4);
 await page.getByRole('radio',{name:'Pilihan C',exact:true}).check();await waitSaved(page);assert.equal(fixture.records.get('q1').answerData,2);
 await page.getByRole('button',{name:'Tandai untuk ditinjau',exact:true}).click();assert.equal(await page.locator('.exam-number.flagged:visible').count(),1);
 await page.getByRole('button',{name:'Perbesar teks',exact:true}).click();assert.equal(await page.locator('.exam-workspace').evaluate(el=>el.style.getPropertyValue('--exam-font-size')),'18px');
 await page.getByRole('button',{name:'Perbesar gambar soal 1',exact:true}).click();await page.getByRole('button',{name:'Tutup',exact:true}).click();
 await go(page,2);await page.getByRole('checkbox',{name:'Pilihan A',exact:true}).check();await page.getByRole('checkbox',{name:'Pilihan C',exact:true}).check();await waitSaved(page);assert.deepEqual(fixture.records.get('q2').answerData,[0,2]);
 await go(page,3);await page.getByRole('radio',{name:'Pernyataan 1: Benar',exact:true}).check();await waitSaved(page);
 await page.getByRole('button',{name:'Selesai ujian',exact:true}).click();const summary=page.getByRole('dialog',{name:'Sudah selesai mengerjakan?',exact:true});await summary.getByText(/baru dijawab sebagian/).waitFor();
 await summary.getByRole('button',{name:'Periksa kembali',exact:true}).click();
 await page.getByRole('radio',{name:'Pernyataan 2: Salah',exact:true}).check();await page.getByRole('radio',{name:'Pernyataan 3: Benar',exact:true}).check();await waitSaved(page);assert.deepEqual(fixture.records.get('q3').answerData,[0,1,0]);
 await go(page,4);await page.getByRole('heading',{name:'Sekolah Hijau',exact:true}).waitFor();assert.equal(await page.locator('.exam-reading strong').innerText(),'kebersihan udara');
 await go(page,1);assert.equal(await page.getByRole('radio',{name:'Pilihan C',exact:true}).isChecked(),true);
 await page.screenshot({path:'/tmp/totka-student-live-desktop.png',fullPage:true});
 // Offline choices remain in the durable outbox, and manual finish is blocked.
 fixture.holdSave=true;await context.setOffline(true);await page.getByRole('radio',{name:'Pilihan B',exact:true}).check();await page.locator('.exam-save-status').getByText('Jawaban menunggu koneksi kembali.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Selesai ujian',exact:true}).click();assert.equal(await summary.getByRole('button',{name:'Selesai ujian',exact:true}).isDisabled(),true);assert.equal(fixture.finishes.length,0);await summary.getByRole('button',{name:'Periksa kembali',exact:true}).click();
 await context.setOffline(false);await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.includes('outbox')&&k.includes('q1')));
 await page.reload();await page.getByRole('heading',{name:'Paket Aktual dari API',exact:true}).waitFor();assert.equal(await page.getByRole('radio',{name:'Pilihan B',exact:true}).isChecked(),true);assert.equal(await page.locator('.exam-number.flagged:visible').count(),1);
 await page.waitForTimeout(250);fixture.holdSave=false;for(const release of fixture.held.splice(0))await release();await waitSaved(page);
 // A different session in the same tab must not inherit review flags.
 const originalSession=fixture.id;fixture.id=originalSession+'-other';await page.reload();await page.getByRole('heading',{name:'Paket Aktual dari API',exact:true}).waitFor();assert.equal(await page.locator('.exam-number.flagged:visible').count(),0);
 await go(page,2);await page.getByRole('button',{name:'Tandai untuk ditinjau',exact:true}).click();fixture.id=originalSession;await page.reload();await page.getByRole('heading',{name:'Paket Aktual dari API',exact:true}).waitFor();assert.equal(await page.locator('.exam-number.flagged:visible').count(),1);assert.ok((await page.locator('.exam-number.flagged:visible').innerText()).includes('01'));
 // Both conflict decisions remain available through the existing engine.
 fixture.conflict=true;await page.getByRole('radio',{name:'Pilihan D',exact:true}).check();await page.getByRole('button',{name:'Gunakan jawaban server',exact:true}).click();await waitSaved(page);assert.equal(await page.getByRole('radio',{name:'Pilihan A',exact:true}).isChecked(),true);
 fixture.conflict=true;await page.getByRole('radio',{name:'Pilihan C',exact:true}).check();await page.getByRole('button',{name:'Kirim jawaban saya',exact:true}).click();await page.getByRole('button',{name:'Yakin',exact:true}).click();await waitSaved(page);assert.equal(fixture.records.get('q1').answerData,2);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Daftar soal',exact:true}).click();const drawer=page.getByRole('dialog',{name:'Navigasi ujian',exact:true});await drawer.getByText('Nadia Putri Salsabila',{exact:true}).waitFor();await drawer.getByRole('button',{name:/^Soal 4:/}).click();assert.equal(await drawer.isVisible(),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/totka-student-live-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Periksa & selesaikan',exact:true}).click();await summary.getByRole('button',{name:'Selesai ujian',exact:true}).click();await page.getByRole('heading',{name:'Ujian Selesai!',exact:true}).waitFor();assert.equal(fixture.finishes.length,1);assert.equal(fixture.finishes[0].expectedAnswers.length,3);assert.equal(await page.evaluate(id=>sessionStorage.getItem('tka_exam_review_v1_'+id),fixture.id),null);
 // Review marks never carry into another session and automatic expiry still bypasses the manual summary.
 const expiry=await openFixture({remaining:2,release:'ditunda',holdFinish:true});await expiry.page.getByRole('button',{name:'Selesai ujian',exact:true}).click();await expiry.page.waitForFunction(()=>document.querySelector('.exam-timer strong')?.textContent==='00:00:00');assert.equal(await expiry.page.locator('.exam-options input').first().isDisabled(),true);assert.equal(await expiry.page.locator('.exam-number.flagged:visible').count(),0);await expiry.page.waitForTimeout(250);assert.equal(expiry.fixture.finishes.length,1);await expiry.fixture.heldFinish();await expiry.page.getByRole('heading',{name:'Menunggu Rilis',exact:true}).waitFor();
 const kicked=await openFixture({authFail:true});kicked.fixture.holdSave=true;await kicked.page.getByRole('radio',{name:'Pilihan A',exact:true}).check();await kicked.page.getByRole('button',{name:'Selesai ujian',exact:true}).click();await kicked.page.waitForTimeout(250);assert.ok(kicked.fixture.held.length);await kicked.fixture.held[0]();await kicked.page.getByText('Sesi Ujian Dinonaktifkan',{exact:true}).waitFor();assert.equal(kicked.fixture.finishes.length,0);assert.equal(await kicked.page.locator('dialog[open]').count(),0);
 const storage=await openFixture({blockReviews:true});await storage.page.getByRole('button',{name:'Tandai untuk ditinjau',exact:true}).click();await storage.page.getByText(/Penanda tinjau belum dapat disimpan di tab ini/).waitFor();await storage.page.getByRole('radio',{name:'Pilihan A',exact:true}).check();await waitSaved(storage.page);await storage.page.getByRole('button',{name:'Selesai ujian',exact:true}).click();await storage.page.getByRole('dialog',{name:'Sudah selesai mengerjakan?',exact:true}).getByRole('button',{name:'Selesai ujian',exact:true}).click();await storage.page.getByRole('heading',{name:'Ujian Selesai!',exact:true}).waitFor();assert.equal(storage.fixture.finishes.length,1);
 assert.deepEqual(errors,[]);console.log('PASS: live student UI and AnswerSync; identity/API metadata, math/image/reading, all 3 answer payloads, review+reload/session isolation, offline durable recovery, conflict decisions, mobile drawer, finish manifest/cleanup, expiry with open dialog/deferred score, revoked session with open dialog, blocked review storage.');
}finally{await browser.close();web.closeAllConnections();await new Promise(resolve=>web.close(resolve));}
