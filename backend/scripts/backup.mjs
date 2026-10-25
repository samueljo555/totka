import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { mkdir, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { backendDir, databaseEnv, run, sha256, files, copyTree } from './ops-common.mjs';
process.umask(0o077);
let pool;
try {
  const env = databaseEnv(process.env.DATABASE_URL);
  const destination = process.env.BACKUP_DIR;
  if (!destination || !path.isAbsolute(destination)) throw new Error('BACKUP_DIR wajib berupa path absolut di luar repository.');
  const repository = path.dirname(backendDir);
  const relative = path.relative(repository, destination);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('BACKUP_DIR harus di luar repository.');
  const provider = process.env.STORAGE_PROVIDER || 'LOCAL';
  if (!['LOCAL', 'GCP'].includes(provider)) throw new Error('STORAGE_PROVIDER tidak valid.');
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const name = `tka-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
  const working = path.join(destination, `${name}.partial`), complete = path.join(destination, name);
  await mkdir(working, { mode: 0o700 });
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  const database = (await pool.query('SELECT current_database() AS name')).rows[0].name;
  await run(process.env.PG_DUMP_BIN || 'pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', path.join(working, 'database.dump')], env);
  const uploads = path.resolve(backendDir, process.env.UPLOAD_DIR || 'uploads');
  const manifest = {};
  if (provider === 'LOCAL') {
    if (!(await stat(uploads)).isDirectory()) throw new Error('UPLOAD_DIR tidak ditemukan; backup media tidak boleh dilewati diam-diam.');
    const list = await files(uploads);
    await mkdir(path.join(working, 'uploads'), { mode: 0o700 });
    await copyTree(uploads, path.join(working, 'uploads'), list);
    for (const name of list) manifest[name] = await sha256(path.join(working, 'uploads', name));
  }
  const metadata = { format: 1, createdAt: new Date().toISOString(), database, storageProvider: provider, dumpSha256: await sha256(path.join(working, 'database.dump')), uploads: manifest,
    note: provider === 'GCP' ? 'Objek bucket tidak disertakan. Wajib backup/versioning bucket secara terpisah.' : 'Media lokal disertakan. Hentikan penulisan saat backup untuk konsistensi database/media.' };
  await writeFile(path.join(working, 'manifest.json'), JSON.stringify(metadata, null, 2) + '\n', { mode: 0o600 });
  await rename(working, complete);
  console.log(`Backup selesai: ${complete}`);
  if (provider === 'GCP') console.log(metadata.note);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await pool?.end(); }
