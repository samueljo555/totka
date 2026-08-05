import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Menghapus semua data dari database...');
  await prisma.answer.deleteMany();
  await prisma.examSession.deleteMany();
  await prisma.packageQuestion.deleteMany();
  await prisma.package.deleteMany();
  await prisma.question.deleteMany();
  await prisma.user.deleteMany();
  await prisma.school.deleteMany();

  console.log('Membuat satu-satunya Akun Super Admin...');
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      password: 'adminpassword123',
      fullName: 'Super Admin Utama',
      role: 'super_admin',
    },
  });

  console.log('--- AKUN ADMIN BERHASIL DIBUAT ---');
  console.log(`Username : ${admin.username}`);
  console.log(`Password : adminpassword123`);
  console.log('----------------------------------');
}

main()
  .catch((e) => {
    console.error('Error saat seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
