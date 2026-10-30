import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { liveTarget, balancedDummyStudents } from '../scripts/live-load-config.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function fixtureData() {
  const prefix = '55555';
  const schools = Array.from({ length: 100 }, (_, i) => ({ npsn: prefix + String(i + 1).padStart(3, '0'), name: `DUMMY ${i + 1}` }));
  const credentials = Array.from({ length: 10000 }, (_, i) => ({ id: `student-${i + 1}`,
    username: prefix + String(i + 1).padStart(5, '0'), password: 'fixture-only', schoolNpsn: schools[Math.floor(i / 100)].npsn }));
  return { fixture: { base: 'https://naingsima.my.id', run: 'LOCAL-TEST', prefix, schools, verified: true }, credentials };
}
test('live target supports explicit internal origins and rejects ambiguous or credential-bearing URLs', () => {
  assert.equal(liveTarget('https://naingsima.my.id/'), 'https://naingsima.my.id');
  assert.equal(liveTarget('http://10.128.0.10:3001'), 'http://10.128.0.10:3001');
  assert.equal(liveTarget('http://[::1]:3001'), 'http://[::1]:3001');
  for (const value of ['file:///tmp/test', 'https://user:password@example.com', 'https://example.com/api',
    'https://example.com/?query=yes', 'https://example.com/#fragment', 'https://exam\nple.com', '', undefined]) {
    assert.throws(() => liveTarget(value));
  }
});
test('portable fixture balances schools and rejects duplicated or foreign identities', () => {
  const { fixture, credentials } = fixtureData();
  const balanced = balancedDummyStudents(fixture, credentials);
  assert.equal(new Set(balanced.slice(0, 100).map(c => c.schoolNpsn)).size, 100);
  assert.equal(balanced[0].username, credentials[0].username);
  assert.equal(balanced[100].username, credentials[1].username);
  const duplicate = structuredClone(credentials); duplicate[1].username = duplicate[0].username;
  assert.throws(() => balancedDummyStudents(fixture, duplicate));
  const foreign = structuredClone(credentials); foreign[0].schoolNpsn = 'real-school';
  assert.throws(() => balancedDummyStudents(fixture, foreign));
  assert.throws(() => balancedDummyStudents(fixture, credentials.slice(0, 9999)));
});

async function command(cmd, args, options = {}) {
  const child = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  assert.equal(code, 0, stderr || stdout); return stdout;
}
test('exported kit runs a k6 journey against a local fake API outside the repository', { skip: !process.env.K6_BIN, timeout: 60000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'totka-kit-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const { fixture, credentials } = fixtureData();
  fixture.dir = path.join(temporary, 'prepared'); fs.mkdirSync(fixture.dir);
  fs.writeFileSync(path.join(fixture.dir, 'student-credentials.json'), JSON.stringify(credentials));
  const fixtureFile = path.join(temporary, 'fixture.json'); fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
  const types = ['Pilihan Ganda Sederhana', 'Pilihan Ganda Kompleks', 'Pilihan Ganda Kompleks Kategori'];
  const sources = Array.from({ length: 30 }, (_, i) => ({ type: types[i % 3], mapel: 'Matematika', element: 'Bilangan',
    content: 'Soal fixture lokal', options: [{ id: 0, text: 'A' }, { id: 1, text: 'B' }],
    correctAnswer: i % 3 === 0 ? [0] : i % 3 === 1 ? [0, 1] : [0, 1] }));
  const keys = sources.map((q, i) => ({ id: `q-${i}`, type: q.type, correctAnswer: q.correctAnswer }));
  const sourceFile = path.join(temporary, 'sources.json'); fs.writeFileSync(sourceFile, JSON.stringify(sources));
  const bank = path.join(temporary, 'bank'); fs.mkdirSync(bank);
  fs.writeFileSync(path.join(bank, 'report.json'), JSON.stringify({ run: 'LOCAL-BANK', target: fixture.base, fixture: fixture.run, questionIds: keys.map(q => q.id) }));
  fs.writeFileSync(path.join(bank, 'question-keys.json'), JSON.stringify(keys));
  const exported = JSON.parse(await command(process.execPath, ['backend/scripts/export-live-load-kit.mjs'], { cwd: project,
    env: { ...process.env, LIVE_FIXTURE_FILE: fixtureFile, LIVE_QUESTION_SOURCE_FILE: sourceFile, LIVE_REUSE_QUESTIONS_DIR: bank, LIVE_EXPORT_ROOT: temporary } }));
  assert.equal(exported.includesAdminCredentials, false);
  const extracted = path.join(temporary, 'extracted'); fs.mkdirSync(extracted);
  execFileSync('tar', ['-xzf', exported.archive, '-C', extracted]);
  const kit = path.join(extracted, 'totka-k6-gcp');
  assert.equal(fs.existsSync(path.join(kit, 'admin-login.json')), false);
  const exportedFixture = JSON.parse(fs.readFileSync(path.join(kit, 'data/fixture.json')));
  assert.equal(path.isAbsolute(exportedFixture.dir), false);
  assert.equal(fs.statSync(path.join(kit, 'data/prepared/student-credentials.json')).mode & 0o777, 0o600);
  const students = new Map(credentials.map(c => [c.username, c]));
  const sessions = new Map(); let pack, finished = 0, requests = 0;
  const server = http.createServer(async (req, res) => {
    try {
      requests++; const url = new URL(req.url, 'http://localhost'); let body = '';
      for await (const chunk of req) body += chunk;
      const data = body ? JSON.parse(body) : {};
      const send = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
      if (url.pathname === '/api/ready') return send({ status: 'ready' });
      if (url.pathname === '/api/login') {
        if (data.username === 'fixture-admin' && data.password === 'fixture-only') return send({ token: 'admin', user: { role: 'admin' } });
        const s = students.get(data.username); assert.ok(s && data.password === s.password);
        return send({ token: s.username, user: { ...s, password: undefined, role: 'siswa' } });
      }
      const authorization = req.headers.authorization?.replace('Bearer ', '');
      if (url.pathname === '/api/packages') { assert.equal(authorization, 'admin'); pack = { ...data, id: 'pack' }; return send(pack); }
      if (url.pathname === '/api/packages/pack') { assert.equal(authorization, 'admin'); pack.status = data.status; return send(pack); }
      const student = students.get(authorization); assert.ok(student);
      if (url.pathname === '/api/auth/session-check') { assert.equal(url.searchParams.get('studentId'), student.id); return send({ status: 'valid' }); }
      if (url.pathname === '/api/sessions/start') {
        assert.equal(data.token, pack.token);
        if (!sessions.has(student.id)) sessions.set(student.id, { id: student.id, status: 'sedang_mengerjakan', answers: new Map() });
        const session = sessions.get(student.id);
        return send({ session: { id: session.id, status: session.status }, questions: keys.map((q, i) => ({ ...q, options: sources[i].options })), existingAnswers: [...session.answers.values()] });
      }
      const session = sessions.get(student.id); assert.ok(session);
      if (url.pathname.endsWith('/answer')) { session.answers.set(data.questionId, data); return send({ ...data, acknowledged: true }); }
      if (url.pathname.endsWith('/finish')) {
        assert.equal(session.answers.size, 30); assert.equal(data.expectedAnswers.length, 30);
        for (const key of keys) {
          const a = session.answers.get(key.id); const expected = key.type === types[0] ? key.correctAnswer[0] : key.correctAnswer;
          assert.deepEqual(a.answerData, expected);
          const receipt = data.expectedAnswers.find(r => r.questionId === key.id);
          assert.equal(receipt.version, a.version); assert.equal(receipt.mutationId, a.mutationId);
        }
        session.status = 'selesai'; finished++; return send({ status: 'selesai', totalScore: 100 });
      }
      return send({ error: 'NOT_FOUND' }, 404);
    } catch { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"error":"MOCK_ASSERTION_FAILED"}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const adminFile = path.join(kit, 'admin-login.json'); fs.writeFileSync(adminFile, JSON.stringify({ username: 'fixture-admin', password: 'fixture-only' }));
  const target = `http://127.0.0.1:${server.address().port}`;
  await command('bash', ['run.sh', 'smoke'], { cwd: kit, env: { ...process.env, LIVE_TARGET_URL: target,
    LIVE_ADMIN_FILE: adminFile, LIVE_PREVIOUS_RUN_DIR: '', LIVE_SMOKE_ONLY: '', LIVE_STAGES: '' } });
  const resultDir = fs.readdirSync(path.join(kit, 'load-tests/results')).find(name => name.startsWith('HTTP-'));
  const report = JSON.parse(fs.readFileSync(path.join(kit, 'load-tests/results', resultDir, 'report.json')));
  assert.equal(report.target, target); assert.equal(report.complete, true); assert.equal(report.stages[0].passed, true);
  assert.equal(report.stages[0].packageClosed, true); assert.equal(finished, 3); assert.ok(requests > 100);
  assert.equal(report.scriptSha256['load-tests/live-student.js'].length, 64);
});
