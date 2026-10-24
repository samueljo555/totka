import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: await bcrypt.hash('123', 10),
      fullName: 'Super Admin',
      role: 'super_admin'
    },
  });
  
  await prisma.user.upsert({
    where: { username: 'guru' },
    update: {},
    create: {
      username: 'guru',
      password: await bcrypt.hash('123', 10),
      fullName: 'Guru Tester',
      role: 'guru'
    },
  });
  
  await prisma.user.upsert({
    where: { username: 'operator' },
    update: {},
    create: {
      username: 'operator',
      password: await bcrypt.hash('123', 10),
      fullName: 'Operator Tester',
      role: 'operator'
    },
  });
  
  await prisma.user.upsert({
    where: { username: 'siswa' },
    update: {},
    create: {
      username: 'siswa',
      password: await bcrypt.hash('123', 10),
      fullName: 'Siswa Tester',
      role: 'siswa'
    },
  });
  console.log("Seeding finished.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
