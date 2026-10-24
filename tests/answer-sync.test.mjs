import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnswerSync, answerMutationId } from '../.test-build/answer-sync.js';

const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const ack = record => response({ questionId: record.questionId, answerData: record.answerData, version: record.version, mutationId: record.mutationId, acknowledged: true });
const key = id => `tka_outbox_v1_exam_${id}`;
function storage() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function clock() {
  let now = 1000, sequence = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimer: (callback, delay) => { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimer: id => timers.delete(id),
    async advance(ms = 0) {
      now += ms;
      for (let i = 0; i < 500; i++) {
        await settle();
        const due = [...timers.entries()].find(([, value]) => value.at <= now);
        if (!due) return;
        timers.delete(due[0]);
        due[1].callback();
      }
      throw new Error('Retry scheduler did not become idle');
    },
    size: () => timers.size,
  };
}
let nextId = 0;
function harness(overrides = {}) {
  const disk = overrides.storage || storage();
  const time = overrides.clock || clock();
  const requests = [], updates = [], closed = [], auth = [];
  let online = true, canSend = true;
  const engine = new AnswerSync({
    sessionId: 'exam', questionIds: ['q1', 'q2', 'q3'], existingAnswers: [],
    storage: disk, now: time.now, setTimer: time.setTimer, clearTimer: time.clearTimer,
    id: () => `test-mutation-${String(++nextId).padStart(8, '0')}`,
    random: () => 0, online: () => online, canSend: () => canSend,
    onChange: value => updates.push(value), onClosed: session => closed.push(session), onAuthError: message => auth.push(message),
    ...overrides,
    send: async (record, signal) => {
      requests.push(structuredClone(record));
      return overrides.send ? overrides.send(record, signal) : ack(record);
    },
  });
  return { engine, disk, time, requests, updates, closed, auth, online: value => { online = value; }, canSend: value => { canSend = value; } };
}

test('request IDs work with getRandomValues without relying on HTTPS-only randomUUID', () => {
  assert.match(answerMutationId(), /^[0-9a-f]{32}$/);
});

test('default timer adapters call native-style timers without binding them to the queue object', async () => {
  const savedSet = globalThis.setTimeout, savedClear = globalThis.clearTimeout;
  const time = clock();
  globalThis.setTimeout = function (callback, delay) {
    assert.ok(this === undefined || this === globalThis, 'native timer received an illegal receiver');
    return time.setTimer(callback, delay);
  };
  globalThis.clearTimeout = function (timer) {
    assert.ok(this === undefined || this === globalThis, 'native timer received an illegal receiver');
    return time.clearTimer(timer);
  };
  try {
    const h = harness({ clock: time, setTimer: undefined, clearTimer: undefined });
    h.engine.enqueue('q1', 0);
    await time.advance(150);
    assert.equal(h.engine.snapshot().states.q1, 'saved');
    h.engine.dispose();
  } finally { globalThis.setTimeout = savedSet; globalThis.clearTimeout = savedClear; }
});

test('rate limits respect Retry-After instead of starting an immediate retry loop', async () => {
  const h = harness({ send: record => h.requests.length === 1 ? response({}, 429, { 'Retry-After': '3' }) : ack(record) });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  await h.time.advance(2999);
  assert.equal(h.requests.length, 1);
  await h.time.advance(1);
  assert.equal(h.requests.length, 2);
  assert.equal(h.engine.snapshot().states.q1, 'saved');
  h.engine.dispose();
});

test('persists every change before network and coalesces rapid choices using increasing versions', async () => {
  const h = harness({ send: record => {
    assert.equal(JSON.parse(h.disk.getItem(key('q1'))).mutationId, record.mutationId);
    return ack(record);
  } });
  h.engine.enqueue('q1', 0);
  h.engine.enqueue('q1', 1);
  assert.equal(h.requests.length, 0);
  assert.equal(JSON.parse(h.disk.getItem(key('q1'))).version, 2);
  await h.time.advance(150);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].answerData, 1);
  assert.equal(h.engine.snapshot().states.q1, 'saved');
  assert.equal(h.disk.getItem(key('q1')), null);
  h.engine.dispose();
});

test('old acknowledgement cannot remove a newer answer or a different question added during sync', async () => {
  const first = deferred();
  const h = harness({ send: record => h.requests.length === 1 ? first.promise : ack(record) });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  h.engine.enqueue('q1', 1);
  h.engine.enqueue('q2', [0, 2]);
  first.resolve(ack(h.requests[0]));
  await settle();
  assert.equal(h.engine.snapshot().pending.q1.answerData, 1);
  assert.equal(h.engine.snapshot().pendingCount, 2);
  assert.ok(h.disk.getItem(key('q2')));
  await h.time.advance(150);
  assert.equal(h.engine.snapshot().pendingCount, 0);
  assert.equal(h.engine.snapshot().answers.q1, 1);
  assert.equal(h.requests.find(r => r.version === 2).answerData, 1);
  h.engine.dispose();
});

test('network response loss retries the identical ID and version rather than generating a new mutation', async () => {
  const h = harness({ send: record => {
    if (h.requests.length === 1) throw new Error('Response lost after commit');
    return ack(record);
  } });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  assert.equal(h.engine.snapshot().states.q1, 'retry');
  await h.time.advance(999);
  assert.equal(h.requests.length, 1);
  await h.time.advance(1);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].mutationId, h.requests[1].mutationId);
  assert.equal(h.requests[0].version, h.requests[1].version);
  assert.equal(h.engine.snapshot().states.q1, 'saved');
  h.engine.dispose();
});

test('offline choices survive reload, preserve all questions, and resume on reconnect', async () => {
  const first = harness(); first.online(false);
  first.engine.enqueue('q1', 1);
  first.engine.enqueue('q2', [null, 1]);
  first.engine.dispose();
  const h = harness({ storage: first.disk });
  assert.equal(h.engine.snapshot().pendingCount, 2);
  assert.deepEqual(h.engine.snapshot().answers.q2, [null, 1]);
  h.engine.wake();
  await h.time.advance(150);
  assert.equal(h.engine.snapshot().pendingCount, 0);
  h.engine.dispose();
});

test('reload reconciles an already-committed answer without resending or losing a newer queued choice', async () => {
  const first = harness(); first.online(false);
  first.engine.enqueue('q1', 0);
  const queued = first.engine.snapshot().pending.q1;
  first.engine.dispose();
  const h = harness({ storage: first.disk, existingAnswers: [queued] });
  assert.equal(h.engine.snapshot().states.q1, 'saved');
  assert.equal(h.engine.snapshot().pendingCount, 0);
  assert.equal(h.disk.getItem(key('q1')), null);
  assert.equal(h.requests.length, 0);
  h.engine.enqueue('q1', 1);
  assert.equal(h.engine.snapshot().pending.q1.version, 2);
  h.engine.dispose();
});

test('reload accepts a matching receipt even when the server normalized array order or missing category slots', () => {
  const first = harness(); first.online(false);
  first.engine.enqueue('q1', [2, 0]);
  const queued = first.engine.snapshot().pending.q1;
  first.engine.dispose();
  const restored = harness({ storage: first.disk, existingAnswers: [{ ...queued, answerData: [0, 2] }] });
  assert.equal(restored.engine.snapshot().pendingCount, 0);
  assert.deepEqual(restored.engine.snapshot().answers.q1, [0, 2]);
  restored.engine.dispose();
});

test('reload of an interrupted fifth attempt requires user action instead of restarting unlimited retries', async () => {
  const h = harness({ send: () => response({}, 503) });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  const stored = JSON.parse(h.disk.getItem(key('q1')));
  h.engine.dispose();
  h.disk.setItem(key('q1'), JSON.stringify({ ...stored, state: 'sending', attempts: 5 }));
  const restored = harness({ storage: h.disk });
  restored.engine.wake();
  await restored.time.advance(100000);
  assert.equal(restored.requests.length, 0);
  assert.equal(restored.engine.snapshot().states.q1, 'failed');
  restored.engine.retry();
  await restored.time.advance();
  assert.equal(restored.requests.length, 1);
  assert.equal(restored.engine.snapshot().states.q1, 'saved');
  restored.engine.dispose();
});

test('an old failure does not overwrite the new pending selection with its old data or retry count', async () => {
  const first = deferred();
  const h = harness({ send: record => h.requests.length === 1 ? first.promise : ack(record) });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  h.engine.enqueue('q1', 1);
  first.reject(new Error('Old request failed'));
  await settle();
  assert.equal(h.engine.snapshot().pending.q1.answerData, 1);
  assert.equal(h.engine.snapshot().pending.q1.attempts, 0);
  assert.equal(h.engine.snapshot().pending.q1.version, 2);
  h.engine.dispose();
});

test('transient failures stop after five attempts and require an explicit retry after exhaustion', async () => {
  let available = false;
  const h = harness({ send: record => available ? ack(record) : response({ message: 'Busy' }, 503) });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  for (const delay of [1000, 2000, 4000, 8000]) await h.time.advance(delay);
  assert.equal(h.requests.length, 5);
  assert.equal(h.engine.snapshot().states.q1, 'failed');
  await h.time.advance(100000);
  assert.equal(h.requests.length, 5);
  available = true;
  h.engine.retry();
  await h.time.advance();
  assert.equal(h.engine.snapshot().states.q1, 'saved');
  assert.equal(h.requests[0].mutationId, h.requests.at(-1).mutationId);
  h.engine.dispose();
});

test('permanent validation errors are not retried automatically or by the global retry button', async () => {
  const h = harness({ send: () => response({ message: 'Invalid answer' }, 400) });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  h.engine.retry();
  await h.time.advance(100000);
  assert.equal(h.requests.length, 1);
  assert.equal(h.engine.snapshot().states.q1, 'failed');
  assert.equal(h.engine.snapshot().pending.q1.retryable, false);
  h.engine.enqueue('q1', 1);
  assert.equal(h.engine.snapshot().pending.q1.version, 2);
  h.engine.dispose();
});

test('version collisions require an explicit choice and can adopt the confirmed server answer', async () => {
  const server = { questionId: 'q1', answerData: 1, version: 5, mutationId: 'other-client-mutation' };
  const h = harness({ send: () => response({ error: 'ANSWER_VERSION_CONFLICT', currentAnswer: server }, 409) });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  assert.equal(h.engine.snapshot().states.q1, 'conflict');
  await h.time.advance(100000);
  assert.equal(h.requests.length, 1);
  h.engine.resolve('q1', 'server');
  assert.equal(h.engine.snapshot().answers.q1, 1);
  assert.equal(h.engine.snapshot().pendingCount, 0);
  assert.deepEqual(h.engine.manifest(), [{ questionId: 'q1', version: 5, mutationId: server.mutationId }]);
  h.engine.dispose();
});

test('choosing the local answer after a conflict explicitly creates a higher version and a new ID', async () => {
  const h = harness({ send: record => h.requests.length === 1 ? response({ error: 'ANSWER_VERSION_CONFLICT', currentAnswer: { questionId: 'q1', answerData: 1, version: 7, mutationId: 'other-client-mutation' } }, 409) : ack(record) });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  const firstId = h.requests[0].mutationId;
  h.engine.resolve('q1', 'local');
  assert.equal(h.engine.snapshot().pending.q1.version, 8);
  assert.notEqual(h.engine.snapshot().pending.q1.mutationId, firstId);
  await h.time.advance(150);
  assert.equal(h.engine.snapshot().answers.q1, 0);
  assert.equal(h.engine.snapshot().states.q1, 'saved');
  h.engine.dispose();
});

test('an invalid acknowledgement never clears the durable pending answer', async () => {
  const h = harness({ send: record => response({ ...record, mutationId: 'wrong-id', acknowledged: true }) });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  assert.equal(h.engine.snapshot().states.q1, 'retry');
  assert.ok(h.disk.getItem(key('q1')));
  assert.equal(h.engine.manifest().length, 0);
  h.engine.dispose();
});

test('storage failure is visible and never claims local recovery while pending, but permits server confirmation', async () => {
  const first = deferred();
  const h = harness({ storage: { getItem: () => null, setItem: () => { throw new Error('Quota'); }, removeItem: () => {} }, send: () => first.promise });
  h.engine.enqueue('q1', 0);
  assert.ok(h.engine.snapshot().storageWarning);
  assert.equal(h.engine.snapshot().states.q1, 'pending');
  await h.time.advance(150);
  first.resolve(ack(h.requests[0]));
  await settle();
  assert.equal(h.engine.snapshot().states.q1, 'saved');
  h.engine.dispose();
});

test('a corrupt outbox is surfaced instead of silently treated as an empty saved queue', () => {
  const disk = storage(); disk.setItem(key('q1'), '{invalid');
  const h = harness({ storage: disk });
  assert.equal(h.engine.snapshot().recoveryError, true);
  assert.ok(h.engine.snapshot().storageWarning);
  assert.equal(disk.getItem(key('q1')), '{invalid');
  h.engine.dispose();
});

test('legacy backups recover by question ID; divergent saved data needs an explicit choice', async () => {
  const disk = storage();
  disk.setItem('tka_queue_exam', JSON.stringify([{ questionId: 'q2', answerData: [0, 2], qNumber: 99 }]));
  disk.setItem('tka_answers_exam', JSON.stringify({ byQuestionId: { q1: 0 } }));
  const h = harness({ storage: disk, existingAnswers: [{ questionId: 'q1', answerData: 1, version: 0, mutationId: null }] });
  assert.equal(h.engine.snapshot().states.q1, 'conflict');
  assert.deepEqual(h.engine.snapshot().answers.q2, [0, 2]);
  assert.equal(disk.getItem('tka_queue_exam'), null);
  h.engine.resolve('q1', 'server');
  h.engine.dispose();
  const restored = harness({ storage: disk, existingAnswers: [{ questionId: 'q1', answerData: 1, version: 0, mutationId: null }] });
  assert.equal(restored.engine.snapshot().states.q1, 'saved');
  restored.engine.dispose();
});

test('newer confirmed receipt from another tab prevents an old late response downgrading the displayed answer', async () => {
  const disk = storage(), first = deferred();
  const a = harness({ storage: disk, send: () => first.promise });
  a.engine.enqueue('q1', 0);
  await a.time.advance(150);
  const b = harness({ storage: disk });
  b.engine.enqueue('q1', 1);
  await b.time.advance(150);
  assert.equal(b.engine.snapshot().states.q1, 'saved');
  assert.equal(b.engine.manifest()[0].version, 2);
  first.resolve(ack(a.requests[0]));
  await settle();
  assert.equal(a.engine.snapshot().answers.q1, 1);
  assert.equal(a.engine.manifest()[0].version, 2);
  a.engine.dispose(); b.engine.dispose();
});

test('timeout preserves the same pending mutation; dispose aborts work without deleting its backup', async () => {
  const h = harness({ send: (_, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })) });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  await h.time.advance(15000);
  assert.equal(h.engine.snapshot().states.q1, 'retry');
  h.engine.dispose();
  assert.ok(h.disk.getItem(key('q1')));
  assert.equal(h.time.size(), 0);
});

test('expired deadlines and inactive sessions do not keep retrying or discard unconfirmed answers', async () => {
  const h = harness();
  h.engine.enqueue('q1', 0);
  h.canSend(false);
  await h.time.advance(100000);
  assert.equal(h.requests.length, 0);
  assert.equal(h.engine.snapshot().pendingCount, 1);
  h.engine.dispose();
  const auth = harness({ send: () => response({ message: 'Login expired' }, 401) });
  auth.engine.enqueue('q1', 0);
  await auth.time.advance(150);
  assert.equal(auth.auth.length, 1);
  auth.engine.retry();
  await auth.time.advance(100000);
  assert.equal(auth.requests.length, 1);
  assert.ok(auth.disk.getItem(key('q1')));
  auth.engine.dispose();
});

test('manual flush waits for the latest queued changes and returns a matching finalization manifest', async () => {
  const first = deferred();
  const h = harness({ send: record => h.requests.length === 1 ? first.promise : ack(record) });
  h.engine.enqueue('q1', 0);
  await h.time.advance(150);
  h.engine.enqueue('q1', 1);
  h.engine.enqueue('q2', []);
  let completed = false;
  const flushed = h.engine.flush().then(result => { completed = true; return result; });
  await settle();
  assert.equal(completed, false);
  first.resolve(ack(h.requests[0]));
  const result = await flushed;
  assert.equal(result.pendingCount, 0);
  assert.equal(h.engine.snapshot().answers.q1, 1);
  assert.equal(h.engine.manifest().find(a => a.questionId === 'q1').version, 2);
  h.engine.complete();
  assert.equal(h.disk.data.size, 0);
});
