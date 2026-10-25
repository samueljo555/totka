import dotenv from 'dotenv';
import { Pool } from 'pg';
import { readFile, mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
const migrationDir = path.join(root, 'prisma/migrations');
const init = '20260805150436_init', bridge = '20261024100000_align_legacy_schema';
const cards = '20261024120000_student_login_cards', versions = '20261024140000_answer_versions', indexes = '20261024160000_query_indexes';
let pool, temp;
function cli(args) {
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { cwd: root, env: process.env, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('Perintah Prisma gagal. Periksa koneksi/schema dengan Prisma secara terpisah.');
  return result.stdout;
}
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi.');
  const parsed = new URL(process.env.DATABASE_URL);
  const schema = parsed.searchParams.get('schema') || 'public';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error('Nama schema tidak didukung oleh prosedur adopsi.');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}`, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  const columns = (await pool.query('SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1', [schema])).rows;
  const has = (table, column) => columns.some(row => row.table_name === table && row.column_name === column);
  if (!has('School', 'npsn') || !has('User', 'username') || !has('User', 'password')) throw new Error('Schema legacy belum memiliki NPSN/login. Perlu pemetaan data yang ditinjau manual; adopsi dihentikan.');
  if (has('Answer', 'version') !== has('Answer', 'mutationId')) throw new Error('Migrasi versi jawaban parsial; perbaiki pada clone terlebih dahulu.');
  const indexSql = await readFile(path.join(migrationDir, indexes, 'migration.sql'), 'utf8');
  const expectedIndexes = [...indexSql.matchAll(/CREATE INDEX "([^"]+)"/g)].map(match => match[1]);
  const actualIndexes = new Set((await pool.query('SELECT indexname FROM pg_indexes WHERE schemaname=$1', [schema])).rows.map(row => row.indexname));
  const indexCount = expectedIndexes.filter(name => actualIndexes.has(name)).length;
  if (indexCount !== 0 && indexCount !== expectedIndexes.length) throw new Error('Migrasi indeks parsial; selesaikan/perbaiki pada clone terlebih dahulu.');
  let expected = await readFile(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const applied = [init, bridge];
  if (has('User', 'loginCardPassword')) applied.push(cards);
  else expected = expected.replace(/^\s*loginCardPassword String\?\s*$/m, '');
  if (has('Answer', 'version')) applied.push(versions);
  else expected = expected.replace(/^\s*version\s+Int\s+@default\(0\)\s*$/m, '').replace(/^\s*mutationId\s+String\?\s*$/m, '');
  if (indexCount) applied.push(indexes);
  else expected = expected.replace(/^\s*@@index\([^\n]+\)\s*$/gm, '');
  temp = await mkdtemp(path.join(tmpdir(), 'tka-adopt-'));
  const target = path.join(temp, 'expected.prisma');
  await writeFile(target, expected);
  const diff = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-config-datasource', '--to-schema', target, '--exit-code'], { cwd: root, env: process.env, encoding: 'utf8' });
  if (diff.status !== 0) throw new Error('Schema tidak sesuai baseline yang didukung (kolom/tipe/constraint/indeks). Tidak ada riwayat diubah. Periksa dengan prisma migrate diff pada clone.');
  const historyExists = columns.some(row => row.table_name === '_prisma_migrations');
  const history = historyExists ? (await pool.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations"')).rows : [];
  const known = await readdir(migrationDir);
  for (const row of history) {
    if (!known.includes(row.migration_name)) throw new Error('Ada migrasi yang tidak dikenal; adopsi dihentikan.');
    if (!row.finished_at && !row.rolled_back_at) throw new Error('Ada migrasi gagal/belum selesai; selesaikan pada clone terlebih dahulu.');
    if (row.finished_at && !row.rolled_back_at) {
      const checksum = createHash('sha256').update(await readFile(path.join(migrationDir, row.migration_name, 'migration.sql'))).digest('hex');
      if (row.checksum !== checksum) throw new Error('Checksum migrasi berbeda; jangan menimpa riwayat produksi.');
      if (!applied.includes(row.migration_name)) throw new Error('Riwayat mengklaim migrasi yang belum tercermin pada schema.');
    }
  }
  const pending = applied.filter(name => !history.some(row => row.migration_name === name && row.finished_at && !row.rolled_back_at));
  console.log('Schema cocok. Riwayat yang perlu diadopsi:', pending.join(', ') || '(tidak ada)');
  if (process.argv.includes('--apply')) {
    for (const name of pending) cli(['migrate', 'resolve', '--applied', name]);
    console.log('Adopsi riwayat selesai. Jalankan npm run db:deploy untuk migrasi yang belum diterapkan.');
  } else console.log('Pemeriksaan saja. Gunakan --apply setelah backup dan uji pada clone.');
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  await pool?.end();
  if (temp) await rm(temp, { recursive: true, force: true });
}
