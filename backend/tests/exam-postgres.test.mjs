import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

process.env.USE_REDIS = 'false';
process.env.STORAGE_PROVIDER = 'LOCAL';
const { createApp } = await import('../dist/app.js');
const { startExam, saveExamAnswer: versionedSave, finishExam: versionedFinish, finalizeExpiredExams } = await import('../dist/exam.js');

const saveExamAnswer = (...args) => versionedSave(...args, { version: 1, mutationId: crypto.randomUUID() });
const finishExam = (...args) => versionedFinish(...args, []);

// Explicit opt-in only; never fall back to DATABASE_URL or reuse an existing schema.
const url = process.env.INTEGRITY_TEST_DATABASE_URL;
test('exam transactions on isolated PostgreSQL schema', { skip: !url, timeout: 60000 }, async t => {
  const schema = `tka_integrity_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: url });
  let prisma, other, server;
  const pools = [];
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const ddl = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
    const connection = await admin.connect();
    try {
      await connection.query(`SET search_path TO "${schema}"`);
      await connection.query(ddl);
    } finally { connection.release(); }
    const makeClient = () => {
      const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 20 });
      pools.push(pool);
      return new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    };
    prisma = makeClient();
    other = makeClient();
    const secret = 'postgres-integration-secret-at-least-32-characters';
    server = createApp(prisma, secret).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, id = 's1', method = 'POST', body = {}) {
      if (method === 'POST' && /\/sessions\/[^/]+\/answer$/.test(path)) body = { version: 1, mutationId: crypto.randomUUID(), ...body };
      if (method === 'POST' && /\/sessions\/[^/]+\/finish$/.test(path)) body = { expectedAnswers: [], ...body };
      const token = jwt.sign({ id, sid: `sid-${id}` }, secret, { expiresIn: '5m' });
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    }
    async function reset() {
      await prisma.answer.deleteMany();
      await prisma.examSession.deleteMany();
      await prisma.packageQuestion.deleteMany();
      await prisma.package.deleteMany();
      await prisma.question.deleteMany();
      await prisma.readingText.deleteMany();
      await prisma.user.deleteMany();
      await prisma.user.createMany({ data: [
        { id: 's1', username: 's1', password: 'unused', fullName: 'Siswa 1', role: 'siswa', activeToken: 'sid-s1' },
        { id: 's2', username: 's2', password: 'unused', fullName: 'Siswa 2', role: 'siswa', activeToken: 'sid-s2' },
        { id: 'admin', username: 'admin', password: 'unused', fullName: 'Admin', role: 'admin', activeToken: 'sid-admin' },
      ] });
      await prisma.readingText.create({ data: { id: 'r1', title: 'Bacaan', content: 'Teks' } });
      await prisma.question.createMany({ data: [
        { id: 'q1', type: 'Pilihan Ganda Sederhana', mapel: 'Matematika', element: 'Bilangan', content: 'PG', options: [{ text: 'A' }, { text: 'B' }], correctAnswer: [0], readingId: 'r1' },
        { id: 'q2', type: 'Pilihan Ganda Kompleks', mapel: 'Matematika', element: 'Bilangan', content: 'Kompleks', options: [{}, {}, {}], correctAnswer: [0, 2] },
        { id: 'q3', type: 'Pilihan Ganda Kompleks Kategori', mapel: 'Matematika', element: 'Bilangan', content: 'Kategori', options: [{}, {}], correctAnswer: [0, 1] },
        { id: 'foreign', type: 'Pilihan Ganda Sederhana', mapel: 'Matematika', element: 'Bilangan', content: 'Di luar paket', options: [{}, {}], correctAnswer: [0] },
      ] });
      await prisma.package.create({ data: { id: 'p1', name: 'Ujian', mapel: 'Matematika', token: 'EXAM', status: 'aktif', durationMinutes: 10, questions: { create: ['q1', 'q2', 'q3'].map(questionId => ({ questionId })) } } });
    }
    t.beforeEach(reset);
    const open = async id => (await startExam(prisma, id || 's1', 'EXAM')).session;
    const expire = async id => prisma.examSession.update({ where: { id }, data: { startTime: new Date(Date.now() - 11 * 60000) } });
    const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
    // Test-only transaction proxy pauses inside real transactions, while locks are held.
    const paused = (model, method, reached, release, fail = false) => new Proxy(prisma, {
      get(target, key) {
        if (key !== '$transaction') return Reflect.get(target, key);
        return (action, options) => target.$transaction(tx => action(new Proxy(tx, {
          get(client, name) {
            if (name !== model) return Reflect.get(client, name);
            return new Proxy(client[name], { get(repo, operation) {
              if (operation !== method) return Reflect.get(repo, operation);
              return async (...args) => {
                const result = await repo[operation](...args);
                reached.resolve();
                await release.promise;
                if (fail) throw new Error('injected transaction failure');
                return result;
              };
            } });
          },
        })), options);
      },
    });

    await t.test('simultaneous HTTP starts create exactly one session and preserve its start time', async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => request('/sessions/start', 's1', 'POST', { token: 'EXAM' })));
      assert.ok(results.every(result => result.status === 200), JSON.stringify(results));
      assert.equal(new Set(results.map(result => result.body.session.id)).size, 1);
      assert.equal(new Set(results.map(result => result.body.session.startTime)).size, 1);
      assert.equal(await prisma.examSession.count(), 1);
      assert.deepEqual(results[0].body.questions.map(q => q.id), ['q1', 'q2', 'q3']);
      assert.ok(results[0].body.remainingSeconds > 0 && results[0].body.remainingSeconds <= 600);
      assert.ok(results[0].body.questions.every(q => !('correctAnswer' in q)));
    });
    await t.test('rejects foreign questions and malformed payloads through HTTP without inserting answers', async () => {
      const session = await open();
      for (const [questionId, answerData] of [['foreign', 0], ['q1', { selected: 'A' }], ['q1', '0'], ['q1', -1], ['q2', [0, 0]], ['q2', [5]], ['q3', [true]], ['q3', [0, 1, 1]]]) {
        const result = await request(`/sessions/${session.id}/answer`, 's1', 'POST', { questionId, answerData });
        assert.equal(result.status, 400, JSON.stringify(result));
      }
      assert.equal(await prisma.answer.count(), 0);
    });
    await t.test('partial category answers, empty multiple answers, and cleared answers persist as valid JSON', async () => {
      const session = await open();
      for (const [questionId, answerData] of [['q1', null], ['q2', []], ['q3', [null, 1]]]) {
        assert.equal((await request(`/sessions/${session.id}/answer`, 's1', 'POST', { questionId, answerData })).status, 200);
      }
      assert.equal((await prisma.answer.findFirst({ where: { questionId: 'q1' } })).answerData, null);
      assert.equal(Number((await finishExam(prisma, 's1', session.id)).totalScore), 0);
    });
    await t.test('expiry rejects a late answer, commits finalization, and caps endTime at the deadline', async () => {
      const session = await open();
      await saveExamAnswer(prisma, 's1', session.id, 'q1', 0);
      const expired = await expire(session.id);
      const result = await request(`/sessions/${session.id}/answer`, 's1', 'POST', { questionId: 'q2', answerData: [0, 2], timestamp: 0 });
      assert.equal(result.status, 409);
      assert.equal(result.body.error, 'EXAM_EXPIRED');
      const stored = await prisma.examSession.findUnique({ where: { id: session.id } });
      assert.equal(stored.status, 'selesai');
      assert.equal(Number(stored.totalScore), 33.33);
      assert.equal(stored.endTime.getTime(), expired.startTime.getTime() + 600000);
      assert.equal(await prisma.answer.count(), 1);
    });
    await t.test('expired resume is finalized; closed package still permits existing students to resume', async () => {
      const session = await open();
      await prisma.package.update({ where: { id: 'p1' }, data: { status: 'ditutup' } });
      assert.equal((await startExam(prisma, 's1', 'EXAM')).session.id, session.id);
      await assert.rejects(() => startExam(prisma, 's2', 'EXAM'), { code: 'EXAM_INACTIVE' });
      await expire(session.id);
      const resumed = await startExam(prisma, 's1', 'EXAM');
      assert.equal(resumed.session.status, 'selesai');
      assert.equal(resumed.remainingSeconds, 0);
    });
    await t.test('finish is idempotent under concurrent calls and prevents all later writes', async () => {
      const session = await open();
      await saveExamAnswer(prisma, 's1', session.id, 'q1', 0);
      await saveExamAnswer(prisma, 's1', session.id, 'q2', [2, 0]);
      await saveExamAnswer(prisma, 's1', session.id, 'q3', [0, 1]);
      const results = await Promise.all(Array.from({ length: 8 }, () => finishExam(other, 's1', session.id)));
      assert.ok(results.every(r => Number(r.totalScore) === 100));
      assert.equal(new Set(results.map(r => r.endTime.toISOString())).size, 1);
      const result = await request(`/sessions/${session.id}/answer`, 's1', 'POST', { questionId: 'q1', answerData: 1 });
      assert.equal(result.status, 409);
      assert.equal(result.body.error, 'EXAM_CLOSED');
      assert.equal((await prisma.answer.findFirst({ where: { sessionId: session.id, questionId: 'q1' } })).answerData, 0);
    });
    await t.test('delayed score release stays hidden and later release does not regrade or change endTime', async () => {
      const session = await open();
      await saveExamAnswer(prisma, 's1', session.id, 'q1', 0);
      await prisma.package.update({ where: { id: 'p1' }, data: { releaseScoreMode: 'ditunda' } });
      const hidden = await finishExam(prisma, 's1', session.id);
      assert.equal(hidden.releaseScoreMode, 'ditunda');
      assert.equal(hidden.totalScore, null);
      await prisma.package.update({ where: { id: 'p1' }, data: { releaseScoreMode: 'langsung' } });
      const released = await finishExam(prisma, 's1', session.id);
      assert.equal(Number(released.totalScore), 33.33);
      assert.equal(released.endTime.getTime(), hidden.endTime.getTime());
    });
    await t.test('a save that holds the session lock completes before competing finalization', async () => {
      const session = await open();
      const reached = deferred(), release = deferred();
      const saving = saveExamAnswer(paused('answer', 'upsert', reached, release), 's1', session.id, 'q1', 0);
      await reached.promise;
      let done = false;
      const finishing = finishExam(other, 's1', session.id).then(value => { done = true; return value; });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(done, false);
      release.resolve();
      await saving;
      assert.equal(Number((await finishing).totalScore), 33.33);
    });
    await t.test('a finish that holds the lock prevents a competing answer from changing the grade', async () => {
      const session = await open();
      const reached = deferred(), release = deferred();
      const finishing = finishExam(paused('examSession', 'update', reached, release), 's1', session.id);
      await reached.promise;
      const saving = saveExamAnswer(other, 's1', session.id, 'q1', 0);
      release.resolve();
      assert.equal(Number((await finishing).totalScore), 0);
      assert.equal((await saving).error, 'EXAM_CLOSED');
      assert.equal(await prisma.answer.count(), 0);
    });
    await t.test('failure after grading flags are updated rolls back flags and session together', async () => {
      const session = await open();
      await saveExamAnswer(prisma, 's1', session.id, 'q1', 0);
      const reached = deferred(), release = deferred(); release.resolve();
      await assert.rejects(() => finishExam(paused('examSession', 'update', reached, release, true), 's1', session.id), /injected/);
      const stored = await prisma.examSession.findUnique({ where: { id: session.id } });
      assert.equal(stored.status, 'sedang_mengerjakan');
      assert.equal(stored.totalScore, null);
      assert.equal((await prisma.answer.findFirst({ where: { sessionId: session.id } })).isCorrect, null);
      assert.equal(Number((await finishExam(prisma, 's1', session.id)).totalScore), 33.33);
    });
    await t.test('deadline is checked after lock wait using live database time', async () => {
      const session = await open();
      await prisma.examSession.update({ where: { id: session.id }, data: { startTime: new Date(Date.now() - 600000 + 700) } });
      const lock = await pools[0].connect();
      try {
        await lock.query('BEGIN');
        await lock.query('SELECT id FROM "ExamSession" WHERE id = $1 FOR UPDATE', [session.id]);
        const saving = saveExamAnswer(other, 's1', session.id, 'q1', 0);
        await new Promise(resolve => setTimeout(resolve, 900));
        await lock.query('COMMIT');
        assert.equal((await saving).error, 'EXAM_EXPIRED');
        assert.equal(await prisma.answer.count(), 0);
      } finally { await lock.query('ROLLBACK'); lock.release(); }
    });
    await t.test('abandoned sessions are finalized by the bounded sweep, including concurrent workers', async () => {
      const session = await open();
      await expire(session.id);
      await Promise.all([finalizeExpiredExams(prisma), finalizeExpiredExams(other)]);
      assert.equal((await prisma.examSession.findUnique({ where: { id: session.id } })).status, 'selesai');
      assert.equal(await finalizeExpiredExams(prisma), 0);
    });
    await t.test('foreign legacy answers do not inflate scores and invalid legacy answers grade as false', async () => {
      const session = await open();
      await prisma.answer.createMany({ data: [
        { sessionId: session.id, questionId: 'foreign', answerData: 0 },
        { sessionId: session.id, questionId: 'q2', answerData: [0, 0] },
      ] });
      assert.equal(Number((await finishExam(prisma, 's1', session.id)).totalScore), 0);
      assert.ok((await prisma.answer.findMany()).every(a => a.isCorrect === false));
    });
    await t.test('used packages, questions and readings are frozen; status and release settings remain editable', async () => {
      await open();
      for (const [path, method, body] of [
        ['/packages/p1', 'PUT', { durationMinutes: 20 }], ['/packages/p1', 'PUT', { questionIds: ['q1'] }],
        ['/questions/q1', 'PUT', { content: 'Changed' }], ['/questions/q1', 'DELETE', {}],
        ['/readings/r1', 'PUT', { content: 'Changed' }], ['/readings/r1', 'DELETE', {}],
      ]) {
        const result = await request(path, 'admin', method, body);
        assert.equal(result.status, 409, JSON.stringify(result));
        assert.equal(result.body.error, 'EXAM_CONTENT_LOCKED');
      }
      assert.equal((await request('/packages/p1', 'admin', 'PUT', { status: 'ditutup', releaseScoreMode: 'ditunda', questionIds: ['q3', 'q2', 'q1'] })).status, 200);
      assert.equal((await prisma.package.findUnique({ where: { id: 'p1' } })).durationMinutes, 10);
    });
    await t.test('content edits racing the first start cannot mutate an exam already in use', async () => {
      const reached = deferred(), release = deferred();
      const opening = startExam(paused('examSession', 'create', reached, release), 's1', 'EXAM');
      await reached.promise;
      let done = false;
      const editing = request('/questions/q1', 'admin', 'PUT', { content: 'Changed' }).then(value => { done = true; return value; });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(done, false);
      release.resolve();
      await opening;
      assert.equal((await editing).status, 409);
      assert.equal((await prisma.question.findUnique({ where: { id: 'q1' } })).content, 'PG');
    });
    await t.test('invalid package configuration prevents starting a new exam', async () => {
      await prisma.question.update({ where: { id: 'q1' }, data: { correctAnswer: [] } });
      await assert.rejects(() => startExam(prisma, 's1', 'EXAM'), { code: 'INVALID_EXAM_CONFIG' });
      assert.equal(await prisma.examSession.count(), 0);
    });
    await t.test('late old versions cannot overwrite the latest answer and retries are idempotent', async () => {
      const session = await open();
      const old = { version: 1, mutationId: crypto.randomUUID() };
      const latest = { version: 2, mutationId: crypto.randomUUID() };
      assert.equal((await versionedSave(prisma, 's1', session.id, 'q1', 1, latest)).acknowledged, true);
      const stale = await versionedSave(other, 's1', session.id, 'q1', 0, old);
      assert.equal(stale.error, 'ANSWER_VERSION_CONFLICT');
      assert.equal(stale.currentAnswer.version, 2);
      assert.equal(stale.currentAnswer.answerData, 1);
      const replay = await versionedSave(other, 's1', session.id, 'q1', 1, latest);
      assert.equal(replay.acknowledged, true);
      assert.equal(replay.version, 2);
      assert.equal(await prisma.answer.count({ where: { sessionId: session.id } }), 1);
      const changedReplay = await versionedSave(prisma, 's1', session.id, 'q1', 0, latest);
      assert.equal(changedReplay.error, 'ANSWER_VERSION_CONFLICT');
      const reusedId = await versionedSave(prisma, 's1', session.id, 'q1', 0, { ...latest, version: 3 });
      assert.equal(reusedId.error, 'ANSWER_VERSION_CONFLICT');
      const resume = await startExam(prisma, 's1', 'EXAM');
      assert.deepEqual(resume.existingAnswers[0], { questionId: 'q1', answerData: 1, version: 2, mutationId: latest.mutationId });
      assert.equal(Number((await versionedFinish(prisma, 's1', session.id, [{ questionId: 'q1', ...latest }])).totalScore), 0);
    });
    await t.test('simultaneous out-of-order HTTP writes retain the highest version across clients', async () => {
      const session = await open();
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => request(`/sessions/${session.id}/answer`, 's1', 'POST', {
        questionId: 'q1', answerData: i % 2, version: i + 1, mutationId: crypto.randomUUID(),
      })));
      assert.ok(results.every(result => [200, 409].includes(result.status)), JSON.stringify(results));
      const stored = await prisma.answer.findUnique({ where: { sessionId_questionId: { sessionId: session.id, questionId: 'q1' } } });
      assert.equal(stored.version, 20);
      assert.equal(stored.answerData, 1);
    });
    await t.test('same version with different IDs admits one writer and returns an explicit conflict to the other', async () => {
      const session = await open();
      const results = await Promise.all([0, 1].map(answer => versionedSave(answer ? other : prisma, 's1', session.id, 'q1', answer, { version: 1, mutationId: crypto.randomUUID() })));
      assert.equal(results.filter(result => result.acknowledged).length, 1);
      assert.equal(results.filter(result => result.error === 'ANSWER_VERSION_CONFLICT').length, 1);
      const saved = results.find(result => result.acknowledged);
      assert.equal((await prisma.answer.findFirst({ where: { sessionId: session.id } })).answerData, saved.answerData);
    });
    await t.test('unversioned or invalid-version requests cannot downgrade an existing answer', async () => {
      const session = await open();
      const latest = { version: 4, mutationId: crypto.randomUUID() };
      await versionedSave(prisma, 's1', session.id, 'q1', 0, latest);
      for (const version of [undefined, 0, -1, 1.5, '5', 2147483648]) {
        await assert.rejects(() => versionedSave(prisma, 's1', session.id, 'q1', 1, { version, mutationId: crypto.randomUUID() }), { code: 'INVALID_ANSWER_VERSION' });
      }
      const raw = await fetch(base + `/sessions/${session.id}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: 's1', sid: 'sid-s1' }, secret)}` },
        body: JSON.stringify({ questionId: 'q1', answerData: 1 }),
      });
      assert.equal(raw.status, 400);
      assert.equal((await prisma.answer.findFirst({ where: { sessionId: session.id } })).version, 4);
    });
    await t.test('manual finalization requires exact confirmed versions and leaves the exam open when unsynced', async () => {
      const session = await open();
      const saved = { version: 1, mutationId: crypto.randomUUID() };
      await versionedSave(prisma, 's1', session.id, 'q1', 0, saved);
      await assert.rejects(() => versionedFinish(prisma, 's1', session.id, [{ questionId: 'q1', version: 2, mutationId: crypto.randomUUID() }]), { code: 'ANSWERS_NOT_SYNCED' });
      await assert.rejects(() => versionedFinish(prisma, 's1', session.id, undefined), { code: 'INVALID_ANSWER_MANIFEST' });
      assert.equal((await prisma.examSession.findUnique({ where: { id: session.id } })).status, 'sedang_mengerjakan');
      assert.equal((await prisma.answer.findFirst({ where: { sessionId: session.id } })).isCorrect, null);
      const final = await versionedFinish(prisma, 's1', session.id, [{ questionId: 'q1', ...saved }]);
      assert.equal(final.status, 'selesai');
      assert.equal(Number(final.totalScore), 33.33);
    });
    await t.test('expired finalization is not blocked by an unsynced manifest', async () => {
      const session = await open();
      await expire(session.id);
      assert.equal((await versionedFinish(prisma, 's1', session.id, undefined)).status, 'selesai');
    });
    await t.test('answer version migration preserves legacy data and version zero can be confirmed', async () => {
      const session = await open();
      await prisma.answer.create({ data: { sessionId: session.id, questionId: 'q1', answerData: 0 } });
      await prisma.$executeRawUnsafe('ALTER TABLE "Answer" DROP COLUMN "version", DROP COLUMN "mutationId"');
      const migration = readFileSync(new URL('../prisma/migrations/20261024140000_answer_versions/migration.sql', import.meta.url), 'utf8');
      await prisma.$executeRawUnsafe(migration);
      const stored = await prisma.answer.findFirst({ where: { sessionId: session.id } });
      assert.equal(stored.answerData, 0);
      assert.equal(stored.version, 0);
      assert.equal(stored.mutationId, null);
      const final = await versionedFinish(prisma, 's1', session.id, [{ questionId: 'q1', version: 0, mutationId: null }]);
      assert.equal(Number(final.totalScore), 33.33);
    });
    await t.test('login card migration adds a nullable column without replacing existing accounts or sessions', async () => {
      const session = await open();
      const original = await prisma.user.findUnique({ where: { id: 's1' } });
      await prisma.$executeRawUnsafe('ALTER TABLE "User" DROP COLUMN "loginCardPassword"');
      const migration = readFileSync(new URL('../prisma/migrations/20261024120000_student_login_cards/migration.sql', import.meta.url), 'utf8');
      await prisma.$executeRawUnsafe(migration);
      const after = await prisma.user.findUnique({ where: { id: 's1' } });
      assert.equal(after.password, original.password);
      assert.equal(after.activeToken, original.activeToken);
      assert.equal(after.loginCardPassword, null);
      assert.equal((await prisma.examSession.findUnique({ where: { id: session.id } })).status, 'sedang_mengerjakan');
    });
    await t.test('student cards survive app reload and login succeeds with the same short password', async () => {
      const create = await request('/users/siswa', 'admin', 'POST', { nisn: '1234567890', fullName: 'Kartu' });
      assert.equal(create.status, 200);
      const student = await prisma.user.findUnique({ where: { username: '1234567890' } });
      assert.match(create.body.user.tempPassword, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
      assert.ok(student.loginCardPassword.startsWith('v1.'));
      const response = await fetch(base + `/users/${student.id}/login-card`, { headers: { Authorization: `Bearer ${jwt.sign({ id: 'admin', sid: 'sid-admin' }, secret)}` } });
      const card = await response.json();
      assert.equal(card.loginPassword, create.body.user.tempPassword);
      assert.ok(!('password' in card));
      assert.ok(!('loginCardPassword' in card));
      const login = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: student.username, password: card.loginPassword }) });
      assert.equal(login.status, 200);
      const reset = await request(`/users/${student.id}/login-card/reset`, 'admin');
      assert.equal(reset.status, 200);
      const invalid = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: student.username, password: card.loginPassword }) });
      assert.equal(invalid.status, 401);
      const fresh = await request(`/users/${student.id}/login-card`, 'admin', 'GET');
      assert.equal(fresh.body.loginPassword, reset.body.loginPassword);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await Promise.allSettled([prisma?.$disconnect(), other?.$disconnect()]);
    await Promise.allSettled(pools.map(pool => pool.end()));
    // schema is a generated identifier owned solely by this run.
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
