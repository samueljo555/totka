import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { loadJwtSecret } from './config.js';
import { createApp } from './app.js';

const secret = loadJwtSecret();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const port = process.env.PORT || 3001;

createApp(prisma, secret).listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
