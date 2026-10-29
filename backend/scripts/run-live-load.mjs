import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodeRichContent, parseRichContent } from '../dist/rich-content.js';

// Only the explicitly prepared dummy fixture is permitted. No direct DB access.
process.umask(0o077);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(project, 'load-tests/results/dummy-preparation-state.json'), 'utf8'));
assert.equal(fixture.base, 'https://naingsima.my.id'); assert.equal(fixture.verified, true);
const admin = JSON.parse(fs.readFileSync(0, 'utf8'));
const k6 = process.env.K6_BIN || 'k6';
const run = `HTTP-${new Date().toISOString().replace(/[-:.]/g, '')}`;
const output = path.join(project, 'load-tests/results', run);
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const reportPath = path.join(output, 'report.json');
const report = { run, target: fixture.base, fixture: fixture.run, startedAt: new Date().toISOString(),
  k6: execFileSync(k6, ['version'], { encoding: 'utf8' }).trim(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim(),
  workingTreeModified: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf8' }).trim()),
  generator: { cpus: os.cpus().length, totalMemoryMb: os.totalmem() / 1024 ** 2, node: process.version },
  monitoring: 'External HTTP and local generator only; no GCP monitoring or database audit.',
  stages: [], planned: process.env.LIVE_STAGES ? process.env.LIVE_STAGES.split(',').map(Number) : [100, 250, 500, 1000, 2500, 5000, 7500, 10000], complete: false };
assert.ok(report.planned.length && report.planned.every(v => [100, 250, 500, 1000, 2500, 5000, 7500, 10000].includes(v)));
if (process.env.LIVE_PREVIOUS_RUN_DIR) {
  const previous = JSON.parse(fs.readFileSync(path.join(process.env.LIVE_PREVIOUS_RUN_DIR, 'report.json'), 'utf8'));
  assert.equal(previous.target, fixture.base); assert.equal(previous.fixture, fixture.run);
  const passed = previous.stages.filter(s => !s.smoke && s.passed && s.packageClosed);
  assert.ok(passed.length && passed.every(s => s.vus < Math.min(...report.planned)));
  report.continuedFrom = { run: previous.run, passedStages: passed.map(s => s.vus) };
}
const write = (file, data) => { const temporary = file + '.partial'; fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 }); fs.renameSync(temporary, file); };
const persist = () => write(reportPath, report);
const announce = data => console.log(JSON.stringify(data));
let token, child, stop = false, activePackage;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
process.on('SIGINT', () => { stop = true; child?.kill('SIGINT'); });
process.on('SIGTERM', () => { stop = true; child?.kill('SIGINT'); });
async function api(route, method = 'GET', body, authenticated = true, renewed = false) {
  const response = await fetch(fixture.base + route, { method,
    headers: { ...(authenticated ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (authenticated && !renewed && response.status === 401 &&
        ['SESSION_KICKED', 'TOKEN_EXPIRED', 'UNAUTHORIZED'].includes(data?.error)) {
      const login = await api('/api/login', 'POST', admin, false);
      assert.ok(['admin', 'super_admin'].includes(login.user?.role)); token = login.token;
      return api(route, method, body, true, true);
    }
    const code = typeof data?.error === 'string' && /^[A-Z_]{1,80}$/.test(data.error) ? ` ${data.error}` : '';
    throw new Error(`${method} ${new URL(fixture.base + route).pathname} HTTP ${response.status}${code}`);
  }
  return data;
}
async function availablePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
function processResources(pid) {
  const memory = fs.readFileSync('/proc/meminfo', 'utf8');
  const availableMb = Number(/MemAvailable:\s+(\d+)/.exec(memory)?.[1] || 0) / 1024;
  try {
    const fields = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(/\s+/);
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    return { availableMb, rssMb: Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] || 0) / 1024,
      cpuTicks: Number(fields[11]) + Number(fields[12]) };
  } catch { return { availableMb, rssMb: 0, cpuTicks: 0 }; }
}
async function runStage(spec, questionIds) {
  assert.equal((await api('/api/ready', 'GET', undefined, false)).status, 'ready');
  const id = spec.smoke ? 'smoke' : String(spec.vus);
  const examToken = `LT${crypto.randomBytes(12).toString('hex')}`;
  const pack = await api('/api/packages', 'POST', {
    name: `DUMMY UJI BEBAN ${run} ${id}`, token: examToken, mapel: 'Matematika',
    durationMinutes: 60, navigationMode: 'bebas', releaseScoreMode: 'langsung', status: 'aktif', questionIds,
  });
  activePackage = pack.id;
  const stage = { ...spec, packageId: pack.id, startedAt: new Date().toISOString(), passed: false, samples: 0,
    peakConfirmedActive: 0, fullTargetSeconds: 0, peakGeneratorRssMb: 0, minimumAvailableMb: Infinity };
  report.stages.push(stage); persist(); announce({ event: 'stage-start', vus: spec.vus, seconds: spec.seconds, ramp: spec.ramp, smoke: !!spec.smoke, output });
  const port = await availablePort();
  const summaryFile = path.join(output, `${id}-summary.json`);
  const log = fs.openSync(path.join(output, `${id}-k6.log`), 'a', 0o600);
  const samplesFile = fs.openSync(path.join(output, `${id}-generator.jsonl`), 'a', 0o600);
  const wallStart = Date.now(); let lastSample, lastFull = false, lastAnnouncement = 0, highCpuSince = 0;
  const ticks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
  child = spawn(k6, ['run', '--quiet', '--address', `127.0.0.1:${port}`, path.join(project, 'load-tests/live-student.js')], {
    cwd: project, stdio: ['ignore', log, log],
    env: { ...process.env, API_URL: fixture.base + '/api', CREDENTIALS_FILE: path.join(output, 'credentials.json'),
      QUESTION_KEYS_FILE: path.join(output, 'question-keys.json'), EXAM_TOKEN: examToken, RUN_ID: `${run}:${id}`,
      STUDENT_PREFIX: fixture.prefix, VUS: String(spec.vus), ACTIVITY_SECONDS: String(spec.seconds),
      LOGIN_RAMP_SECONDS: String(spec.ramp), FINISH_SPREAD_SECONDS: String(spec.finishSpread), SUMMARY_FILE: summaryFile,
      K6_NO_USAGE_REPORT: 'true', K6_WEB_DASHBOARD: 'false', GOMEMLIMIT: '4GiB' },
  });
  let exit; child.once('error', error => { stage.generatorError = error.code || 'spawn failure'; exit = { code: -1 }; });
  child.once('exit', (code, signal) => { exit = { code, signal }; });
  try {
    while (!exit) {
      await wait(1000); const now = Date.now(), resource = processResources(child.pid);
      let counters;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/metrics`, { signal: AbortSignal.timeout(1500) });
        const data = await response.json();
        const metrics = new Map((data.data || []).map(m => [m.id, m.attributes?.sample]));
        counters = { started: metrics.get('sessions_started')?.count || 0,
          finished: metrics.get('sessions_finished')?.count || 0, completed: metrics.get('students_completed')?.count || 0,
          vus: metrics.get('vus')?.value || 0, failures: metrics.get('operation_failures')?.count || 0 };
      } catch { /* REST API is unavailable during initialization and shutdown. */ }
      const active = counters ? Math.max(0, counters.started - counters.finished) : undefined;
      const full = active === spec.vus;
      if (lastSample && full && lastFull) stage.fullTargetSeconds += (now - lastSample.at) / 1000;
      const cpuPercent = lastSample && resource.cpuTicks >= lastSample.cpuTicks ?
        (resource.cpuTicks - lastSample.cpuTicks) / ticks / ((now - lastSample.at) / 1000) * 100 : 0;
      const sample = { at: now, ...resource, cpuPercent, ...(counters ? { counters, confirmedActive: active } : {}) };
      fs.writeSync(samplesFile, JSON.stringify(sample) + '\n'); lastSample = sample; lastFull = full;
      stage.samples++; stage.peakConfirmedActive = Math.max(stage.peakConfirmedActive, active || 0);
      stage.peakGeneratorRssMb = Math.max(stage.peakGeneratorRssMb, resource.rssMb);
      stage.minimumAvailableMb = Math.min(stage.minimumAvailableMb, resource.availableMb);
      if (cpuPercent > os.cpus().length * 90) highCpuSince ||= now; else highCpuSince = 0;
      if (resource.availableMb < 512 || resource.rssMb > os.totalmem() / 1024 ** 2 - 1200 || highCpuSince && now - highCpuSince > 60000) {
        stage.generatorError = resource.availableMb < 512 ? 'Generator available memory below 512 MB' : 'Generator resource saturation'; child.kill('SIGINT');
      }
      if (now - wallStart > (spec.ramp + spec.seconds + spec.finishSpread + 240) * 1000) { stage.generatorError = 'Generator exceeded stage deadline'; child.kill('SIGINT'); }
      if (stop) child.kill('SIGINT');
      if (now - lastAnnouncement > 30000) {
        lastAnnouncement = now; persist(); announce({ event: 'progress', targetVus: spec.vus, elapsed: Math.round((now - wallStart) / 1000),
          ...counters, active, rssMb: Math.round(resource.rssMb), availableMb: Math.round(resource.availableMb) });
      }
    }
  } finally { fs.closeSync(log); fs.closeSync(samplesFile); child = undefined; }
  stage.elapsedSeconds = (Date.now() - wallStart) / 1000; stage.exit = exit;
  let summary;
  if (fs.existsSync(summaryFile)) summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  if (summary) {
    const metric = name => summary.metrics[name]?.values;
    stage.completed = metric('students_completed')?.count || 0; stage.started = metric('sessions_started')?.count || 0;
    stage.httpErrorRate = metric('http_req_failed')?.rate || 0; stage.httpRequests = metric('http_reqs')?.count || 0;
    stage.retries = metric('request_retries')?.count || 0;
    stage.thresholdFailures = Object.entries(summary.metrics).flatMap(([name, m]) => Object.entries(m.thresholds || {}).filter(([, value]) => !value.ok).map(([rule]) => `${name}: ${rule}`));
    stage.endpointLatency = Object.fromEntries(Object.entries(summary.metrics).filter(([name]) => name.startsWith('operation_ms{')).map(([name, m]) => [name, m.values]));
    stage.checks = Object.fromEntries(['answer_ack_success', 'resume_success', 'heartbeat_success', 'score_success', 'flow_success'].map(name => [name, metric(name)?.rate ?? null]));
    stage.passed = exit.code === 0 && !stage.generatorError && stage.completed === spec.vus && !stage.thresholdFailures.length &&
      stage.peakConfirmedActive === spec.vus && stage.fullTargetSeconds >= spec.seconds - (spec.smoke ? 4 : 8);
    if (exit.code === 0 && !stage.passed) stage.observationError = 'Target active concurrency/duration was not demonstrated';
  } else stage.generatorError ||= 'No k6 summary produced';
  await api(`/api/packages/${encodeURIComponent(pack.id)}`, 'PUT', { status: 'selesai' }); activePackage = undefined;
  stage.packageClosed = true; stage.finishedAt = new Date().toISOString(); persist();
  announce({ event: 'stage-complete', vus: spec.vus, smoke: !!spec.smoke, passed: stage.passed, completed: stage.completed,
    peakActive: stage.peakConfirmedActive, fullTargetSeconds: stage.fullTargetSeconds,
    thresholdFailures: stage.thresholdFailures, generatorError: stage.generatorError, observationError: stage.observationError });
  return stage;
}
try {
  const login = await api('/api/login', 'POST', admin, false); assert.ok(['admin', 'super_admin'].includes(login.user?.role)); token = login.token;
  const credentials = JSON.parse(fs.readFileSync(path.join(fixture.dir, 'student-credentials.json'), 'utf8'));
  assert.equal(credentials.length, 10000); assert.equal(new Set(credentials.map(c => c.id)).size, 10000);
  const grouped = fixture.schools.map(s => credentials.filter(c => c.schoolNpsn === s.npsn).sort((a, b) => a.username.localeCompare(b.username)));
  assert.ok(grouped.every(group => group.length === 100));
  const balanced = Array.from({ length: 10000 }, (_, i) => grouped[i % 100][Math.floor(i / 100)]);
  assert.ok(balanced.every(c => c.username.startsWith(fixture.prefix) && c.id && c.password));
  write(path.join(output, 'credentials.json'), balanced);
  const sourcePath = process.env.LIVE_QUESTION_SOURCE_FILE; assert.ok(sourcePath, 'LIVE_QUESTION_SOURCE_FILE is required');
  const sources = JSON.parse(fs.readFileSync(sourcePath, 'utf8')).filter(q => q.mapel === 'Matematika');
  assert.equal(sources.length, 30);
  report.questionSourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  report.questionIds = [];
  const keyRows = [];
  if (process.env.LIVE_REUSE_QUESTIONS_DIR) {
    const previous = JSON.parse(fs.readFileSync(path.join(process.env.LIVE_REUSE_QUESTIONS_DIR, 'report.json'), 'utf8'));
    assert.equal(previous.target, fixture.base); assert.equal(previous.fixture, fixture.run);
    assert.equal(previous.questionIds.length, 30);
    const previousKeys = JSON.parse(fs.readFileSync(path.join(process.env.LIVE_REUSE_QUESTIONS_DIR, 'question-keys.json'), 'utf8'));
    assert.equal(previousKeys.length, 30); assert.ok(previousKeys.every(q => previous.questionIds.includes(q.id)));
    report.questionIds = previous.questionIds; keyRows.push(...previousKeys); report.reusedQuestionsFrom = previous.run;
  } else for (const source of sources) {
    const rich = parseRichContent(source.content); assert.ok(rich);
    rich.doc.content.unshift({ type: 'paragraph', content: [{ type: 'text', text: `DUMMY UJI BEBAN ${run}` }] });
    const body = { ...source, element: `DUMMY ${run} — ${source.element}`, content: encodeRichContent(rich) };
    const question = await api('/api/questions', 'POST', body);
    assert.equal(question.authorId, login.user.id); assert.deepEqual(question.correctAnswer, source.correctAnswer);
    report.questionIds.push(question.id); keyRows.push({ id: question.id, type: question.type, correctAnswer: question.correctAnswer }); persist();
  }
  write(path.join(output, 'question-keys.json'), keyRows);
  const smoke = await runStage({ vus: 3, seconds: 10, ramp: 0, finishSpread: 2, smoke: true }, report.questionIds);
  if (!smoke.passed) throw new Error('Smoke test failed; main load stages were not started');
  if (process.env.LIVE_SMOKE_ONLY === 'true') { report.smokeOnly = true; report.complete = true; }
  else {
    const ramps = { 100: 10, 250: 15, 500: 20, 1000: 30, 2500: 60, 5000: 90, 7500: 120, 10000: 180 };
    for (let i = 0; i < report.planned.length && !stop; i++) {
      const vus = report.planned[i];
      const stage = await runStage({ vus, seconds: vus === 10000 ? 600 : 300, ramp: ramps[vus], finishSpread: vus === 10000 ? 30 : 15 }, report.questionIds);
      if (!stage.passed) {
        report.stopReason = stage.generatorError || 'Previous stage failed thresholds or target concurrency/duration';
        process.exitCode = 1; break;
      }
    }
    report.complete = !stop && report.stages.length === report.planned.length + 1 && report.stages.every(s => s.passed);
  }
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  if (activePackage && token) {
    try { await api(`/api/packages/${encodeURIComponent(activePackage)}`, 'PUT', { status: 'selesai' }); report.lastPackageClosed = true; }
    catch { report.lastPackageClosed = false; }
  }
  if (stop) process.exitCode = 130;
  report.interrupted = stop; report.finishedAt = new Date().toISOString(); persist();
  announce({ event: 'report', output, complete: report.complete, error: report.error, stopReason: report.stopReason });
}
