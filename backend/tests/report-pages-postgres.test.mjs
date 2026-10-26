import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import jwt from 'jsonwebtoken';
process.env.USE_REDIS = 'false';
process.env.STORAGE_PROVIDER = 'LOCAL';
const { createApp } = await import('../dist/app.js');
const url = process.env.INTEGRITY_TEST_DATABASE_URL;
test('cross-package reports preserve cohorts, paging, exports and school access in isolated PostgreSQL', { skip: !url, timeout: 60000 }, async t => {
 const schema = `tka_reports_${crypto.randomUUID().replaceAll('-', '')}`;
 const admin = new Pool({ connectionString: url }); let pool, prisma, server;
 try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const ddl = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  const connection = await admin.connect();try { await connection.query(`SET search_path TO "${schema}"`);await connection.query(ddl); }finally { connection.release(); }
  pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 5 });
  prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  await prisma.school.createMany({data:[{npsn:'A',name:'Sekolah A'},{npsn:'B',name:'Sekolah B'}]});
  await prisma.user.createMany({data:[
   {id:'admin',username:'admin',fullName:'Admin',role:'admin',password:'unused',activeToken:'sid-admin'},
   {id:'op',username:'op',fullName:'Operator A',role:'operator',schoolNpsn:'A',password:'unused',activeToken:'sid-op'},
   {id:'op2',username:'op2',fullName:'Operator B',role:'operator',schoolNpsn:'B',password:'unused',activeToken:'sid-op2'},
   {id:'unscoped',username:'unscoped',fullName:'Tanpa sekolah',role:'operator',password:'unused',activeToken:'sid-unscoped'},
   ...Array.from({length:125},(_,i)=>({id:`s${String(i).padStart(3,'0')}`,username:`siswa${i}`,fullName:`Nama ${i%5}`,nisn:String(i).padStart(10,'0'),role:'siswa',password:'unused',activeToken:`sid-s${String(i).padStart(3,'0')}`,className:i%2?'6B':'6A',schoolNpsn:i<120?'A':i<124?'B':null}))
  ]});
  await prisma.package.createMany({data:[{id:'p1',name:'Matematika A',mapel:'Matematika',status:'aktif'},{id:'p2',name:'Matematika B',mapel:'Matematika',status:'draft'},{id:'p3',name:'Bahasa Indonesia A',mapel:'Bahasa Indonesia',status:'draft'}]});
  await prisma.question.createMany({data:[{id:'q1',type:'Pilihan Ganda Sederhana',mapel:'Matematika',element:'Bilangan',content:'Soal satu',options:[],correctAnswer:[0]},{id:'q2',type:'Pilihan Ganda Kompleks',mapel:'Matematika',element:'Bilangan',content:'Soal dua',options:[],correctAnswer:[0]}]});
  await prisma.packageQuestion.createMany({data:[{packageId:'p1',questionId:'q1'},{packageId:'p1',questionId:'q2'},{packageId:'p2',questionId:'q1'}]});
  await prisma.examSession.createMany({data:[
   {id:'e1',packageId:'p1',studentId:'s000',status:'selesai',totalScore:0,endTime:new Date()},
   {id:'e2',packageId:'p1',studentId:'s001',status:'selesai',totalScore:100,endTime:new Date()},
   {id:'e3',packageId:'p1',studentId:'s002',status:'sedang_mengerjakan',totalScore:80},
   {id:'e4',packageId:'p1',studentId:'s120',status:'selesai',totalScore:75,endTime:new Date()},
   {id:'e5',packageId:'p2',studentId:'s000',status:'selesai',totalScore:90,endTime:new Date()},
   {id:'e6',packageId:'p2',studentId:'s124',status:'legacy',totalScore:80},
  ]});
  await prisma.answer.createMany({data:[{id:'a1',sessionId:'e1',questionId:'q1',answerData:[],isCorrect:false},{id:'a2',sessionId:'e2',questionId:'q1',answerData:0,isCorrect:true},{id:'a3',sessionId:'e3',questionId:'q1',answerData:0,isCorrect:true},{id:'a4',sessionId:'e5',questionId:'q1',answerData:0,isCorrect:true},{id:'a5',sessionId:'e1',questionId:'q2',answerData:[''],isCorrect:false}]});
  const secret='isolated-reports-secret-with-at-least-32-characters';server=createApp(prisma,secret).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;
  const get=async(path,id='admin')=>{const res=await fetch(base+path,{headers:{Authorization:`Bearer ${jwt.sign({id,sid:`sid-${id}`},secret)}`}});return{status:res.status,body:await res.json()}};
  await t.test('students are separate per package, unfinished grades masked, real zero and NISN preserved',async()=>{
   const all=await get('/analytics/reports/students?pageSize=100');assert.equal(all.status,200,JSON.stringify(all.body));assert.equal(all.body.total,375);assert.equal(all.body.items.length,100);
   const rows=(await get('/analytics/reports/students?search=siswa0')).body.items;assert.equal(rows.length,3);assert.equal(new Set(rows.map(r=>r.id)).size,3);
   assert.equal(rows.find(r=>r.packageId==='p1').score,'0');assert.equal(rows.find(r=>r.packageId==='p2').score,'90');assert.equal(rows.find(r=>r.packageId==='p3').score,null);assert.equal(rows[0].nisn,'0000000000');
   const unfinished=(await get('/analytics/reports/students?packageId=p1&search=siswa2')).body.items.find(r=>r.studentId==='s002');assert.equal(unfinished.score,null);
   const specific=await get('/analytics/reports/students?packageId=p1&schoolNpsn=A&className=6A&status=selesai');assert.equal(specific.body.total,1);assert.equal(specific.body.items[0].studentId,'s000');
  });
  await t.test('all pages export deterministically with tied names and scores and reject mixed cursors',async()=>{
   for(const sort of ['name_asc','name_desc','score_asc','score_desc']){
    const query=`/analytics/reports/students?sort=${sort}&pageSize=100`;let response=await get(query),ids=[],count=0,first=response.body;
    do {assert.equal(response.status,200,JSON.stringify(response.body));ids.push(...response.body.items.map(r=>r.id));count++;response=response.body.nextCursor?await get(`${query}&after=${encodeURIComponent(response.body.nextCursor)}`):null;}while(response&&count<10);
    assert.equal(ids.length,375);assert.equal(new Set(ids).size,375);assert.equal(count,4);
    const second=(await get(`${query}&page=2`)).body;assert.deepEqual(ids.slice(100,200),second.items.map(r=>r.id));
    assert.equal((await get(`${query}&packageId=p1&after=${encodeURIComponent(first.nextCursor)}`)).status,400);
   }
  });
  await t.test('school summaries keep per-package denominators and do not merge scores',async()=>{
   const all=await get('/analytics/reports/schools?pageSize=100');assert.equal(all.status,200,JSON.stringify(all.body));assert.equal(all.body.total,9);
   const p1=all.body.items.find(r=>r.packageId==='p1'&&r.npsn==='A'),p2=all.body.items.find(r=>r.packageId==='p2'&&r.npsn==='A');
   assert.equal(p1.totalStudents,120);assert.equal(p1.finishedCount,2);assert.equal(p1.ongoingCount,1);assert.equal(p1.notStartedCount,117);assert.equal(p1.score,50);assert.equal(p2.score,90);
   const none=all.body.items.find(r=>r.packageId==='p3'&&r.npsn==='A');assert.equal(none.score,null);
   assert.equal((await get('/analytics/reports/schools?schoolNpsn=UNKNOWN')).body.total,3);
   const one=(await get('/analytics/reports/schools?packageId=p1&search=Sekolah%20A')).body;assert.equal(one.total,1);
  });
  await t.test('shared questions retain independent completed cohorts, missing answers count as empty',async()=>{
   const all=await get('/analytics/reports/items');assert.equal(all.status,200,JSON.stringify(all.body));assert.equal(all.body.total,3);
   const p1=all.body.items.find(r=>r.packageId==='p1'&&r.questionId==='q1'),p2=all.body.items.find(r=>r.packageId==='p2');
   assert.equal(p1.totalAttempts,3);assert.equal(p1.correctCount,1);assert.equal(p1.emptyCount,2);assert.equal(p1.wrongCount,0);assert.equal(p1.score,1/3);assert.equal(p1.category,'Sedang');
   assert.equal(p2.totalAttempts,1);assert.equal(p2.correctCount,1);assert.equal(p2.score,1);assert.equal(p2.category,'Mudah');
   const empty=all.body.items.find(r=>r.questionId==='q2');assert.equal(empty.emptyCount,3);assert.equal(empty.correctCount,0);
   assert.equal((await get('/analytics/reports/items?category=Mudah')).body.total,1);assert.equal((await get('/analytics/reports/items?packageId=p3')).body.total,0);
   await prisma.packageQuestion.create({data:{packageId:'p3',questionId:'q2'}});
   const noParticipants=(await get('/analytics/reports/items?packageId=p3')).body.items[0];assert.equal(noParticipants.score,null);assert.equal(noParticipants.category,'Belum ada data');
  });
  await t.test('school/item cursor exports respect filters and fail on missing anchors',async()=>{
   for(const kind of ['schools','items']){
    const path=`/analytics/reports/${kind}?pageSize=1&sort=score_desc`;let result=(await get(path)).body;const expected=result.total,ids=[];
    while(true){ids.push(...result.items.map(r=>r.id));if(!result.nextCursor)break;const next=await get(`${path}&after=${encodeURIComponent(result.nextCursor)}`);assert.equal(next.status,200);result=next.body;}
    assert.equal(ids.length,expected);assert.equal(new Set(ids).size,expected);
    const first=(await get(path)).body;assert.equal((await get(`${path}&search=other&after=${encodeURIComponent(first.nextCursor)}`)).status,400);
   }
   const path='/analytics/reports/students?pageSize=1';const first=(await get(path)).body;await prisma.user.update({where:{id:first.items[0].studentId},data:{role:'guru'}});
   assert.equal((await get(`${path}&after=${encodeURIComponent(first.nextCursor)}`)).status,409);
   await prisma.user.update({where:{id:first.items[0].studentId},data:{role:'siswa'}});
  });
  await t.test('operator history includes completed active packages but never another school or in-progress scores',async()=>{
   const history=await get('/monitoring/history','op');assert.equal(history.status,200,JSON.stringify(history.body));assert.equal(history.body.total,3);assert.ok(history.body.items.every(r=>r.npsn==='A'&&r.status==='Selesai'));assert.ok(history.body.items.some(r=>r.packageId==='p1'));assert.equal(history.body.items.find(r=>r.sessionId==='e1').score,'0');
   assert.equal((await get('/monitoring/history?packageId=p2','op')).body.total,1);assert.equal((await get('/monitoring/history?schoolNpsn=B','op')).status,403);assert.equal((await get('/monitoring/history','op2')).body.total,1);assert.equal((await get('/monitoring/history','unscoped')).status,403);
   for(const path of ['/users','/users/classes','/users/login-cards','/monitoring/packages'])assert.equal((await get(path,'unscoped')).status,403);
   for(const kind of ['students','schools','items'])assert.equal((await get(`/analytics/reports/${kind}`,'op')).status,403);
   assert.equal((await get('/monitoring/history','s000')).status,403);
  });
  await t.test('administrative and credential list sorts apply before pagination and retain filtered cursors',async()=>{
   await prisma.readingText.createMany({data:[{id:'r1',title:'Zeta',content:'Bacaan'},{id:'r2',title:'Alfa',content:'Bacaan'}]});
   for(const path of ['/users?role=siswa','/schools?','/packages?','/questions?','/readings?','/users/login-cards?','/monitoring/packages?','/monitoring/packages/p1/students?']){
    const who=path.includes('login-cards')?'op':'admin',url=path+'&sort=name_desc&pageSize=2';let first=await get(url,who);assert.equal(first.status,200,JSON.stringify(first.body));
    if(first.body.nextCursor){
     const next=await get(`${url}&after=${encodeURIComponent(first.body.nextCursor)}`,who);assert.equal(next.status,200,JSON.stringify(next.body));const numbered=await get(`${url}&page=2`,who);assert.deepEqual(next.body.items.map(r=>r.id||r.npsn),numbered.body.items.map(r=>r.id||r.npsn));
     assert.equal((await get(`${url}&search=different&after=${encodeURIComponent(first.body.nextCursor)}`,who)).status,400);
    }
   }
   const cards=(await get('/users/login-cards?sort=name_asc&pageSize=100','op')).body;assert.ok(cards.items.every(r=>r.schoolNpsn==='A'));assert.equal(cards.total,120);
   const reading=(await get('/readings?sort=name_asc')).body;assert.deepEqual(reading.items.map(r=>r.title),['Alfa','Zeta']);
   assert.equal((await get('/packages?mapel=Bahasa%20Indonesia')).body.total,1);
   assert.equal((await get('/users?sort=invalid')).status,400);
  });
  await t.test('invalid inputs and literal wildcard searches do not broaden reports',async()=>{
   for(const path of ['/analytics/reports/items?sort=unsafe','/analytics/reports/items?category=invalid','/analytics/reports/schools?pageSize=101','/analytics/reports/students?status=invalid','/analytics/reports/schools?packageId=p1&packageId=p2'])assert.equal((await get(path)).status,400,path);
   for(const kind of ['students','schools','items'])assert.equal((await get(`/analytics/reports/${kind}?search=%25`)).body.total,0);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));await prisma?.$disconnect();await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
 }
});
