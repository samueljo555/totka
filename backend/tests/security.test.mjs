import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// Exercise the actual HTTP middleware and handlers with an isolated repository.
// These tests never connect to or alter the configured application database.
process.env.USE_REDIS = 'false';
process.env.STORAGE_PROVIDER = 'LOCAL';
const { createApp } = await import('../dist/app.js');
const { loadJwtSecret } = await import('../dist/config.js');
const secret = 'test-only-secret-with-at-least-32-characters';
let users, questions, readings, sessions, answers, packages;
const schools = [{ npsn: '11111111', name: 'Sekolah A' }, { npsn: '22222222', name: 'Sekolah B' }];

function project(row, query = {}) {
  if (!row) return null;
  const relations = ['student', 'package', 'answers', 'school', 'reading', 'question', 'questions'];
  const result = query.select ? {} : Object.fromEntries(Object.entries(structuredClone(row)).filter(([key]) => !relations.includes(key)));
  if (!query.select && !query.include) return result;
  for (const [key, selection] of Object.entries(query.select || query.include)) {
    if (!selection) continue;
    const value = row[key];
    result[key] = selection === true ? (Array.isArray(value) ? value.map(item => item && typeof item === 'object' ? project(item) : item) : value && typeof value === 'object' ? project(value) : structuredClone(value)) : Array.isArray(value)
      ? value.map(item => project(item, selection)) : project(value, selection);
  }
  return result;
}
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'studentId_packageId') return matches(row, value);
    if (key === 'sessionId_questionId') return matches(row, value);
    if (key === 'student') return matches(users.find(user => user.id === row.studentId), value);
    return row?.[key] === value;
  });
}
function repository(getRows, hydrate = row => row) {
  return {
    async findUnique(q) { return project(hydrate(getRows().find(row => matches(row, q.where))), q); },
    async findFirst(q) { return this.findUnique(q); },
    async findMany(q = {}) { return getRows().filter(row => matches(row, q.where)).map(row => project(hydrate(row), q)); },
    async create(q) {
      const row = { id: `created-${getRows().length}`, schoolNpsn: null, activeToken: null, ...q.data };
      getRows().push(row);
      return project(hydrate(row), q);
    },
    async update(q) {
      const row = getRows().find(row => matches(row, q.where));
      assert.ok(row, 'update targets an existing fixture');
      Object.assign(row, q.data);
      return project(hydrate(row), q);
    },
    async createManyAndReturn(q) {
      const inserted = [];
      for (const row of q.data) {
        if (getRows().some(existing => existing.username === row.username)) continue;
        inserted.push(await this.create({ data: row, select: q.select }));
      }
      return inserted;
    },
    async createMany(q) { return { count: (await this.createManyAndReturn(q)).length }; },
    async count(q) { return getRows().filter(row => matches(row, q.where)).length; },
    async delete(q) {
      const index = getRows().findIndex(row => matches(row, q.where));
      return getRows().splice(index, 1)[0];
    },
  };
}
const userRepo = repository(() => users, row => row && ({ ...row, school: schools.find(s => s.npsn === row.schoolNpsn) || null }));
const questionRepo = repository(() => questions, row => row && ({ ...row, reading: readings.find(r => r.id === row.readingId) || null }));
const answerRepo = repository(() => answers, row => row && ({ ...row, question: questions.find(q => q.id === row.questionId) }));
answerRepo.upsert = async q => {
  const row = answers.find(row => matches(row, q.where));
  return row ? answerRepo.update({ where: { id: row.id }, data: q.update }) : answerRepo.create({ data: q.create });
};
const prisma = {
  user: userRepo,
  question: questionRepo,
  readingText: repository(() => readings),
  school: repository(() => schools),
  package: repository(() => packages),
  packageQuestion: {
    async findMany(q) { return questions.filter(question => question.id === 'q1').map(question => project({ packageId: 'p1', questionId: question.id, question: { ...question, reading: readings[0] } }, q)); },
    async count() { return 1; },
  },
  answer: answerRepo,
  examSession: repository(() => sessions, row => row && ({
    ...row,
    student: { ...users.find(user => user.id === row.studentId), school: schools[0] },
    package: { ...packages.find(p => p.id === row.packageId), questions: [{ question: questions[0] }] },
    answers: answers.filter(a => a.sessionId === row.id).map(a => ({ ...a, question: questions[0] })),
  })),
};
let server, base;
before(async () => {
  server = createApp(prisma, secret).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
beforeEach(() => {
  users = [
    ['admin', 'admin', null], ['super', 'super_admin', null],
    ['guru', 'guru', '11111111'], ['guru2', 'guru', '22222222'],
    ['op', 'operator', '11111111'], ['op2', 'operator', '22222222'],
    ['unassigned', 'operator', null], ['s1', 'siswa', '11111111'], ['s2', 'siswa', '22222222'],
  ].map(([id, role, schoolNpsn]) => ({ id, username: id, role, schoolNpsn, activeToken: `sid-${id}`, password: 'legacy-password', fullName: id }));
  readings = [{ id: 'r1', title: 'Bacaan', content: 'Isi', authorId: 'guru' }, { id: 'r2', authorId: 'guru2' }];
  questions = [
    { id: 'q1', type: 'Pilihan Ganda Sederhana', content: 'Soal', options: [{ text: 'A' }], correctAnswer: [0], authorId: 'guru', readingId: 'r1' },
    { id: 'q2', correctAnswer: [1], authorId: 'guru2' },
  ];
  packages = [{ id: 'p1', token: 'EXAM', status: 'aktif', releaseScoreMode: 'langsung', durationMinutes: 90 }];
  sessions = [
    { id: 'e1', studentId: 's1', packageId: 'p1', status: 'sedang_mengerjakan', totalScore: null },
    { id: 'e2', studentId: 's2', packageId: 'p1', status: 'selesai', totalScore: 100 },
  ];
  answers = [];
});
function tokenFor(id, claims = {}) {
  const user = users.find(user => user.id === id);
  return jwt.sign({ id, sid: `sid-${id}`, role: user?.role, ...claims }, secret, { expiresIn: '5m' });
}
async function request(path, id, method = 'GET', body, extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...(id ? { Authorization: `Bearer ${tokenFor(id)}` } : {}), ...extra };
  const response = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
function assertNoSecrets(value, forbidden = ['password', 'activeToken', 'correctAnswer']) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!forbidden.includes(key), `response leaks ${key}`);
    assertNoSecrets(item, forbidden);
  }
}

test('JWT secret is mandatory and rejects empty/short values', () => {
  for (const value of [undefined, '', '  ', 'short']) assert.throws(() => loadJwtSecret({ JWT_SECRET: value }), /JWT_SECRET/);
  assert.equal(loadJwtSecret({ JWT_SECRET: secret }), secret);
});
test('health is public; API data and session heartbeat require authentication', async () => {
  assert.equal((await request('/health')).status, 200);
  for (const path of ['/users', '/auth/session-check', '/questions', '/sessions']) assert.equal((await request(path)).status, 401);
});
test('invalid/expired JWTs and legacy JWTs without session binding are rejected', async () => {
  const tokens = ['bad', jwt.sign({ id: 's1', sid: 'sid-s1' }, secret, { expiresIn: -1 }), jwt.sign({ id: 's1' }, secret)];
  for (const token of tokens) assert.equal((await request('/auth/session-check', null, 'GET', undefined, { Authorization: `Bearer ${token}` })).status, 401);
});
test('student cannot access administration, bank, upload, or analytics even with forged role claims', async () => {
  const cases = [
    ['/users', 'GET'], ['/users', 'POST'], ['/users/admin', 'PUT'], ['/users/admin', 'DELETE'],
    ['/users/siswa', 'POST'], ['/users/siswa/batch', 'POST'], ['/schools', 'GET'], ['/schools', 'POST'],
    ['/packages', 'GET'], ['/packages', 'POST'], ['/packages/p1', 'PUT'], ['/questions', 'GET'],
    ['/questions', 'POST'], ['/readings', 'GET'], ['/upload', 'POST'], ['/sessions', 'GET'],
    ['/analytics/e1', 'GET'], ['/analytics/packages', 'GET'], ['/analytics/packages/p1/items', 'GET'],
  ];
  for (const [path, method] of cases) {
    const result = await request(path, 's1', method, method === 'GET' ? undefined : {}, { Authorization: `Bearer ${tokenFor('s1', { role: 'super_admin' })}` });
    assert.equal(result.status, 403, `${method} ${path}`);
  }
});
test('admin and super admin receive safe user DTOs, including nested session students', async () => {
  for (const id of ['admin', 'super']) {
    const result = await request('/users', id);
    assert.equal(result.status, 200);
    assert.equal(result.body.length, users.length);
    assertNoSecrets(result.body);
    const sessionList = await request('/sessions', id);
    assert.equal(sessionList.status, 200);
    assertNoSecrets(sessionList.body);
  }
});
test('operator sees only own school students and sessions, and cannot choose another school', async () => {
  for (const [id, expected] of [['op', 's1'], ['op2', 's2']]) {
    const result = await request('/users?schoolNpsn=ignored', id);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.map(user => user.id), [expected]);
    assertNoSecrets(result.body);
    const own = await request('/sessions', id);
    assert.deepEqual(own.body.map(session => session.studentId), [expected]);
    assertNoSecrets(own.body, ['password', 'activeToken', 'token']);
  }
  assert.equal((await request('/sessions?schoolNpsn=22222222', 'op')).status, 403);
  assert.equal((await request('/users', 'unassigned')).status, 403);
});
test('operator cannot create an admin or mutate accounts through administrative endpoints', async () => {
  for (const [path, method] of [['/users', 'POST'], ['/users/s1', 'PUT'], ['/users/s1', 'DELETE'], ['/schools', 'POST']]) {
    assert.equal((await request(path, 'op', method, { role: 'admin' })).status, 403);
  }
});
test('student can start own exam without client identity; keys and tokens never leave server', async () => {
  const result = await request('/sessions/start', 's1', 'POST', { token: 'EXAM' });
  assert.equal(result.status, 200);
  assert.equal(result.body.session.studentId, 's1');
  assert.equal(result.body.questions[0].content, 'Soal');
  assertNoSecrets(result.body, ['password', 'activeToken', 'correctAnswer', 'token', 'isCorrect']);
});
test('spoofed student IDs and cross-owner save/finish requests are rejected even without session headers', async () => {
  assert.equal((await request('/sessions/start', 's1', 'POST', { token: 'EXAM', studentId: 's2' })).status, 403);
  for (const action of ['answer', 'finish']) {
    assert.equal((await request(`/sessions/e2/${action}`, 's1', 'POST', { questionId: 'q1', answerData: 0 })).status, 403);
    assert.equal((await request(`/sessions/e1/${action}`, 's1', 'POST', {}, { 'x-student-id': 's2' })).status, 403);
  }
  assert.equal(answers.length, 0);
});
test('own answer and finish work using authenticated identity only', async () => {
  const saved = await request('/sessions/e1/answer', 's1', 'POST', { questionId: 'q1', answerData: 0 });
  assert.equal(saved.status, 200);
  assertNoSecrets(saved.body, ['isCorrect', 'password', 'activeToken']);
  const finished = await request('/sessions/e1/finish', 's1', 'POST', {});
  assert.equal(finished.status, 200);
  assert.equal(finished.body.totalScore, 100);
});
test('delayed score release is enforced in start and finish responses', async () => {
  packages[0].releaseScoreMode = 'ditunda';
  sessions[0].totalScore = 75;
  assert.equal((await request('/sessions/start', 's1', 'POST', { token: 'EXAM' })).body.session.totalScore, null);
  assert.equal((await request('/sessions/e1/finish', 's1', 'POST', {})).body.totalScore, null);
});
test('old or reset sessions cannot bypass revocation by omitting session headers', async () => {
  users.find(u => u.id === 's1').activeToken = 'new-device';
  for (const [path, method, body] of [['/auth/session-check', 'GET'], ['/sessions/start', 'POST', { token: 'EXAM' }], ['/sessions/e1/answer', 'POST', { questionId: 'q1', answerData: 0 }]]) {
    const result = await request(path, 's1', method, body);
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'SESSION_KICKED');
  }
});
test('teacher bank is scoped and authorship cannot be supplied by the client', async () => {
  assert.deepEqual((await request('/questions', 'guru')).body.map(q => q.id), ['q1']);
  assert.deepEqual((await request('/readings', 'guru')).body.map(q => q.id), ['r1']);
  const created = await request('/questions', 'guru', 'POST', { type: 'Pilihan Ganda Sederhana', mapel: 'Matematika', element: 'Bilangan', content: 'Baru', authorId: 'admin' });
  assert.equal(created.status, 200);
  assert.equal(created.body.authorId, 'guru');
  assert.equal((await request('/questions/q2', 'guru', 'PUT', { content: 'Hijack' })).status, 403);
  assert.equal((await request('/readings/r2', 'guru', 'PUT', { content: 'Hijack' })).status, 403);
  assert.equal((await request('/questions/q1', 'guru', 'PUT', { readingId: 'r2' })).status, 403);
  assert.equal((await request('/questions/q1', 'guru', 'PUT', { content: 'Own edit', authorId: 'admin' })).status, 200);
  assert.equal(questions[0].authorId, 'guru');
  assert.equal((await request('/users', 'guru')).status, 403);
});
test('operator detail access is scoped before reading cache and never exposes keys', async () => {
  assert.equal((await request('/analytics/e2', 'op')).status, 403);
  assert.equal((await request('/analytics/e1', 'op')).status, 403, 'in-progress detail is restricted');
  sessions[0].status = 'selesai';
  const own = await request('/analytics/e1', 'op');
  assert.equal(own.status, 200);
  assertNoSecrets(own.body);
  const admin = await request('/analytics/e1', 'admin');
  assert.equal(admin.status, 200);
  assert.deepEqual(admin.body.session.package.questions[0].question.correctAnswer, [0]);
  assertNoSecrets(admin.body, ['password', 'activeToken']);
});
test('account creation hashes password and returns no hash; edit without password preserves it', async () => {
  const created = await request('/users', 'admin', 'POST', { username: 'new', password: 'new-password', fullName: 'New', role: 'guru' });
  assert.equal(created.status, 200);
  assertNoSecrets(created.body);
  const row = users.find(u => u.username === 'new');
  assert.ok(await bcrypt.compare('new-password', row.password));
  const original = row.password;
  assert.equal((await request(`/users/${row.id}`, 'admin', 'PUT', { fullName: 'Edited', password: '' })).status, 200);
  assert.equal(row.password, original);
  assert.equal((await request(`/users/${row.id}`, 'admin', 'PUT', { password: 'reset-password' })).status, 200);
  assert.ok(await bcrypt.compare('reset-password', row.password));
  assert.equal(row.activeToken, null);
});
test('school provisioning hashes operator passwords immediately', async () => {
  assert.equal((await request('/schools', 'admin', 'POST', { npsn: '33333333', name: 'New school' })).status, 200);
  const op = users.find(u => u.username === '33333333');
  assert.ok(await bcrypt.compare('33333333', op.password));
  assert.equal((await request('/schools/batch', 'admin', 'POST', { schools: [{ npsn: '44444444', name: 'Other' }] })).status, 200);
  assert.ok(await bcrypt.compare('44444444', users.find(u => u.username === '44444444').password));
});
test('operator creates students only within own school; passwords are returned once and hashed', async () => {
  const created = await request('/users/siswa', 'op', 'POST', { nisn: 'new-student', fullName: 'New', role: 'admin' });
  assert.equal(created.status, 200);
  const row = users.find(u => u.username === 'new-student');
  assert.equal(row.role, 'siswa');
  assert.equal(row.schoolNpsn, '11111111');
  assert.ok(await bcrypt.compare(created.body.user.tempPassword, row.password));
  assertNoSecrets(created.body);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  assert.equal((await request('/users/siswa', 'op', 'POST', { nisn: 'bad', fullName: 'Bad', schoolNpsn: '22222222' })).status, 403);
  assertNoSecrets((await request('/users', 'op')).body, ['password', 'activeToken', 'tempPassword']);
});
test('batch returns credentials only for newly inserted users, handles duplicates, and enforces school', async () => {
  const result = await request('/users/siswa/batch', 'op', 'POST', { students: [{ nisn: 'batch', fullName: 'Batch' }, { nisn: 's1', fullName: 'Exists' }, { nisn: 'batch', fullName: 'Duplicate' }] });
  assert.equal(result.status, 200);
  assert.equal(result.body.count, 1);
  assert.equal(result.body.credentials.length, 1);
  assert.equal(result.body.credentials[0].username, 'batch');
  const row = users.find(u => u.username === 'batch');
  assert.equal(row.schoolNpsn, '11111111');
  assert.ok(await bcrypt.compare(result.body.credentials[0].tempPassword, row.password));
  assert.equal((await request('/users/siswa/batch', 'op', 'POST', { students: [{ nisn: 'bad', fullName: 'Bad', schoolNpsn: '22222222' }] })).status, 403);
});
test('login signs session-bound JWT and replacement login invalidates earlier JWT', async () => {
  const login = await request('/login', null, 'POST', { username: 's1', password: 'legacy-password' });
  assert.equal(login.status, 200);
  const claims = jwt.verify(login.body.token, secret);
  assert.equal(claims.id, 's1');
  assert.equal(claims.sid, users.find(u => u.id === 's1').activeToken);
  assert.ok(await bcrypt.compare('legacy-password', users.find(u => u.id === 's1').password));
  const headers = { Authorization: `Bearer ${login.body.token}` };
  assert.equal((await request('/auth/session-check', null, 'GET', undefined, headers)).status, 200);
  await request('/login', null, 'POST', { username: 's1', password: 'legacy-password' });
  assert.equal((await request('/auth/session-check', null, 'GET', undefined, headers)).status, 401);
});
test('current database role overrides stale signed admin role and unknown routes are denied', async () => {
  const token = tokenFor('admin');
  users.find(u => u.id === 'admin').role = 'siswa';
  assert.equal((await request('/users', null, 'GET', undefined, { Authorization: `Bearer ${token}` })).status, 403);
  assert.equal((await request('/unlisted-sensitive-api', 'super')).status, 403);
  users.splice(users.findIndex(u => u.id === 's1'), 1);
  assert.equal((await request('/auth/session-check', 's1')).status, 401);
});
