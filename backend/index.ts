import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { loadJwtSecret } from './config.js';
import { finalizeExpiredExams } from './exam.js';
import { poolConfig } from './pool-config.js';
import { closeCache } from './cache.js';
import { createApp } from './app.js';

const secret = loadJwtSecret();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi.');
const pool = new Pool(poolConfig());
pool.on('error', () => console.error('PostgreSQL idle connection error'));
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const port = process.env.PORT || 3001;

const server = createApp(prisma, secret).listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// One bounded pass at a time per process. DB row locks also make PM2 workers safe.
let sweeping = false;
let shuttingDown = false;
const sweep = async () => {
  if (sweeping || shuttingDown) return;
  sweeping = true;
  let hasMore = false;
  try { hasMore = await finalizeExpiredExams(prisma) >= 100; }
  catch (error) { console.error('Expired exam finalization failed:', error); }
  finally { sweeping = false; }
  if (hasMore) setTimeout(() => { void sweep(); }, 0).unref();
};
void sweep();
const sweepTimer = setInterval(() => { void sweep(); }, 15000);
sweepTimer.unref();
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(sweepTimer);
  await new Promise<void>(resolve => server.close(() => resolve()));
  await closeCache();
  await prisma.$disconnect();
  await pool.end();
};
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
