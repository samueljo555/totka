// Explicit opt-in only: create a NEW random database, never seed DATABASE_URL.
import { Pool } from 'pg';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { seedLoadFixture, prepareLoadStage, auditLoadStage } from './load-fixture.mjs';
import { sampleResources, summarizeResources } from './load-resources.mjs';
process.umask(0o077);
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.dirname(backend);
const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
const database = `tka_load_${runId}`;
const stages = (process.env.LOAD_STAGES || 'journey:10,journey:25,journey:50,journey:100,journey:250,steady:25,steady:50,steady:100,steady:250').split(',').map(item => {
  const [profile, size] = item.split(':');
  if (!['login','journey','steady'].includes(profile) || !/^[1-9]\d*$/.test(size || '') || Number(size) > 10050) throw new Error('LOAD_STAGES harus profile:1..10050.');
  return { profile, vus: Number(size) };
});
const workers = Number(process.env.LOAD_WORKERS || 2);
const rounds = Number(process.env.ANSWER_ROUNDS || 1);
const think = Number(process.env.THINK_SECONDS || 1);
const output = path.resolve(process.env.LOAD_RESULTS_DIR || path.join(project, 'load-tests/results', `${new Date().toISOString().replaceAll(':','-')}-${runId}`));
const k6 = process.env.K6_BIN || 'k6';
let admin, pool, server, temp, created = false, serverLog;
let interrupted = false, activeGenerator;
const report = { runId, generatedAt: new Date().toISOString(), stages: [], host: { logicalCpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, memoryMb: os.totalmem() / 1024 ** 2, node: process.version, platform: `${os.platform()} ${os.release()}`, sharedHost: true }, config: { workers, maxPoolPerWorker: Math.min(5, Math.floor(40 / workers)), connectionBudget: 40, redis: false, thinkSeconds: think, answerRounds: rounds, replayEvery: 10, finishAtSeconds: Number(process.env.FINISH_AT_SECONDS || 0), stageTimeout: process.env.MAX_DURATION || '5m' } };
function interrupt() { interrupted = true; activeGenerator?.kill('SIGINT'); }
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
async function stopServer() {
  if (!server) return;
  const started = Date.now();
  if (server.exitCode === null) await new Promise(resolve => {
    const timer = setTimeout(() => { server.kill('SIGKILL'); resolve(); }, 24000);
    server.once('exit', () => { clearTimeout(timer); resolve(); });
    server.kill('SIGTERM');
  });
  report.serverShutdown = { exitCode: server.exitCode, signal: server.signalCode, elapsedSeconds: (Date.now() - started) / 1000 };
  if (server.exitCode !== 0) process.exitCode = 1;
}
try {
  if (!process.env.LOAD_TEST_DATABASE_URL) throw new Error('LOAD_TEST_DATABASE_URL wajib menunjuk cluster pengujian terpisah; tidak mengambil DATABASE_URL.');
  if (!Number.isInteger(workers) || workers < 1 || workers > 32 || !Number.isInteger(rounds) || rounds < 1 || !Number.isFinite(think) || think < 0) throw new Error('Konfigurasi worker/rounds/think tidak valid.');
  const parsed = new URL(process.env.LOAD_TEST_DATABASE_URL);
  if (parsed.searchParams.has('schema') && parsed.searchParams.get('schema') !== 'public') throw new Error('Harness memakai schema public pada database baru.');
  report.k6 = execFileSync(k6, ['version'], { encoding: 'utf8' }).trim();
  report.commit = execFileSync('git', ['rev-parse','HEAD'], { cwd: project, encoding: 'utf8' }).trim();
  report.workingTreeModified = Boolean(execFileSync('git', ['status','--porcelain'], { cwd: project, encoding: 'utf8' }).trim());
  await mkdir(output, { recursive: true, mode: 0o700 });
  temp = await mkdtemp(path.join(tmpdir(), 'tka-load-'));
  admin = new Pool({ connectionString: process.env.LOAD_TEST_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  await admin.query(`CREATE DATABASE "${database}"`); created = true;
  parsed.pathname = `/${database}`; parsed.search = '';
  const connection = parsed.toString();
  const env = { ...process.env, DATABASE_URL: connection, JWT_SECRET: crypto.randomBytes(32).toString('hex'), LOGIN_CARD_SECRET: crypto.randomBytes(32).toString('hex'),
    NODE_ENV: 'production', PORT: '0', USE_REDIS: 'false', APP_WORKERS: String(workers), DB_POOL_MAX: '5', DB_CONNECTION_BUDGET: '40', DB_CONNECTION_TIMEOUT_MS: '5000', DB_STATEMENT_TIMEOUT_MS: '15000', DB_QUERY_TIMEOUT_MS: '16000',
    LOAD_TEST_RUN_ID: runId, UPLOAD_DIR: path.join(temp,'uploads'), FRONTEND_DIST_DIR: path.join(project,'dist') };
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js','migrate','deploy'], { cwd: backend, env, stdio: 'pipe' });
  pool = new Pool({ connectionString: connection, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 30000, application_name: 'tka-load-monitor' });
  console.log('Creating isolated fixture: 10050 students, 50 questions, 502500 historical answers.');
  const fixture = await seedLoadFixture(pool);
  report.fixture = { students: fixture.students, questions: fixture.questions, historicalAnswers: fixture.historicalAnswers, bcryptCost: fixture.bcryptCost };
  report.postgres = (await pool.query('SELECT version() AS version')).rows[0].version;
  serverLog = await open(path.join(output, 'server.log'), 'a', 0o600);
  server = spawn(process.execPath, ['scripts/load-server.mjs'], { cwd: backend, env, stdio: ['ignore', serverLog.fd, serverLog.fd, 'ipc'] });
  let workerFailed = false;
  server.on('message', message => { if (message.event === 'worker-failed') { workerFailed = true; activeGenerator?.kill('SIGINT'); } });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Benchmark server startup timeout.')), 20000);
    server.on('message', message => { if (message.event === 'ready') { clearTimeout(timer); resolve(message); } });
    server.once('exit', () => { clearTimeout(timer); reject(new Error('Benchmark server exited before readiness.')); });
  });
  const api = `http://127.0.0.1:${ready.port}/api`;
  const blocked = new Map();
  for (let index = 0; index < stages.length && !interrupted; index++) {
    const stage = stages[index];
    if (blocked.has(stage.profile) && stage.vus > blocked.get(stage.profile)) {
      report.stages.push({ ...stage, skipped: 'Higher load skipped after a lower stage failed.' }); continue;
    }
    const id = `stage_${index}_${stage.profile}_${stage.vus}`;
    const credentials = path.join(temp, 'credentials.json');
    const examToken = await prepareLoadStage(pool, fixture, id, env.JWT_SECRET, credentials);
    const summaryFile = path.join(output, `${id}.json`);
    console.log(`Starting ${stage.profile}: ${stage.vus} concurrent students, ${fixture.questions} questions.`);
    const started = Date.now();
    const generator = spawn(k6, ['run', '--quiet', path.join(project, 'load-test.js')], { cwd: project, env: { ...process.env, API_URL: api, CREDENTIALS_FILE: credentials, EXAM_TOKEN: examToken, PROFILE: stage.profile, VUS: String(stage.vus), THINK_SECONDS: String(think), ANSWER_ROUNDS: String(rounds), RUN_ID: runId,
      SUMMARY_FILE: summaryFile, EXPECTED_QUESTIONS: String(fixture.questions), REPLAY_EVERY: '10', MAX_DURATION: process.env.MAX_DURATION || '5m' }, stdio: ['ignore','pipe','pipe'] });
    activeGenerator = generator;
    let consoleOutput = ''; generator.stdout.on('data', chunk => { consoleOutput += chunk; }); generator.stderr.on('data', chunk => { consoleOutput += chunk; });
    const samples = [];
    let sampling = false, samplerError = null;
    const sample = async () => {
      if (sampling) return;
      sampling = true;
      try {
        const value = await sampleResources(pool, ready.pids, generator.pid); samples.push(value);
        if (value.availableMemoryMb < 128) { samplerError = 'Stopped: available system memory below 128 MB.'; generator.kill('SIGINT'); }
      } catch { samplerError = 'Resource sampling failed.'; }
      finally { sampling = false; }
    };
    await sample();
    const timer = setInterval(() => { void sample(); }, 1000);
    const code = await new Promise((resolve, reject) => { generator.once('error', reject); generator.once('exit', resolve); });
    clearInterval(timer);
    while (sampling) await new Promise(resolve => setTimeout(resolve, 10));
    await sample(); activeGenerator = null;
    await writeFile(path.join(output, `${id}.log`), consoleOutput, { mode: 0o600 });
    let summary;
    try { summary = JSON.parse(await readFile(summaryFile, 'utf8')); }
    catch { throw new Error('k6 did not produce a valid summary; see isolated run logs.'); }
    const completed = summary.metrics.students_completed?.values.count || 0;
    const audit = await auditLoadStage(pool, id, fixture.questions, rounds, stage.profile, stage.vus, completed);
    const thresholdFailures = Object.entries(summary.metrics).flatMap(([name, metric]) => Object.entries(metric.thresholds || {}).filter(([,value]) => !value.ok).map(([threshold]) => `${name}: ${threshold}`));
    const passed = code === 0 && !samplerError && !workerFailed && audit.passed && audit.allParticipantsFinished;
    const result = { ...stage, elapsedSeconds: (Date.now()-started)/1000, exitCode: code, passed, completed, thresholdFailures, audit, resources: summarizeResources(samples), samplerError,
      httpRequests: summary.metrics.http_reqs?.values.count || 0, httpErrorRate: summary.metrics.http_req_failed?.values.rate || 0,
      endpointLatency: Object.fromEntries(Object.entries(summary.metrics).filter(([name]) => name.startsWith('http_req_duration{')).map(([name, metric]) => [name, metric.values])),
      retries: summary.metrics.answer_retries?.values.count || 0 };
    report.stages.push(result);
    await writeFile(path.join(output, `${id}-resources.json`), JSON.stringify(samples, null, 2));
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ profile: stage.profile, vus: stage.vus, passed, completed, httpErrorRate: result.httpErrorRate, thresholds: thresholdFailures, audit }));
    if (!passed) blocked.set(stage.profile, stage.vus);
    if (workerFailed || samplerError || interrupted) break;
  }
  report.completed = !interrupted && report.stages.length === stages.length;
  report.allStagesPassed = !interrupted && report.stages.length === stages.length && report.stages.every(stage => stage.passed);
  if (!report.allStagesPassed) process.exitCode = 1;
} catch {
  report.error = 'Load harness failed. Check k6 installation, explicit test database permissions, build output, and isolated logs.';
  console.error(report.error); process.exitCode = 1;
} finally {
  activeGenerator?.kill('SIGINT');
  await stopServer();
  await serverLog?.close();
  await pool?.end();
  if (created) {
    try { await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); report.databaseRemoved = true; }
    catch { report.databaseRemoved = false; process.exitCode = 1; console.error(`Manual cleanup required for isolated database ${database}.`); }
  }
  await admin?.end();
  if (temp) await rm(temp, { recursive: true, force: true });
  try { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); } catch { /* Output location may be invalid. */ }
  console.log(`Report: ${path.join(output, 'report.json')}`);
}
