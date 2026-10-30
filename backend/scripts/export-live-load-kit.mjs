import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { balancedDummyStudents, liveTarget } from './live-load-config.mjs';

// Offline export only. Contains dummy passwords; never publish the archive to Git.
process.umask(0o077);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureFile = process.env.LIVE_FIXTURE_FILE || path.join(project, 'load-tests/results/dummy-preparation-state.json');
const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
assert.equal(liveTarget(fixture.base), 'https://naingsima.my.id');
const students = balancedDummyStudents(fixture,
  JSON.parse(fs.readFileSync(path.resolve(project, fixture.dir, 'student-credentials.json'), 'utf8')));
assert.ok(process.env.LIVE_QUESTION_SOURCE_FILE && process.env.LIVE_REUSE_QUESTIONS_DIR,
  'Isi LIVE_QUESTION_SOURCE_FILE dan LIVE_REUSE_QUESTIONS_DIR.');
const sources = JSON.parse(fs.readFileSync(process.env.LIVE_QUESTION_SOURCE_FILE, 'utf8')).filter(q => q.mapel === 'Matematika');
const previous = JSON.parse(fs.readFileSync(path.join(process.env.LIVE_REUSE_QUESTIONS_DIR, 'report.json'), 'utf8'));
const keys = JSON.parse(fs.readFileSync(path.join(process.env.LIVE_REUSE_QUESTIONS_DIR, 'question-keys.json'), 'utf8'));
assert.equal(previous.fixture, fixture.run); assert.equal(previous.target, fixture.base);
assert.equal(sources.length, 30); assert.equal(keys.length, 30);
assert.equal(new Set(keys.map(k => k.id)).size, 30);
assert.deepEqual(previous.questionIds, keys.map(k => k.id));
keys.forEach((key, index) => {
  assert.equal(key.type, sources[index].type); assert.deepEqual(key.correctAnswer, sources[index].correctAnswer);
});
const root = process.env.LIVE_EXPORT_ROOT || path.join(project, 'load-tests/results');
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const output = fs.mkdtempSync(path.join(root, 'gcp-kit-'));
const kit = path.join(output, 'totka-k6-gcp'); fs.mkdirSync(kit, { mode: 0o700 });
function write(relative, value) {
  const file = path.join(kit, relative); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2), { mode: 0o600 });
}
const files = ['backend/scripts/run-live-load.mjs', 'backend/scripts/live-load-config.mjs',
  'backend/dist/rich-content.js', 'load-tests/live-student.js'];
const hashes = {};
for (const relative of files) {
  const data = fs.readFileSync(path.join(project, relative)); write(relative, data.toString());
  hashes[relative] = crypto.createHash('sha256').update(data).digest('hex');
}
write('package.json', { name: 'totka-k6-gcp', private: true, type: 'module' });
write('data/fixture.json', { base: fixture.base, run: fixture.run, prefix: fixture.prefix,
  verified: true, dir: 'data/prepared', schools: fixture.schools.map(({ npsn, name, region }) => ({ npsn, name, region })) });
write('data/prepared/student-credentials.json', students.map(({ id, username, password, schoolNpsn, nisn, className }) =>
  ({ id, username, password, schoolNpsn, nisn, className })));
write('data/source-questions.json', sources);
write('data/question-bank/report.json', { run: previous.run, target: fixture.base, fixture: fixture.run, questionIds: previous.questionIds });
write('data/question-bank/question-keys.json', keys);
write('admin-login.example.json', { username: 'ISI_USERNAME_ADMIN', password: 'ISI_PASSWORD_ADMIN' });
write('README.md', fs.readFileSync(path.join(project, 'docs/K6_GCP.md'), 'utf8'));
let commit = null;
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Metadata is optional outside Git. */ }
const launcher = fs.readFileSync(path.join(project, 'load-tests/run-gcp.sh'), 'utf8');
write('run.sh', launcher);
hashes['run.sh'] = crypto.createHash('sha256').update(launcher).digest('hex');
write('kit-version.json', { commit, packagedAt: new Date().toISOString(), scriptSha256: hashes });
fs.chmodSync(path.join(kit, 'run.sh'), 0o700);
const archive = path.join(output, 'totka-k6-gcp.tar.gz');
execFileSync('tar', ['-czf', archive, '-C', output, 'totka-k6-gcp']); fs.chmodSync(archive, 0o600);
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
fs.writeFileSync(archive + '.sha256', `${sha256}  totka-k6-gcp.tar.gz\n`, { mode: 0o600 });
console.log(JSON.stringify({ archive, checksum: archive + '.sha256', sha256, students: students.length,
  schools: fixture.schools.length, questions: keys.length, includesAdminCredentials: false }));
