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
  console.log('Menyiapkan Data Load Testing...');

  // 1. Buat Sekolah Dummy
  const schoolNpsn = '99999999';
  await prisma.school.upsert({
    where: { npsn: schoolNpsn },
    update: {},
    create: {
      npsn: schoolNpsn,
      name: 'Sekolah Load Test k6',
      region: 'Virtual'
    }
  });
  console.log('✅ Sekolah Dummy Dibuat');

  const passwordText = '123456';

  // 3. Buat 10.000 Siswa dalam batch (chunk)
  const totalStudents = 10000;
  const batchSize = 1000;
  
  // Bersihkan siswa dummy sebelumnya (jika ada)
  await prisma.user.deleteMany({
    where: { role: 'siswa', className: 'LoadTest' }
  });

  console.log(`Membuat ${totalStudents} siswa...`);
  
  for (let i = 0; i < totalStudents; i += batchSize) {
    const studentsToCreate = [];
    for (let j = 0; j < batchSize; j++) {
      const num = i + j + 1;
      studentsToCreate.push({
        username: `siswa${num}`,
        password: passwordText,
        fullName: `Siswa Dummy ${num}`,
        role: 'siswa',
        nisn: (1000000000 + num).toString(),
        className: 'LoadTest',
        schoolNpsn: schoolNpsn
      });
    }
    
    await prisma.user.createMany({
      data: studentsToCreate,
      skipDuplicates: true
    });
    console.log(`⏳ Batch ${i / batchSize + 1} selesai (${i + batchSize} siswa)`);
  }

  console.log('✅ 10.000 Siswa Dummy Berhasil Dibuat!');
  console.log('Kredensial Siswa:');
  console.log('- Username: siswa1 hingga siswa10000');
  console.log('- Password: ' + passwordText);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
