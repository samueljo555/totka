import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import jwt from 'jsonwebtoken';
process.env.USE_REDIS = 'false';
process.env.STORAGE_PROVIDER = 'LOCAL';
const { createApp } = await import('../dist/app.js');
const url = process.env.INTEGRITY_TEST_DATABASE_URL;
test('paged queries and aggregates with 10050 students and 502500 answers in isolated PostgreSQL', { skip: !url, timeout: 120000 }, async t => {
  const schema = `tka_performance_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: url });
  let pool, prisma, server;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const ddl = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
    const connection = await admin.connect();
    try { await connection.query(`SET search_path TO "${schema}"`); await connection.query(ddl); }
    finally { connection.release(); }
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 5 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema }), log: [{ emit: 'event', level: 'query' }] });
    const queries = [];
    prisma.$on('query', event => queries.push(event.query));
    await prisma.school.createMany({ data: [{ npsn: '11111111', name: 'Sekolah A' }, { npsn: '22222222', name: 'Sekolah B' }] });
    await prisma.user.createMany({ data: [
      { id: 'admin', username: 'admin', password: 'unused', fullName: 'Admin', role: 'admin', activeToken: 'sid-admin' },
      { id: 'op', username: 'op', password: 'unused', fullName: 'Operator', role: 'operator', activeToken: 'sid-op', schoolNpsn: '11111111' },
      { id: 'op2', username: 'op2', password: 'unused', fullName: 'Operator B', role: 'operator', activeToken: 'sid-op2', schoolNpsn: '22222222' },
    ] });
    await prisma.$executeRawUnsafe(`INSERT INTO "User" (id, username, password, "fullName", role, "schoolNpsn", "className", "activeToken", nisn) SELECT 's' || lpad(n::text,5,'0'), 'siswa' || n, 'unused', 'Siswa ' || lpad(n::text,5,'0'), 'siswa', CASE WHEN n <= 10000 THEN '11111111' ELSE '22222222' END, CASE WHEN n % 2 = 0 THEN '6A' ELSE '6B' END, 'sid-' || 's' || lpad(n::text,5,'0'), lpad(n::text,10,'0') FROM generate_series(1,10050) n`);
    await prisma.package.create({ data: { id: 'p1', name: 'Ujian', token: 'TOKEN_AKTIF', mapel: 'Matematika', status: 'aktif' } });
    await prisma.$executeRawUnsafe(`INSERT INTO "Question" (id,type,mapel,element,content,options,"correctAnswer") SELECT 'q' || lpad(n::text,2,'0'), 'Pilihan Ganda Sederhana','Matematika','Bilangan','Soal ' || n,'[{"text":"A"},{"text":"B"}]'::jsonb,'[0]'::jsonb FROM generate_series(1,50) n`);
    await prisma.$executeRawUnsafe(`INSERT INTO "PackageQuestion" ("packageId","questionId") SELECT 'p1',id FROM "Question"`);
    await prisma.$executeRawUnsafe(`INSERT INTO "ExamSession" (id,"studentId","packageId",status,"totalScore","endTime") SELECT 'e' || id,id,'p1',CASE WHEN id <= 's05000' THEN 'selesai' ELSE 'sedang_mengerjakan' END,CASE WHEN id <= 's05000' THEN 80 ELSE NULL END,CASE WHEN id <= 's05000' THEN now() ELSE NULL END FROM "User" WHERE role='siswa'`);
    await prisma.$executeRawUnsafe(`INSERT INTO "Answer" (id,"sessionId","questionId","answerData","isCorrect") SELECT es.id || q.id,es.id,q.id,'0'::jsonb,CASE WHEN es.status='selesai' THEN q.id <= 'q40' ELSE NULL END FROM "ExamSession" es CROSS JOIN "Question" q`);
    await prisma.$executeRawUnsafe('ANALYZE');
    const secret = 'performance-test-secret-with-at-least-32-characters';
    server = createApp(prisma, secret).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const get = async (path, id = 'admin') => {
      const response = await fetch(base + path, { headers: { Authorization: `Bearer ${jwt.sign({ id, sid: `sid-${id}` }, secret)}` } });
      return { status: response.status, body: await response.json() };
    };
    await t.test('user pages are bounded and totals stay accurate across pages and cursors', async () => {
      const one = await get('/users?pageSize=25&role=siswa');
      assert.equal(one.status, 200); assert.equal(one.body.items.length, 25); assert.equal(one.body.total, 10050);
      const two = await get('/users?page=2&pageSize=25&role=siswa');
      assert.equal(two.body.items[0].id, 's00026');
      const cursor = await get(`/users?pageSize=25&role=siswa&after=${one.body.nextCursor}`);
      assert.deepEqual(cursor.body.items.map(row => row.id), two.body.items.map(row => row.id));
      assert.ok(queries.some(query => /LIMIT/.test(query)));
      for (const row of one.body.items) { assert.ok(!('password' in row)); assert.ok(!('activeToken' in row)); }
      assert.equal((await get('/users?pageSize=10001')).status, 400);
      assert.equal((await get('/users?page=0')).status, 400);
    });
    await t.test('school, class and search filtering happen before paging and credentials never cross schools', async () => {
      const filtered = await get('/users?search=Siswa%2000010&className=6A', 'op');
      assert.equal(filtered.body.total, 1);
      assert.equal(filtered.body.items[0].id, 's00010');
      const cards = await get('/users/login-cards?pageSize=10', 'op2');
      assert.equal(cards.body.total, 50); assert.equal(cards.body.items.length, 10);
      assert.ok(cards.body.items.every(row => row.schoolNpsn === '22222222'));
      assert.equal((await get('/users/login-cards?schoolNpsn=11111111', 'op2')).status, 403);
      assert.equal((await get('/monitoring/packages', 's00001')).status, 403);
    });
    await t.test('overview uses aggregate counts rather than loading 10050 user records', async () => {
      queries.length = 0;
      const result = await get('/overview');
      assert.equal(result.body.students, 10050); assert.equal(result.body.totalUsers, 10053);
      assert.equal(result.body.packages, 1);
      assert.ok(queries.some(query => /GROUP BY/.test(query)));
      assert.ok(!queries.some(query => /"password"/.test(query)));
    });
    await t.test('package analytics averages only finished participants and reports registration separately', async () => {
      const result = await get('/analytics/packages/p1');
      assert.equal(result.body.summary.totalParticipants, 5000);
      assert.equal(result.body.summary.registeredStudents, 10050);
      assert.equal(result.body.summary.totalStudents, 10050);
      assert.equal(result.body.summary.startedCount, 10050);
      assert.equal(result.body.summary.ongoingCount, 5050);
      assert.equal(result.body.summary.finishedCount, 5000);
      assert.equal(result.body.summary.notStartedCount, 0);
      assert.equal(result.body.summary.otherCount, 0);
      assert.equal(result.body.summary.average, 80);
      assert.equal(result.body.summary.lowest, 80);
      assert.equal(result.body.schools.find(row => row.npsn === '22222222').participantCount, 0);
    });
    await t.test('student analytics hydrate only the requested page and aggregate element counts', async () => {
      queries.length = 0;
      const result = await get('/analytics/packages/p1/schools/11111111?pageSize=5');
      assert.equal(result.status, 200); assert.equal(result.body.total, 10000); assert.equal(result.body.items.length, 5);
      assert.equal(result.body.items[0].score, '80');
      assert.deepEqual(result.body.items[0].elementBreakdown.Bilangan, { total: 50, correct: 40 });
      assert.ok(!queries.some(query => /SELECT[\s\S]*"answerData"/.test(query)));
      const next = await get(`/analytics/packages/p1/all-students?pageSize=5&after=${result.body.nextCursor}`);
      assert.equal(next.body.items[0].nisn, '0000000006');
    });
    await t.test('item statistics group 502500 answers inside PostgreSQL', async () => {
      queries.length = 0;
      const result = await get('/analytics/packages/p1/items');
      assert.equal(result.body.items.length, 50);
      assert.ok(result.body.items.every(item => !('cognitiveLevel' in item)));
      assert.equal(result.body.totalParticipants, 5000);
      assert.equal(result.body.items[0].totalAttempts, 5000);
      assert.equal(result.body.items[0].emptyCount, 0);
      assert.equal(result.body.items[49].wrongCount, 5000);
      assert.equal(result.body.items[0].correctCount, 5000);
      assert.equal(result.body.items[49].correctCount, 0);
      assert.ok(queries.some(query => /GROUP BY/.test(query)));
      assert.ok(!queries.some(query => /"Answer"\."answerData"/.test(query)));
    });
    await t.test('operator monitoring keeps active tokens and global counters while paging participants', async () => {
      const summary = await get('/monitoring/packages?status=aktif', 'op');
      assert.equal(summary.body.items[0].token, 'TOKEN_AKTIF');
      assert.equal(summary.body.items[0].registeredStudents, 10000);
      assert.equal(summary.body.items[0].finished, 5000);
      assert.equal(summary.body.items[0].ongoing, 5000);
      const rows = await get('/monitoring/packages/p1/students?pageSize=20&status=selesai', 'op');
      assert.equal(rows.body.total, 5000); assert.equal(rows.body.items.length, 20);
      assert.ok(rows.body.items.every(row => row.session.status === 'selesai'));
      const other = await get('/monitoring/packages', 'op2');
      assert.equal(other.body.items[0].registeredStudents, 50); assert.equal(other.body.items[0].finished, 0);
    });
    await t.test('indexes migrate without replacing answer data and PostgreSQL uses an index for scoped paging', async () => {
      const sql = readFileSync(new URL('../prisma/migrations/20261024160000_query_indexes/migration.sql', import.meta.url), 'utf8');
      const names = [...sql.matchAll(/CREATE INDEX "([^"]+)"/g)].map(match => match[1]);
      for (const name of names) await prisma.$executeRawUnsafe(`DROP INDEX "${name}"`);
      await pool.query(sql);
      assert.equal(await prisma.answer.count(), 502500);
      const result = await pool.query('EXPLAIN (FORMAT JSON) SELECT id FROM "User" WHERE "schoolNpsn"=$1 AND role=$2 AND "className"=$3 ORDER BY id LIMIT 50', ['11111111', 'siswa', '6A']);
      assert.match(JSON.stringify(result.rows), /Index (Only )?Scan/);
      const indexes = await pool.query('SELECT indexname FROM pg_indexes WHERE schemaname=$1', [schema]);
      assert.ok(names.every(name => indexes.rows.some(row => row.indexname === name)));
    });
    await t.test('analytics use actual NISN and keep unavailable scores distinct from a genuine zero without rewriting results', async () => {
      const users = [
        { id: 'correction-zero', nisn: '0012345678' },
        { id: 'correction-active', nisn: '0012345679' },
        { id: 'correction-not-started', nisn: '0012345680' },
        { id: 'correction-no-nisn', nisn: null },
      ];
      await prisma.user.createMany({ data: users.map(row => ({ ...row, username: 'username-' + row.id, fullName: 'AnalyticCorrection ' + row.id, password: 'unused', role: 'siswa', schoolNpsn: '11111111' })) });
      await prisma.examSession.createMany({ data: users.filter(row => row.id !== 'correction-not-started').map(row => ({ id: 'session-' + row.id, studentId: row.id, packageId: 'p1', status: row.id === 'correction-active' ? 'sedang_mengerjakan' : 'selesai', totalScore: 0 })) });
      const before = await prisma.examSession.findMany({ where: { studentId: { in: users.map(row => row.id) } }, orderBy: { id: 'asc' } });
      queries.length = 0;
      for (const endpoint of ['/analytics/packages/p1/all-students', '/analytics/packages/p1/schools/11111111']) {
        const result = await get(endpoint + '?search=AnalyticCorrection');
        assert.equal(result.status, 200); assert.equal(result.body.total, 4);
        const byId = new Map(result.body.items.map(row => [row.id, row]));
        assert.equal(byId.get('correction-zero').nisn, '0012345678');
        assert.equal(byId.get('correction-zero').score, '0');
        assert.equal(byId.get('correction-zero').status, 'Selesai');
        assert.equal(byId.get('correction-active').score, null);
        assert.equal(byId.get('correction-active').status, 'Sedang Mengerjakan');
        assert.equal(byId.get('correction-not-started').score, null);
        assert.equal(byId.get('correction-not-started').sessionId, null);
        assert.equal(byId.get('correction-no-nisn').nisn, null);
        assert.equal(byId.get('correction-no-nisn').score, '0');
      }
      assert.ok(!queries.some(query => /^(UPDATE|INSERT|DELETE)/.test(query)));
      const after = await prisma.examSession.findMany({ where: { studentId: { in: users.map(row => row.id) } }, orderBy: { id: 'asc' } });
      assert.deepEqual(after, before);
    });

    await t.test('item analysis includes unanswered participants, cleared answers, partial categories and only completed sessions', async () => {
      const packageId = 'item-analysis-correction';
      const noDataId = 'item-analysis-no-completed';
      const emptyId = 'item-analysis-empty-package';
      await prisma.package.createMany({ data: [packageId, noDataId, emptyId].map(id => ({ id, name: id, mapel: 'Matematika' })) });
      const specs = [
        ['item-missing', 'Pilihan Ganda Sederhana', [0]],
        ['item-multiple', 'Pilihan Ganda Kompleks', [0]],
        ['item-category', 'Pilihan Ganda Kompleks Kategori', [0,0]],
        ['item-unanswered', 'Pilihan Ganda Sederhana', [0]],
      ];
      await prisma.question.createMany({ data: specs.map(([id, type, correctAnswer]) => ({ id, type, correctAnswer, content: id, mapel: 'Matematika', element: 'Bilangan', options: [{ text: 'A' }, { text: 'B' }] })) });
      await prisma.packageQuestion.createMany({ data: [packageId, noDataId].flatMap(id => specs.map(([questionId]) => ({ packageId: id, questionId }))) });
      await prisma.examSession.createMany({ data: Array.from({ length: 11 }, (_, i) => ({ id: 'item-session-' + (i+1), studentId: 's' + String(i+1).padStart(5,'0'), packageId, status: i === 10 ? 'sedang_mengerjakan' : 'selesai', totalScore: 0 })) });
      await prisma.examSession.create({ data: { id: 'item-active-only', studentId: 's00001', packageId: noDataId, status: 'sedang_mengerjakan' } });
      const data = [
        [1, 'item-missing', 0, true], [2, 'item-missing', 0, true], [11, 'item-missing', 0, true],
        [1, 'item-multiple', null, false], [2, 'item-multiple', [], false], [3, 'item-multiple', [0], true],
        [4, 'item-multiple', [1], false], [5, 'item-multiple', '', false], [11, 'item-multiple', [1], false],
        [1, 'item-category', [null,null], false], [2, 'item-category', [0,null], false], [3, 'item-category', [0,0], true],
        [4, 'item-category', [], false], [5, 'item-category', [null,0], false], [11, 'item-category', [0,0], true],
        [1, 'q01', 0, true], // Legacy answer to a question outside this package is excluded.
      ];
      for (const [n, questionId, answer, correct] of data) {
        await pool.query('INSERT INTO "Answer" (id,"sessionId","questionId","answerData","isCorrect") VALUES ($1,$2,$3,$4::jsonb,$5)', ['item-answer-' + n + '-' + questionId, 'item-session-' + n, questionId, JSON.stringify(answer), correct]);
      }
      await pool.query(`INSERT INTO "Answer" (id,"sessionId","questionId","answerData","isCorrect") VALUES ('active-only-answer','item-active-only','item-missing','0',true)`);
      const beforeSessions = await prisma.examSession.findMany({ where: { packageId }, orderBy: { id: 'asc' } });
      const beforeAnswers = await prisma.answer.findMany({ where: { session: { packageId } }, orderBy: { id: 'asc' } });
      const result = await get('/analytics/packages/' + packageId + '/items');
      assert.equal(result.status, 200); assert.equal(result.body.totalParticipants, 10);
      const items = new Map(result.body.items.map(item => [item.questionId, item]));
      const missing = items.get('item-missing');
      assert.equal(missing.correctCount, 2); assert.equal(missing.wrongCount, 0); assert.equal(missing.emptyCount, 8);
      assert.equal(missing.totalAttempts, 10); assert.equal(missing.difficultyIndex, 0.2);
      const multiple = items.get('item-multiple');
      assert.equal(multiple.correctCount, 1); assert.equal(multiple.wrongCount, 1); assert.equal(multiple.emptyCount, 8);
      const category = items.get('item-category');
      assert.equal(category.correctCount, 1); assert.equal(category.wrongCount, 2); assert.equal(category.emptyCount, 7);
      assert.equal(items.get('item-unanswered').emptyCount, 10);
      assert.equal(items.get('item-unanswered').difficultyIndex, 0);
      for (const item of items.values()) assert.equal(item.correctCount + item.wrongCount + item.emptyCount, 10);
      const noData = await get('/analytics/packages/' + noDataId + '/items');
      assert.equal(noData.body.totalParticipants, 0);
      assert.ok(noData.body.items.every(item => item.difficultyIndex === null && item.category === 'Belum ada data' && item.correctCount === 0 && item.wrongCount === 0 && item.emptyCount === 0));
      const empty = await get('/analytics/packages/' + emptyId + '/items');
      assert.equal(empty.body.totalParticipants, 0); assert.deepEqual(empty.body.items, []);
      assert.deepEqual(await prisma.examSession.findMany({ where: { packageId }, orderBy: { id: 'asc' } }), beforeSessions);
      assert.deepEqual(await prisma.answer.findMany({ where: { session: { packageId } }, orderBy: { id: 'asc' } }), beforeAnswers);
    });

    await t.test('summary distinguishes account population and each package participation state across schools', async () => {
      const packageId = 'participation-counts';
      await prisma.package.create({ data: { id: packageId, name: 'Participation counts', mapel: 'Matematika' } });
      const initial = await get('/analytics/packages/' + packageId);
      assert.equal(initial.body.summary.totalStudents, 10054);
      assert.equal(initial.body.summary.startedCount, 0);
      assert.equal(initial.body.summary.notStartedCount, 10054);
      const students = [
        ['count-finished-a', '11111111'], ['count-active-a', '11111111'], ['count-not-started-a', '11111111'],
        ['count-other-b', '22222222'], ['count-finished-unknown', null], ['count-not-started-unknown', null],
      ];
      await prisma.user.createMany({ data: students.map(([id, schoolNpsn]) => ({ id, username: id, schoolNpsn, fullName: 'CountCase ' + id, password: 'unused', role: 'siswa' })) });
      await prisma.examSession.createMany({ data: [
        { id: 'count-session-finished-a', studentId: 'count-finished-a', packageId, status: 'selesai', totalScore: 80 },
        { id: 'count-session-active-a', studentId: 'count-active-a', packageId, status: 'sedang_mengerjakan' },
        { id: 'count-session-other-b', studentId: 'count-other-b', packageId, status: 'dibatalkan' },
        { id: 'count-session-finished-unknown', studentId: 'count-finished-unknown', packageId, status: 'selesai', totalScore: 0 },
      ] });
      const before = await prisma.examSession.findMany({ where: { packageId }, orderBy: { id: 'asc' } });
      const result = await get('/analytics/packages/' + packageId);
      assert.equal(result.status, 200);
      const summary = result.body.summary;
      assert.equal(summary.totalStudents, 10060);
      assert.equal(summary.startedCount, 4);
      assert.equal(summary.ongoingCount, 1);
      assert.equal(summary.finishedCount, 2);
      assert.equal(summary.otherCount, 1);
      assert.equal(summary.notStartedCount, 10056);
      assert.equal(summary.average, 40); assert.equal(summary.highest, 80); assert.equal(summary.lowest, 0);
      assert.equal(summary.totalParticipants, summary.finishedCount);
      assert.equal(summary.registeredStudents, summary.totalStudents);
      const schools = new Map(result.body.schools.map(row => [row.npsn, row]));
      assert.equal(schools.get('11111111').totalStudents, 10007);
      assert.equal(schools.get('11111111').startedCount, 2);
      assert.equal(schools.get('11111111').ongoingCount, 1);
      assert.equal(schools.get('11111111').finishedCount, 1);
      assert.equal(schools.get('11111111').notStartedCount, 10005);
      assert.equal(schools.get('22222222').otherCount, 1);
      assert.equal(schools.get('22222222').notStartedCount, 50);
      assert.equal(schools.get('UNKNOWN').totalStudents, 2);
      assert.equal(schools.get('UNKNOWN').finishedCount, 1);
      assert.equal(schools.get('UNKNOWN').notStartedCount, 1);
      for (const field of ['totalStudents', 'startedCount', 'ongoingCount', 'finishedCount', 'notStartedCount', 'otherCount']) {
        assert.equal(result.body.schools.reduce((total, school) => total + school[field], 0), summary[field]);
      }
      for (const row of [summary, ...schools.values()]) {
        assert.equal(row.totalStudents, row.startedCount + row.notStartedCount);
        assert.equal(row.startedCount, row.ongoingCount + row.finishedCount + row.otherCount);
      }
      const list = await get('/analytics/packages/' + packageId + '/all-students?search=CountCase');
      const statuses = new Map(list.body.items.map(row => [row.id, row.status]));
      assert.equal(statuses.get('count-other-b'), 'Status Lain');
      assert.equal(statuses.get('count-not-started-a'), 'Belum Mulai');
      assert.equal(statuses.get('count-active-a'), 'Sedang Mengerjakan');
      assert.equal(statuses.get('count-finished-a'), 'Selesai');
      assert.deepEqual(await prisma.examSession.findMany({ where: { packageId }, orderBy: { id: 'asc' } }), before);
    });

  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await prisma?.$disconnect(); if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end();
  }
});
