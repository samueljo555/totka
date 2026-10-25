import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

// One real attempt per unique account. Re-running requires a fresh exam package.
const students = new SharedArray('students', () => JSON.parse(open(__ENV.CREDENTIALS_FILE)));
const vus = Number(__ENV.VUS || 10);
const offset = Number(__ENV.STUDENT_OFFSET || 0);
const profile = __ENV.PROFILE || 'journey';
const base = (__ENV.API_URL || '').replace(/\/$/, '');
const think = Number(__ENV.THINK_SECONDS || 1);
const replayEvery = Number(__ENV.REPLAY_EVERY || 10);
const rounds = Number(__ENV.ANSWER_ROUNDS || 1);
if (!base || !__ENV.EXAM_TOKEN || !Number.isInteger(vus) || vus < 1 || vus + offset > students.length ||
    !Number.isInteger(offset) || offset < 0 || !['login', 'journey', 'steady'].includes(profile) ||
    !Number.isFinite(think) || think < 0 || !Number.isInteger(rounds) || rounds < 1 ||
    !Number.isInteger(replayEvery) || replayEvery < 0) throw new Error('Invalid load-test configuration or insufficient unique accounts.');

const flowSuccess = new Rate('flow_success');
const completed = new Counter('students_completed');
const answerAck = new Rate('answer_ack_success');
const replayAck = new Rate('replay_ack_success');
const resumeOk = new Rate('resume_success');
const retries = new Counter('answer_retries');
const failures = new Counter('operation_failures');
const flowDuration = new Trend('flow_duration', true);
const thresholds = {
  http_req_failed: ['rate<0.01'],
  flow_success: ['rate==1'],
  students_completed: [`count==${vus}`],
};
if (profile !== 'steady') thresholds['http_req_duration{endpoint:login}'] = ['p(95)<2000'];
if (profile !== 'login') Object.assign(thresholds, {
  'http_req_duration{endpoint:start}': ['p(95)<1000'],
  'http_req_duration{endpoint:answer}': ['p(95)<750'],
  'http_req_duration{endpoint:finish}': ['p(95)<2000'],
  answer_ack_success: ['rate==1'],
});
export const options = {
  scenarios: { exam: { executor: 'per-vu-iterations', vus, iterations: 1, maxDuration: __ENV.MAX_DURATION || '5m', gracefulStop: '20s' } },
  thresholds, systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};
function json(response) { try { return response.json(); } catch { return null; } }
function post(endpoint, route, body, token) {
  return http.post(base + route, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    tags: { endpoint, name: endpoint }, timeout: '15s', redirects: 0,
  });
}
function fail(endpoint, response) {
  // Never log credentials, JWTs, student answers, or response bodies.
  failures.add(1, { endpoint, status: String(response.status) });
  return false;
}
function choice(question) {
  if (question.type === 'Pilihan Ganda Kompleks') return [0];
  if (question.type === 'Pilihan Ganda Kompleks Kategori') return question.options.map(() => 0);
  if (question.type === 'Pilihan Ganda Sederhana') return 0;
  throw new Error('Unknown question type in fixture');
}
function acknowledged(response, payload) {
  const data = json(response);
  return response.status === 200 && data?.acknowledged === true && data.questionId === payload.questionId &&
    data.version === payload.version && data.mutationId === payload.mutationId && JSON.stringify(data.answerData) === JSON.stringify(payload.answerData);
}
export default function () {
  const started = Date.now();
  completed.add(0);
  let success = false;
  try { success = runStudent(); }
  finally {
    flowSuccess.add(success); flowDuration.add(Date.now() - started);
    if (success) completed.add(1);
  }
}
function runStudent() {
  const student = students[offset + exec.vu.idInTest - 1];
  let token = student.token;
  if (profile !== 'steady') {
    const response = post('login', '/login', { username: student.username, password: student.password });
    const data = json(response);
    if (!check(response, { 'authenticated student identity': r => r.status === 200 && typeof data?.token === 'string' && data.user?.id === student.id })) return fail('login', response);
    token = data.token;
  }
  if (profile === 'login') return true;
  if (!token) throw new Error('Steady profile requires a valid fixture JWT.');
  let response = post('start', '/sessions/start', { token: __ENV.EXAM_TOKEN }, token);
  const data = json(response);
  if (!check(response, { 'new active session with all questions': r => r.status === 200 && data?.session?.status === 'sedang_mengerjakan' && data.questions?.length === Number(__ENV.EXPECTED_QUESTIONS || 50) && data.existingAnswers?.length === 0 })) return fail('start', response);
  const sessionId = data.session.id;
  const manifest = [];
  for (let round = 1; round <= rounds; round++) {
    for (let index = 0; index < data.questions.length; index++) {
      const question = data.questions[index];
      sleep(think * (0.8 + Math.random() * 0.4));
      const payload = { questionId: question.id, answerData: choice(question), version: round, mutationId: `load:${__ENV.RUN_ID || 'manual-load-test'}:${exec.vu.idInTest}:${round}:${index}` };
      response = post('answer', `/sessions/${sessionId}/answer`, payload, token);
      for (let attempt = 1; attempt < 5 && (response.status === 0 || [408, 429].includes(response.status) || response.status >= 500); attempt++) {
        retries.add(1); sleep(Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4));
        response = post('answer', `/sessions/${sessionId}/answer`, payload, token);
      }
      const valid = acknowledged(response, payload);
      answerAck.add(valid);
      if (!check(response, { 'answer acknowledged with exact version and mutation': () => valid })) return fail('answer', response);
      manifest[index] = { questionId: question.id, version: payload.version, mutationId: payload.mutationId };
      if (replayEvery && index % replayEvery === 0) {
        const replay = post('replay', `/sessions/${sessionId}/answer`, payload, token);
        const validReplay = acknowledged(replay, payload);
        replayAck.add(validReplay);
        if (!check(replay, { 'idempotent retry preserves answer receipt': () => validReplay })) return fail('replay', replay);
      }
      if (round === 1 && index === Math.floor(data.questions.length / 2)) {
        const resumed = post('resume', '/sessions/start', { token: __ENV.EXAM_TOKEN }, token);
        const state = json(resumed);
        const validResume = resumed.status === 200 && state?.session?.id === sessionId && state.session.status === 'sedang_mengerjakan' && state.existingAnswers?.length === manifest.length &&
          manifest.every(receipt => state.existingAnswers.some(answer => answer.questionId === receipt.questionId && answer.version === receipt.version && answer.mutationId === receipt.mutationId));
        resumeOk.add(validResume);
        if (!check(resumed, { 'resume retains confirmed answers': () => validResume })) return fail('resume', resumed);
      }
    }
  }
  const finishAt = Number(__ENV.FINISH_AT_SECONDS || 0);
  if (finishAt > 0) sleep(Math.max(0, (exec.scenario.startTime + finishAt * 1000 - Date.now()) / 1000));
  response = post('finish', `/sessions/${sessionId}/finish`, { expectedAnswers: manifest }, token);
  const result = json(response);
  if (!check(response, { 'finished with expected score': r => r.status === 200 && result?.status === 'selesai' && Number(result.totalScore) === 100 })) return fail('finish', response);
  return true;
}
export function handleSummary(data) {
  return {
    [__ENV.SUMMARY_FILE || 'load-summary.json']: JSON.stringify(data, null, 2),
    stdout: JSON.stringify({ profile, vus, completed: data.metrics.students_completed?.values.count || 0, success: data.metrics.flow_success?.values.rate || 0, httpErrorRate: data.metrics.http_req_failed?.values.rate || 0 }) + '\n',
  };
}
