import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { createLoginCardCipher } from '../dist/login-cards.js';
import { readinessProbe } from '../dist/readiness.js';
import { runtimePaths, backendDir, projectDir } from '../dist/runtime-paths.js';

const root = new URL('..', import.meta.url);
const url = process.env.INTEGRITY_TEST_DATABASE_URL;
const migrations = ['20260805150436_init', '20261024100000_align_legacy_schema', '20261024120000_student_login_cards', '20261024140000_answer_versions', '20261024160000_query_indexes', '20261029090000_unify_question_content'];
const secret = 'operations-test-secret-at-least-32-characters';
function command(args, env, expected = 0) {
  const result = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, expected, `command ${args.join(' ')}: ${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const prisma = (args, env, expected = 0) => command(['node_modules/prisma/build/index.js', ...args], env, expected);

test('runtime paths resolve outside compiled code and readiness is bounded and coalesced', async () => {
  assert.equal(runtimePaths({}).uploads, path.join(backendDir, 'uploads'));
  assert.equal(runtimePaths({}).frontend, path.join(projectDir, 'dist'));
  assert.equal(runtimePaths({ UPLOAD_DIR: '/tmp/media' }).uploads, '/tmp/media');
  let calls = 0, done;
  const check = readinessProbe(() => { calls++; return new Promise(resolve => { done = resolve; }); }, 20);
  assert.deepEqual(await Promise.all([check(), check(), check()]), [false, false, false]);
  assert.equal(calls, 1);
  done(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(await check(), true); assert.equal(calls, 1);
  assert.equal(await readinessProbe(async () => { throw new Error('private database details'); })(), false);
});

test('public readiness returns 503 without exposing dependency errors and rejects draining requests', async () => {
  const { createApp } = await import('../dist/app.js');
  let draining = false, calls = 0;
  const repository = { $queryRaw: async () => { calls++; throw new Error('postgres://private-secret@host/database'); } };
  const server = createApp(repository, secret, secret, { isDraining: () => draining }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const response = await fetch(base + '/ready');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'unavailable' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(calls, 1);
    draining = true;
    assert.equal((await fetch(base + '/ready')).status, 503);
    assert.equal(calls, 1);
    assert.equal((await fetch(base + '/health')).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('deployment migrations, encrypted cards and real pg_dump/pg_restore recovery', { skip: !url, timeout: 240000 }, async t => {
  const admin = new Pool({ connectionString: url });
  const databases = [], pools = [];
  const temp = await mkdtemp(path.join(tmpdir(), 'tka-operations-'));
  const create = async () => {
    const name = `tka_ops_${crypto.randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE "${name}"`); databases.push(name);
    const target = new URL(url); target.pathname = `/${name}`; target.search = '';
    const connection = target.toString();
    const pool = new Pool({ connectionString: connection }); pools.push(pool);
    return { pool, env: { DATABASE_URL: connection }, connection };
  };
  let source;
  try {
    await t.test('empty database deploys entire migration history with zero schema drift', async () => {
      source = await create();
      prisma(['migrate', 'deploy'], source.env);
      prisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'], source.env);
      const history = await source.pool.query('SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name');
      assert.deepEqual(history.rows.map(row => row.migration_name), migrations);
      const encrypted = createLoginCardCipher(secret).seal('student', 'ABC234');
      await source.pool.query('INSERT INTO "School" (npsn,name) VALUES ($1,$2)', ['11111111', 'Sekolah Uji']);
      await source.pool.query('INSERT INTO "User" (id,username,password,"fullName",role,"schoolNpsn","loginCardPassword","activeToken") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', ['student','siswa', await bcrypt.hash('ABC234', 4),'Siswa','siswa','11111111',encrypted,'persisted-sid']);
      await source.pool.query(`INSERT INTO "Package" (id,name,mapel) VALUES ('p','Paket','Matematika')`);
      await source.pool.query(`INSERT INTO "Question" (id,type,mapel,element,content,options,"correctAnswer") VALUES ('q','PG_Sederhana','Matematika','Bilangan','Uji','["A","B"]','0')`);
      await source.pool.query(`INSERT INTO "PackageQuestion" VALUES ('p','q'); INSERT INTO "ExamSession" (id,"studentId","packageId",status,"totalScore") VALUES ('e','student','p','selesai',100); INSERT INTO "Answer" (id,"sessionId","questionId","answerData",version,"mutationId","isCorrect") VALUES ('a','e','q','0',7,'mutation-7',true)`);
    });
    await t.test('existing db-push installation is audited then adopted without replacing credentials or results', async () => {
      const existing = await create();
      prisma(['db', 'push'], existing.env);
      await existing.pool.query(`INSERT INTO "User" (id,username,password,"fullName",role) VALUES ('kept','kept','unchanged-hash','Kept','admin')`);
      command(['scripts/adopt-database.mjs'], existing.env);
      assert.equal((await existing.pool.query(`SELECT to_regclass('public._prisma_migrations') AS name`)).rows[0].name, null);
      command(['scripts/adopt-database.mjs', '--apply'], existing.env);
      prisma(['migrate', 'deploy'], existing.env);
      assert.equal((await existing.pool.query('SELECT password FROM "User"')).rows[0].password, 'unchanged-hash');
      // Unexpected schema drift must not be silently baselined.
      await existing.pool.query('ALTER TABLE "User" ADD COLUMN unexpected TEXT');
      command(['scripts/adopt-database.mjs', '--apply'], existing.env, 1);
    });
    await t.test('partial older physical schemas are refused without changing existing answers', async () => {
      const old = await create();
      prisma(['db', 'push'], old.env);
      await old.pool.query('ALTER TABLE "User" DROP COLUMN "loginCardPassword"; ALTER TABLE "Answer" DROP COLUMN version, DROP COLUMN "mutationId"');
      const indexSql = await readFile(new URL('../prisma/migrations/20261024160000_query_indexes/migration.sql', import.meta.url), 'utf8');
      for (const match of indexSql.matchAll(/CREATE INDEX "([^"]+)"/g)) await old.pool.query(`DROP INDEX IF EXISTS "${match[1]}"`);
      await old.pool.query(`INSERT INTO "User" (id,username,password,"fullName",role) VALUES ('old','old','legacy-hash','Old','siswa'); INSERT INTO "Package" (id,name,mapel) VALUES ('p','P','M'); INSERT INTO "Question" (id,type,mapel,element,content,options,"correctAnswer") VALUES ('q','PG_Sederhana','M','E','Q','[]','0'); INSERT INTO "ExamSession" (id,"studentId","packageId") VALUES ('e','old','p'); INSERT INTO "Answer" (id,"sessionId","questionId","answerData") VALUES ('a','e','q','0')`);
      command(['scripts/adopt-database.mjs', '--apply'], old.env, 1);
      assert.equal((await old.pool.query('SELECT "answerData" FROM "Answer"')).rows[0].answerData, 0);
      assert.equal((await old.pool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='Answer' AND column_name='version'`)).rows[0].n, 0);
      assert.equal((await old.pool.query('SELECT password FROM "User"')).rows[0].password, 'legacy-hash');
    });
    await t.test('populated original legacy schema refuses invented NPSN and credentials and rolls back', async () => {
      const legacy = await create();
      await legacy.pool.query(await readFile(new URL(`../prisma/migrations/${migrations[0]}/migration.sql`, import.meta.url), 'utf8'));
      await legacy.pool.query(`INSERT INTO "School" (id,name) VALUES ('legacy-uuid','Old School')`);
      const bridge = await readFile(new URL(`../prisma/migrations/${migrations[1]}/migration.sql`, import.meta.url), 'utf8');
      await assert.rejects(legacy.pool.query(bridge), /reviewed NPSN/);
      await legacy.pool.query('ROLLBACK');
      assert.equal((await legacy.pool.query('SELECT id FROM "School"')).rows[0].id, 'legacy-uuid');
      command(['scripts/adopt-database.mjs', '--apply'], legacy.env, 1);
    });
    await t.test('backup and restore preserve data, media, password hashes and encrypted login cards', async () => {
      const media = path.join(temp, 'media'), backups = path.join(temp, 'backups');
      await mkdir(media); await writeFile(path.join(media, 'question.png'), 'example-image-content');
      command(['scripts/backup.mjs'], { ...source.env, STORAGE_PROVIDER: 'LOCAL', UPLOAD_DIR: media, BACKUP_DIR: backups });
      const bundle = path.join(backups, (await readdir(backups)).find(name => !name.endsWith('.partial')));
      const restored = await create();
      const restoredMedia = path.join(temp, 'restored-media');
      command(['scripts/restore.mjs', bundle], { DATABASE_URL: source.connection, RESTORE_DATABASE_URL: restored.connection, RESTORE_UPLOAD_DIR: restoredMedia });
      const before = (await source.pool.query('SELECT * FROM "User" ORDER BY id')).rows;
      const after = (await restored.pool.query('SELECT * FROM "User" ORDER BY id')).rows;
      assert.deepEqual(after, before);
      assert.equal(await bcrypt.compare('ABC234', after[0].password), true);
      assert.equal(createLoginCardCipher(secret).open('student', after[0].loginCardPassword), 'ABC234');
      assert.deepEqual((await restored.pool.query('SELECT * FROM "Answer"')).rows, (await source.pool.query('SELECT * FROM "Answer"')).rows);
      assert.equal((await restored.pool.query('SELECT "totalScore" FROM "ExamSession"')).rows[0].totalScore, '100.00');
      assert.equal(await readFile(path.join(restoredMedia, 'question.png'), 'utf8'), 'example-image-content');
      prisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'], restored.env);
      // Never overwrite a populated DB, even when the media destination is empty.
      command(['scripts/restore.mjs', bundle], { RESTORE_DATABASE_URL: restored.connection, RESTORE_UPLOAD_DIR: path.join(temp, 'other-media') }, 1);
      // Corruption is rejected before any database changes.
      await writeFile(path.join(bundle, 'database.dump'), 'corrupt');
      const blank = await create();
      command(['scripts/restore.mjs', bundle], { RESTORE_DATABASE_URL: blank.connection, RESTORE_UPLOAD_DIR: path.join(temp, 'blank-media') }, 1);
      assert.equal((await blank.pool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`)).rows[0].n, 0);
    });
    await t.test('compiled production server serves frontend/media, readiness and exits cleanly on SIGTERM', async () => {
      const frontend = path.join(temp, 'frontend'); await mkdir(frontend); await writeFile(path.join(frontend, 'index.html'), '<html>DEPLOYMENT_FRONTEND_OK</html>');
      const child = spawn(process.execPath, ['dist/index.js'], { cwd: root, env: { ...process.env, ...source.env, JWT_SECRET: secret, LOGIN_CARD_SECRET: secret, NODE_ENV: 'production', PORT: '0', USE_REDIS: 'false', STORAGE_PROVIDER: 'LOCAL', FRONTEND_DIST_DIR: frontend, UPLOAD_DIR: path.join(temp, 'media') }, stdio: ['ignore','pipe','pipe','ipc'] });
      let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', () => {});
      const exit = new Promise(resolve => child.once('exit', code => resolve(code)));
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('startup timeout: ' + output)), 15000);
          child.once('message', message => { clearTimeout(timer); assert.equal(message, 'ready'); resolve(); });
          child.once('exit', () => { clearTimeout(timer); reject(new Error('server failed startup')); });
        });
        // PORT=0 logs its actual bound port for smoke checks.
        const port = /Server is running on port (\d+)/.exec(output)?.[1];
        assert.ok(port && port !== '0');
        const base = `http://127.0.0.1:${port}`;
        assert.match(await (await fetch(base + '/dashboard')).text(), /DEPLOYMENT_FRONTEND_OK/);
        assert.equal(await (await fetch(base + '/uploads/question.png')).text(), 'example-image-content');
        assert.equal((await fetch(base + '/api/health')).status, 200);
        assert.equal((await fetch(base + '/api/ready')).status, 200);
        assert.equal((await fetch(base + '/api/users')).status, 401);
        child.kill('SIGTERM');
        assert.equal(await exit, 0);
      } finally { child.kill('SIGKILL'); }
    });
  } finally {
    for (const pool of pools) await pool.end();
    for (const name of databases) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end(); await rm(temp, { recursive: true, force: true });
  }
});
