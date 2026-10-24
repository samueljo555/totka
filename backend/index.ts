import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { loadJwtSecret } from './config.js';
import { finalizeExpiredExams } from './exam.js';
import { createApp } from './app.js';

const secret = loadJwtSecret();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const port = process.env.PORT || 3001;

createApp(prisma, secret).listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// One bounded pass at a time per process. DB row locks also make PM2 workers safe.
let sweeping = false;
const sweep = async () => {
  if (sweeping) return;
  sweeping = true;
  let hasMore = false;
  try { hasMore = await finalizeExpiredExams(prisma) >= 100; }
  catch (error) { console.error('Expired exam finalization failed:', error); }
  finally { sweeping = false; }
  if (hasMore) setTimeout(() => { void sweep(); }, 0).unref();
};
void sweep();
setInterval(() => { void sweep(); }, 15000).unref();
