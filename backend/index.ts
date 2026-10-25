import fs from 'node:fs';
import path from 'node:path';
import { runtimePaths } from './runtime-paths.js';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { loadJwtSecret } from './config.js';
import { finalizeExpiredExams } from './exam.js';
import { poolConfig } from './pool-config.js';
import { closeCache } from './cache.js';
import { createApp } from './app.js';
import { createLoginCardCipher } from './login-cards.js';
import { checkDatabase } from './readiness.js';

const secret = loadJwtSecret();
createLoginCardCipher(process.env.LOGIN_CARD_SECRET || secret);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi.');
const pool = new Pool(poolConfig());
pool.on('error', () => console.error('PostgreSQL idle connection error'));
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const port = process.env.PORT || 3001;

const paths = runtimePaths();
if (process.env.NODE_ENV === 'production' && !fs.existsSync(path.join(paths.frontend, 'index.html'))) {
  throw new Error('Build frontend belum tersedia pada FRONTEND_DIST_DIR.');
}
if (!['LOCAL', 'GCP'].includes(process.env.STORAGE_PROVIDER || 'LOCAL')) throw new Error('STORAGE_PROVIDER tidak valid.');
if (process.env.STORAGE_PROVIDER === 'GCP' && !process.env.GCP_BUCKET_NAME) throw new Error('GCP_BUCKET_NAME wajib diisi.');
// Fail before accepting requests if the DB or required schema is unavailable.
try { await checkDatabase(prisma); }
catch { console.error('Startup gagal: database/schema tidak siap. Periksa koneksi dan jalankan db:check.'); await closeCache(); await prisma.$disconnect(); await pool.end(); process.exit(1); }
let shuttingDown = false;
const server = createApp(prisma, secret, process.env.LOGIN_CARD_SECRET || secret, { isDraining: () => shuttingDown }).listen(port, () => {
  console.log(`Server is running on port ${(server.address() as { port: number }).port}`);
  if (process.send) process.send('ready');
});

// One bounded pass at a time per process. DB row locks also make PM2 workers safe.
let sweeping = false;
let activeSweep: Promise<void> = Promise.resolve();
const sweep = async () => {
  if (sweeping || shuttingDown) return;
  sweeping = true;
  let hasMore = false;
  try { hasMore = await finalizeExpiredExams(prisma) >= 100; }
  catch { console.error('Expired exam finalization failed'); }
  finally { sweeping = false; }
  if (hasMore) setTimeout(() => { activeSweep = sweep(); }, 0).unref();
};
activeSweep = sweep();
const sweepTimer = setInterval(() => { if (!sweeping) activeSweep = sweep(); }, 15000);
sweepTimer.unref();
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(sweepTimer);
  const deadline = setTimeout(() => {
    console.error('Shutdown deadline reached');
    process.exit(1);
  }, 18000);
  deadline.unref();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await activeSweep;
  await closeCache();
  await prisma.$disconnect();
  await pool.end();
  clearTimeout(deadline);
  // Cluster managers keep an IPC channel open after HTTP and pools are closed.
  if (process.connected) process.disconnect?.();
};
process.on('SIGTERM', () => { void shutdown().catch(() => { console.error('Shutdown failed'); process.exit(1); }); });
process.on('SIGINT', () => { void shutdown().catch(() => { console.error('Shutdown failed'); process.exit(1); }); });
