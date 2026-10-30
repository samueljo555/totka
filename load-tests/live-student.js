import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

// Benchmark against an explicitly selected public or internal application endpoint.
const students = new SharedArray('live students', () => JSON.parse(open(__ENV.CREDENTIALS_FILE)));
const keyRows = new SharedArray('question keys', () => JSON.parse(open(__ENV.QUESTION_KEYS_FILE)));
const vus = Number(__ENV.VUS);
const seconds = Number(__ENV.ACTIVITY_SECONDS);
const ramp = Number(__ENV.LOGIN_RAMP_SECONDS);
const finishSpread = Number(__ENV.FINISH_SPREAD_SECONDS || 15);
const base = __ENV.API_URL;
if (!/^https?:\/\/[^\s/?#@]+\/api$/.test(base || '') || !__ENV.EXAM_TOKEN || !__ENV.RUN_ID ||
    !Number.isInteger(vus) || vus < 1 || vus > students.length ||
    !(seconds > 0) || !(ramp >= 0) || !(finishSpread >= 0) || keyRows.length !== 30) {
  throw new Error('Invalid live benchmark configuration');
}
const started = new Counter('sessions_started');
const finalized = new Counter('sessions_finished');
const completed = new Counter('students_completed');
const failures = new Counter('operation_failures');
const retries = new Counter('request_retries');
const success = new Rate('flow_success');
const receiptOk = new Rate('answer_ack_success');
const resumeOk = new Rate('resume_success');
const heartbeatOk = new Rate('heartbeat_success');
const scoreOk = new Rate('score_success');
const timing = new Trend('operation_ms', true);
export const options = {
  scenarios: { exam: { executor: 'per-vu-iterations', vus, iterations: 1,
    maxDuration: `${Math.ceil(ramp + seconds + finishSpread + 180)}s`, gracefulStop: '30s' } },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '60s' }],
    operation_failures: [{ threshold: 'count==0', abortOnFail: true, delayAbortEval: '60s' }],
    flow_success: ['rate==1'], students_completed: [`count==${vus}`],
    answer_ack_success: ['rate==1'], resume_success: ['rate==1'],
    heartbeat_success: ['rate==1'], score_success: ['rate==1'],
    'operation_ms{endpoint:login}': ['p(95)<2000'],
    'operation_ms{endpoint:start}': ['p(95)<1000'],
    'operation_ms{endpoint:answer}': ['p(95)<750'],
    'operation_ms{endpoint:finish}': ['p(95)<2000'],
  },
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};
function json(response) { try { return response.json(); } catch { return null; } }
function send(endpoint, route, body, token, method = 'POST') {
  const before = Date.now();
  const response = http.request(method, base + route, body == null ? null : JSON.stringify(body), {
    headers: { ...(body == null ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    tags: { endpoint, name: endpoint }, timeout: '20s', redirects: 0,
  });
  timing.add(Date.now() - before, { endpoint });
  if (response.status >= 400 || response.status === 0) {
    const body = json(response);
    // Diagnostic enums only: never print bodies, credentials or JWTs.
    console.error(JSON.stringify({ event: 'http-error', endpoint, status: response.status,
      code: typeof body?.error === 'string' && /^[A-Z_]{1,80}$/.test(body.error) ? body.error : 'NON_ENUM_RESPONSE',
      contentType: response.headers['Content-Type'] || '' }));
  }
  return response;
}
function post(endpoint, route, body, token) {
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = send(endpoint, route, body, token);
    if (![0, 408, 429, 500, 502, 503, 504].includes(response.status)) break;
    if (attempt < 2) { retries.add(1, { endpoint }); sleep(0.5 * 2 ** attempt); }
  }
  return response;
}
function fail(endpoint, response) {
  failures.add(1, { endpoint, status: String(response?.status || 0) });
  return false;
}
function answerFor(question) {
  const key = keyRows.find(row => row.id === question.id);
  if (!key || key.type !== question.type) throw new Error('Question specification changed');
  return key.type === 'Pilihan Ganda Sederhana' ? key.correctAnswer[0] : [...key.correctAnswer];
}
function differentAnswer(question, answer) {
  if (question.type === 'Pilihan Ganda Sederhana') return (answer + 1) % question.options.length;
  if (question.type === 'Pilihan Ganda Kompleks') return [];
  return answer.map((value, index) => index ? value : 1 - value);
}
function ack(response, payload) {
  const data = json(response);
  const valid = response.status === 200 && data?.acknowledged === true &&
    data.questionId === payload.questionId && data.version === payload.version &&
    data.mutationId === payload.mutationId && JSON.stringify(data.answerData) === JSON.stringify(payload.answerData);
  receiptOk.add(valid); return valid;
}
export default function () {
  completed.add(0); started.add(0); finalized.add(0); failures.add(0); retries.add(0);
  let passed = false;
  try { passed = studentJourney(); }
  finally { success.add(passed); if (passed) completed.add(1); }
}
function studentJourney() {
  const student = students[exec.vu.idInTest - 1];
  if (!student.username.startsWith(__ENV.STUDENT_PREFIX) || !student.id || !student.schoolNpsn) {
    throw new Error('Only explicitly prepared dummy accounts may be used');
  }
  // Distribute logins, but keep one common activity window and one journey/account.
  sleep(ramp * (exec.vu.idInTest - 1) / vus);
  let response = post('login', '/login', { username: student.username, password: student.password });
  const login = json(response);
  if (!check(response, { 'login identifies the correct student and school': () => response.status === 200 &&
      login?.user?.id === student.id && login.user.schoolNpsn === student.schoolNpsn && typeof login.token === 'string' })) return fail('login', response);
  const token = login.token;
  response = post('start', '/sessions/start', { token: __ENV.EXAM_TOKEN }, token);
  const exam = json(response);
  if (!check(response, { 'starts a fresh active session with all expected questions': () => response.status === 200 &&
      exam?.session?.status === 'sedang_mengerjakan' && exam.questions?.length === 30 &&
      new Set(exam.questions.map(q => q.id)).size === 30 && exam.existingAnswers?.length === 0 &&
      exam.questions.every(q => keyRows.some(key => key.id === q.id && key.type === q.type)) })) return fail('start', response);
  started.add(1);
  const sessionId = exam.session.id, manifest = [];
  const windowStart = exec.scenario.startTime + ramp * 1000;
  const windowEnd = windowStart + seconds * 1000;
  const interval = seconds * 1000 / 34;
  let nextHeartbeat = Date.now() + Math.random() * 1000;
  function waitUntil(deadline) {
    while (Date.now() < deadline) {
      if (Date.now() >= nextHeartbeat) {
        const beat = send('heartbeat', `/auth/session-check?studentId=${encodeURIComponent(student.id)}`, null, token, 'GET');
        const valid = beat.status === 200 && json(beat)?.status === 'valid'; heartbeatOk.add(valid);
        if (!valid) return fail('heartbeat', beat);
        nextHeartbeat = Date.now() + 15000;
      }
      sleep(Math.max(0.01, Math.min(2, (deadline - Date.now()) / 1000, (nextHeartbeat - Date.now()) / 1000)));
    }
    return true;
  }
  for (let index = 0; index < exam.questions.length; index++) {
    const question = exam.questions[index], answer = answerFor(question);
    const due = windowStart + (index + 0.7 + Math.random() * 0.6) * interval;
    if (!waitUntil(due)) return false;
    let payload = { questionId: question.id, answerData: answer, version: 1,
      mutationId: `live:${__ENV.RUN_ID}:${exec.vu.idInTest}:${index}:1` };
    response = post('answer', `/sessions/${sessionId}/answer`, payload, token);
    if (!ack(response, payload)) return fail('answer', response);
    if (index === 7) {
      // One real answer change, then restore the known correct answer at version 3.
      for (const version of [2, 3]) {
        payload = { ...payload, answerData: version === 2 ? differentAnswer(question, answer) : answer,
          version, mutationId: `live:${__ENV.RUN_ID}:${exec.vu.idInTest}:${index}:${version}` };
        response = post('answer', `/sessions/${sessionId}/answer`, payload, token);
        if (!ack(response, payload)) return fail('answer-change', response);
      }
    }
    manifest.push({ questionId: question.id, version: payload.version, mutationId: payload.mutationId });
    if (index % 10 === 0) {
      response = post('replay', `/sessions/${sessionId}/answer`, payload, token);
      if (!ack(response, payload)) return fail('replay', response);
    }
    if (index === 14) {
      response = post('resume', '/sessions/start', { token: __ENV.EXAM_TOKEN }, token);
      const resumed = json(response);
      const valid = response.status === 200 && resumed?.session?.id === sessionId &&
        resumed.session.status === 'sedang_mengerjakan' && resumed.existingAnswers?.length === manifest.length &&
        manifest.every(receipt => resumed.existingAnswers.some(row => row.questionId === receipt.questionId &&
          row.version === receipt.version && row.mutationId === receipt.mutationId &&
          JSON.stringify(row.answerData) === JSON.stringify(answerFor(exam.questions.find(q => q.id === row.questionId)))));
      resumeOk.add(valid); if (!valid) return fail('resume', response);
    }
  }
  if (!waitUntil(windowEnd + Math.random() * finishSpread * 1000)) return false;
  response = post('finish', `/sessions/${sessionId}/finish`, { expectedAnswers: manifest }, token);
  const result = json(response);
  if (response.status === 200 && result?.status === 'selesai') finalized.add(1);
  const valid = response.status === 200 && result?.status === 'selesai' && Number(result.totalScore) === 100;
  scoreOk.add(valid);
  if (!check(response, { 'server confirms completion and expected score': () => valid })) return fail('finish', response);
  return true;
}
export function handleSummary(data) {
  return { [__ENV.SUMMARY_FILE]: JSON.stringify(data, null, 2),
    stdout: JSON.stringify({ vus, completed: data.metrics.students_completed?.values.count || 0,
      started: data.metrics.sessions_started?.values.count || 0,
      httpErrorRate: data.metrics.http_req_failed?.values.rate || 0 }) + '\n' };
}
