# Tahap 5 — penerapan dengan database kosong

Rilis ini menghapus menu/API/model bacaan terpisah. Cerita, puisi, gambar, dan pertanyaan ditulis langsung pada **Isi soal**. Frontend dan backend harus berasal dari rilis yang sama.

Prosedur berikut untuk PostgreSQL **khusus aplikasi TOTKA**, schema pada `DATABASE_URL`, dan keputusan pengguna untuk memulai dari kosong. **Reset menghapus akun, sekolah, paket, soal, sesi, jawaban, serta nilai di schema tersebut.** Simpan backup dan konfigurasi yang masih ingin dipertahankan sebelum menjalankannya. Langkah ini dilakukan oleh pengelola server; pengujian pengembangan hanya menggunakan database terisolasi.

## 1. Hentikan layanan dan siapkan kode

Hentikan seluruh worker aplikasi pada semua host. Contoh ini memakai nama proses dari `ecosystem.config.cjs`; sesuaikan jika proses di server masih bernama lain.

```bash
pm2 stop tka-app-server
cd /home/admsys/totka
git pull --ff-only origin codex_totka
bash ops/prepare-release.sh
```

Sesuaikan path proyek. Skrip prepare memasang dependency dari lockfile, menghasilkan Prisma Client, dan membangun frontend/backend; skrip tidak mereset atau memigrasikan database.

Pertahankan `backend/.env`, `JWT_SECRET`, dan konfigurasi storage. Periksa bahwa `DATABASE_URL` menunjuk database/schema yang memang akan dikosongkan. Jika memakai Redis, gunakan **namespace baru** untuk instalasi kosong ini, misalnya `CACHE_NAMESPACE=tka_stage5_20261029` di konfigurasi backend. Ini memisahkan cache data lama tanpa membersihkan Redis milik aplikasi lain.

## 2. Reset dan terapkan seluruh migrasi

Jalankan dari direktori backend agar Prisma memakai konfigurasi yang sesuai:

```bash
cd backend
npx --no-install prisma migrate reset --force
npm run db:check
npm run create-admin
```

`migrate reset --force` mengosongkan schema sasaran dan menjalankan seluruh migrasi yang tersimpan, termasuk `20261029090000_unify_question_content`. Riwayat migrasi lama tidak dihapus dari repositori atau diedit. `db:check` harus berhasil tanpa drift. `create-admin` meminta username, password, dan nama lengkap untuk membuat akun Super Admin baru. Seed contoh bukan bagian dari prosedur ini.

Jika menggunakan **database baru yang benar-benar kosong** sebagai pengganti reset, arahkan `DATABASE_URL` ke database baru lalu jalankan `npm run db:deploy`, `npm run create-admin` dari backend. Tidak perlu `db:adopt` untuk database kosong.

## 3. Jalankan layanan dan periksa

```bash
cd ..
pm2 start ecosystem.config.cjs --only tka-app-server --update-env
```

Periksa endpoint `/api/health` dan `/api/ready` pada alamat aplikasi. Masuk dengan Super Admin baru, daftarkan sekolah/operator/guru, lalu buat satu soal dan paket uji. Pastikan guru hanya memiliki **Bank Soal**, gambar dan rumus muncul dalam pratinjau/siswa, serta token dan login siswa berjalan sebelum memasukkan data sebenarnya.

Reset database tidak menghapus media di `UPLOAD_DIR` atau bucket. Media yang ingin diarsipkan/dikosongkan dikelola terpisah oleh pengelola; proses migrasi tidak menghapusnya.

## Jika migrasi ditolak karena bacaan lama

Migrasi baru mengunci tabel lalu menolak berjalan jika `ReadingText` masih berisi data atau soal masih memiliki relasi bacaan. Migrasi tidak menebak atau menggabungkan bacaan tersebut. Untuk keputusan memulai dari kosong, kembali ke prosedur reset di atas; jangan menandai migrasi gagal sebagai selesai hanya untuk melewati pemeriksaan.

`db:adopt` kini hanya mengaudit dan mencatat riwayat pada schema yang **sudah lengkap sesuai model terbaru**. Schema bacaan terpisah, schema parsial, drift, dan riwayat/checksum tidak dikenal ditolak tanpa mengubah data. Pemulihan backup rilis lama harus memakai versi aplikasi yang sesuai backup, bukan menganggap bacaan lama dapat dibuka pada rilis ini.
