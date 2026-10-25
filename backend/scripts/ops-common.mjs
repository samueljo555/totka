import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, readdir, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendDir, '.env'), quiet: true });
export function databaseEnv(url) {
  if (!url) throw new Error('URL database wajib diisi secara eksplisit.');
  const parsed = new URL(url);
  if (parsed.searchParams.has('schema') && parsed.searchParams.get('schema') !== 'public') throw new Error('Backup/restore hanya untuk database aplikasi khusus dengan schema public.');
  parsed.searchParams.delete('schema');
  // libpq treats PGDATABASE as a name, so split the URI into its environment fields.
  // Passwords stay out of process arguments and logs.
  const env = { ...process.env, PGHOST: parsed.hostname.replace(/^\[|\]$/g, ''), PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username), PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)), PGCONNECT_TIMEOUT: '5', PGAPPNAME: 'tka-recovery', PGOPTIONS: '' };
  const parameters = { sslmode: 'PGSSLMODE', sslcert: 'PGSSLCERT', sslkey: 'PGSSLKEY', sslrootcert: 'PGSSLROOTCERT', sslcrl: 'PGSSLCRL', sslpassword: 'PGSSLPASSWORD', channel_binding: 'PGCHANNELBINDING' };
  for (const [key, value] of parsed.searchParams) {
    if (!parameters[key]) throw new Error(`Parameter URL tidak didukung untuk backup/restore: ${key}`);
    env[parameters[key]] = value;
  }
  return env;
}
export function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.resume(); // Do not expose credentials or dump contents from tool errors.
    child.on('error', () => reject(new Error(`Tidak dapat menjalankan ${path.basename(command)}; periksa instalasi PostgreSQL client.`)));
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} gagal (exit ${code}); backup/restore tidak dinyatakan berhasil.`)));
  });
}
export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function files(root, relative = '') {
  const output = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlink tidak didukung dalam bundle/unggahan.');
    if (entry.isDirectory()) output.push(...await files(root, name));
    else if (entry.isFile()) output.push(name);
    else throw new Error('Berkas khusus tidak didukung.');
  }
  return output.sort();
}
export function safeRelative(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || path.isAbsolute(name) || name.split('/').some(p => p === '..' || p === '.' || !p)) throw new Error('Path bundle tidak valid.');
  return name;
}
export async function copyTree(source, target, list) {
  for (const name of list) {
    safeRelative(name);
    const sourceFile = path.join(source, name);
    if (!(await lstat(sourceFile)).isFile()) throw new Error('Isi bundle berubah atau bukan file reguler.');
    await mkdir(path.dirname(path.join(target, name)), { recursive: true, mode: 0o700 });
    await copyFile(sourceFile, path.join(target, name));
  }
}
