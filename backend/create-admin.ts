import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import readline from 'readline';
import bcrypt from 'bcrypt';

dotenv.config();

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log('=== SCRIPT PEMBUATAN SUPER ADMIN ===');
  
  rl.question('Masukkan Username untuk Admin Baru: ', async (username) => {
    rl.question('Masukkan Password untuk Admin Baru: ', async (password) => {
      rl.question('Masukkan Nama Lengkap Admin: ', async (fullName) => {
        
        try {
          const existingUser = await prisma.user.findUnique({
            where: { username }
          });

          const hashedPassword = await bcrypt.hash(password, 10);

          if (existingUser) {
            console.log(`\n[INFO] Username '${username}' sudah ada.`);
            console.log(`[INFO] Melakukan update password dan role ke super_admin...`);
            
            await prisma.user.update({
              where: { username },
              data: {
                password: hashedPassword,
                fullName: fullName || existingUser.fullName,
                role: 'super_admin'
              }
            });
            console.log('\n--- AKUN BERHASIL DI-UPDATE ---');
          } else {
            console.log('\n[INFO] Membuat akun super_admin baru...');
            await prisma.user.create({
              data: {
                username,
                password: hashedPassword,
                fullName: fullName || 'Super Admin',
                role: 'super_admin',
              },
            });
            console.log('\n--- AKUN BERHASIL DIBUAT ---');
          }

          console.log(`Username : ${username}`);
          console.log(`Password : ${password}`);
          console.log('----------------------------------');
          
        } catch (error) {
          console.error('\n[ERROR] Terjadi kesalahan:', error);
        } finally {
          await prisma.$disconnect();
          rl.close();
        }
      });
    });
  });
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
