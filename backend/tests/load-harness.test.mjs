import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { seedLoadFixture, prepareLoadStage, auditLoadStage } from '../scripts/load-fixture.mjs';
const root = new URL('..', import.meta.url);
const url = process.env.INTEGRITY_TEST_DATABASE_URL;

test('load harness refuses an implicit application database', () => {
  const result = spawnSync(process.execPath, ['scripts/run-load-test.mjs'], { cwd: root, env: { ...process.env, LOAD_TEST_DATABASE_URL: '', DATABASE_URL: 'postgresql://must-not-be-used' }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Load harness failed/);
});

test('isolated load fixture, database audit and two-worker graceful shutdown', { skip: !url, timeout: 60000 }, async t => {
  const database = `tka_loadtest_${crypto.randomUUID().replaceAll('-','')}`;
  const admin = new Pool({ connectionString: url });
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'tka-loadtest-'));
  let pool, child, workerPids = [], created = false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`); created = true;
    const target = new URL(url); target.pathname = `/${database}`; target.search = '';
    const secret = 'load-harness-test-secret-with-32-characters';
    const env = { ...process.env, DATABASE_URL: target.toString(), JWT_SECRET: secret, LOGIN_CARD_SECRET: secret, NODE_ENV: 'production', USE_REDIS: 'false', STORAGE_PROVIDER: 'LOCAL', APP_WORKERS: '2', PORT: '0', LOAD_TEST_RUN_ID: 'test', UPLOAD_DIR: path.join(temporary,'media'), FRONTEND_DIST_DIR: path.join(temporary,'frontend') };
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js','migrate','deploy'], { cwd: root, env, stdio: 'pipe' });
    pool = new Pool({ connectionString: target.toString() });
    const fixture = await seedLoadFixture(pool, 4, 3);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM "Answer"')).rows[0].n, 12);
    const credentialFile = path.join(temporary,'credentials.json');
    const token = await prepareLoadStage(pool, fixture, 'stage', secret, credentialFile);
    const credentials = JSON.parse(await readFile(credentialFile, 'utf8'));
    assert.equal(credentials.length, 4); assert.equal(new Set(credentials.map(row => row.id)).size, 4);
    assert.equal((await stat(credentialFile)).mode & 0o777, 0o600);
    assert.equal(jwt.verify(credentials[0].token, secret).id, 's1');
    await mkdir(env.FRONTEND_DIST_DIR); await writeFile(path.join(env.FRONTEND_DIST_DIR,'index.html'), 'LOAD_TEST');
    child = spawn(process.execPath, ['scripts/load-server.mjs'], { cwd: root, env, stdio: ['ignore','ignore','ignore','ipc'] });
    const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('cluster startup timed out')), 15000);
      child.once('message', message => { clearTimeout(timer); assert.equal(message.event, 'ready'); resolve(message); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('cluster startup failed')); });
    });
    workerPids = ready.pids; assert.equal(workerPids.length, 2);
    const base = `http://127.0.0.1:${ready.port}/api`;
    const post = async (route, payload) => {
      const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${credentials[0].token}` }, body: JSON.stringify(payload) });
      assert.equal(response.status, 200); return response.json();
    };
    await t.test('fixture credentials run a real exam and the audit detects persisted corruption', async () => {
      const started = await post('/sessions/start', { token });
      const manifest = [];
      for (const question of started.questions) {
        const payload = { questionId: question.id, answerData: question.type === 'Pilihan Ganda Sederhana' ? 0 : question.type === 'Pilihan Ganda Kompleks' ? [0] : [0,0,0,0], version: 1, mutationId: `load-test-mutation-${question.id}` };
        const saved = await post(`/sessions/${started.session.id}/answer`, payload);
        manifest.push({ questionId: saved.questionId, version: saved.version, mutationId: saved.mutationId });
      }
      await post(`/sessions/${started.session.id}/finish`, { expectedAnswers: manifest });
      const valid = await auditLoadStage(pool, 'stage', 3, 1, 'steady', 1, 1);
      assert.equal(valid.passed, true); assert.equal(valid.allParticipantsFinished, true);
      await pool.query('UPDATE "Answer" SET version=2 WHERE "sessionId"=$1', [started.session.id]);
      const invalid = await auditLoadStage(pool, 'stage', 3, 1, 'steady', 1, 1);
      assert.equal(invalid.invalidFinishedSessions, 1); assert.equal(invalid.passed, false);
    });
    await t.test('SIGTERM closes both worker IPC channels and exits before the forced deadline', async () => {
      const started = Date.now(); child.kill('SIGTERM');
      let timer;
      const code = await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('worker shutdown exceeded 5 seconds')), 5000); })]).finally(() => clearTimeout(timer));
      assert.equal(code, 0); assert.ok(Date.now()-started < 5000);
    });
  } finally {
    if (child?.exitCode === null) child.kill('SIGKILL');
    if (child?.exitCode !== 0) for (const pid of workerPids) { try { process.kill(pid, 'SIGKILL'); } catch { /* Already exited. */ } }
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end(); await rm(temporary, { recursive: true, force: true });
  }
});
