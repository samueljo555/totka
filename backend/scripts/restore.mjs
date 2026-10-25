import { Pool } from 'pg';
import { readFile, lstat, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { databaseEnv, run, sha256, files, safeRelative, copyTree } from './ops-common.mjs';
process.umask(0o077);
let pool;
try {
  const bundle = process.argv[2];
  if (!bundle || !path.isAbsolute(bundle)) throw new Error('Berikan path absolut bundle backup yang telah selesai.');
  if ((await lstat(bundle)).isSymbolicLink() || bundle.endsWith('.partial')) throw new Error('Bundle belum selesai atau symlink.');
  const env = databaseEnv(process.env.RESTORE_DATABASE_URL); // Never falls back to application DATABASE_URL.
  const metadata = JSON.parse(await readFile(path.join(bundle, 'manifest.json'), 'utf8'));
  if (metadata.format !== 1 || !['LOCAL', 'GCP'].includes(metadata.storageProvider) || !metadata.uploads || typeof metadata.uploads !== 'object' || Array.isArray(metadata.uploads)) throw new Error('Manifest backup tidak didukung.');
  const dump = path.join(bundle, 'database.dump');
  if (!(await lstat(dump)).isFile() || (await sha256(dump)) !== metadata.dumpSha256) throw new Error('Checksum dump tidak cocok.');
  const list = Object.keys(metadata.uploads).sort();
  for (const name of list) safeRelative(name);
  let target;
  if (metadata.storageProvider === 'LOCAL') {
    target = process.env.RESTORE_UPLOAD_DIR;
    if (!target || !path.isAbsolute(target)) throw new Error('RESTORE_UPLOAD_DIR wajib berupa direktori absolut baru/kosong.');
    const source = path.join(bundle, 'uploads');
    if ((await lstat(source)).isSymbolicLink()) throw new Error('Symlink bundle ditolak.');
    if (JSON.stringify(await files(source)) !== JSON.stringify(list)) throw new Error('Daftar media berbeda dari manifest.');
    for (const name of list) if (await sha256(path.join(source, name)) !== metadata.uploads[name]) throw new Error('Checksum media tidak cocok.');
    try {
      const info = await lstat(target);
      if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(target)).length) throw new Error('RESTORE_UPLOAD_DIR harus kosong dan bukan symlink.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  pool = new Pool({ connectionString: process.env.RESTORE_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  const count = await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S','f')`);
  if (count.rows[0].n !== 0) throw new Error('Target restore harus database kosong. Tidak ada DROP/--clean yang dijalankan.');
  await run(process.env.PG_RESTORE_BIN || 'pg_restore', ['--list', dump], env);
  // A failed restore rolls back all database changes. Media is copied after DB commit.
  await run(process.env.PG_RESTORE_BIN || 'pg_restore', ['--dbname', env.PGDATABASE, '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', dump], env);
  if (target) {
    await mkdir(target, { recursive: true, mode: 0o700 });
    await copyTree(path.join(bundle, 'uploads'), target, list);
  }
  console.log('Restore database selesai. Verifikasi aplikasi, secret kartu, dan media sebelum mengalihkan traffic.');
  if (metadata.storageProvider === 'GCP') console.log('Media bucket harus dipulihkan/diverifikasi secara terpisah.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await pool?.end(); }
