# Deployment, backup, dan pemulihan TKA

Panduan ini untuk PostgreSQL khusus aplikasi, schema `public`, dan PM2 pada satu host. Semua contoh dijalankan oleh akun layanan aplikasi; sesuaikan path. Lakukan perubahan pada jadwal pemeliharaan di luar ujian. Prosedur pembaruan rutin ini tidak menjalankan reset, truncate, atau seed. Untuk keputusan pengguna memulai dari kosong pada Tahap 5, gunakan [panduan khusus database kosong](FRESH_DATABASE_STAGE5.md) dan terapkan frontend/backend bersama.

## Konfigurasi dan lokasi data

- Gunakan Node.js 22.12+ yang disarankan (batas build diperiksa oleh `ops/prepare-release.sh`), npm lockfile, PostgreSQL, dan utilitas `pg_dump`/`pg_restore`. Client PostgreSQL harus kompatibel dengan versi server; gunakan major yang sama untuk pengujian pemulihan.
- `backend/.env` selalu dibaca dari direktori backend, termasuk setelah kompilasi. Environment proses mengalahkan nilai file. Salin template `backend/.env_example`, isi `DATABASE_URL`, `JWT_SECRET` minimal 32 karakter, dan secret kartu. Batasi file ke pemilik (`chmod 600`). Jangan commit atau masukkan secret ke argumen perintah/log.
- `UPLOAD_DIR` default `backend/uploads`, terlepas dari menjalankan TypeScript atau `backend/dist`. Untuk produksi, gunakan volume persisten absolut, misalnya `/srv/tka-data/uploads`. Pemiliknya harus akun layanan aplikasi dan harus dapat dibaca/ditulis.
- Versi backend compiled sebelumnya menulis ke `backend/dist/uploads`. Periksa lokasi media lama sebelum upgrade. Saat aplikasi dihentikan, salin isi ke volume persisten dan verifikasi gambar. Jika nama berkas sama tetapi isi berbeda, selesaikan konflik; jangan menimpa otomatis. Jangan menghapus folder lama sebelum backup dan verifikasi selesai. Rebuild tidak memindahkan media secara otomatis.
- `FRONTEND_DIST_DIR` default `dist` pada root proyek. Backend compiled menyajikan folder ini serta fallback rute SPA. Startup produksi menolak frontend yang belum dibuild. Frontend/backend harus berasal dari release yang sama.
- `STORAGE_PROVIDER=GCP` memerlukan `GCP_BUCKET_NAME` dan akses bucket. Objek GCP tidak termasuk bundle lokal; atur versioning/retention dan salinan bucket secara terpisah. Akses bucket tidak diverifikasi oleh endpoint kesiapan.
- Pertahankan **key enkripsi kartu yang saat ini dipakai**. Bila kartu sebelumnya memakai fallback `JWT_SECRET`, menambahkan `LOGIN_CARD_SECRET` dengan nilai berbeda akan membuat kartu lama tidak terbaca. Pisahkan key hanya dengan mempertahankan nilai key efektif lama atau melalui migrasi enkripsi tersendiri.

PM2 menggunakan cwd absolut, menunggu pesan `ready` setelah pemeriksaan database dan listen HTTP, serta memberi 20 detik sebelum mematikan proses. `WEB_CONCURRENCY` mengatur worker, `APP_WORKERS` harus mencerminkan seluruh proses bila beberapa host. Anggaran koneksi dijelaskan pada README. Konfigurasi ini bukan jaminan kapasitas 10.000 pengguna bersamaan.

### Koneksi melalui PgBouncer/pooler

Error `08P01: unsupported startup parameter: statement_timeout` berarti endpoint menolak parameter saat koneksi dibuka. `db:check` bisa berhasil karena Prisma CLI tidak memakai konfigurasi pool runtime yang sama. Menambahkan `pgbouncer=true` ke URL tidak membuat driver `pg` menghilangkan parameter tersebut.

1. Tambahkan `DB_SERVER_TIMEOUTS=false` pada `backend/.env`. Nilai default `true` mempertahankan batas startup untuk koneksi langsung. Mode kompatibilitas menghilangkan dua parameter startup: `statement_timeout` dan `idle_in_transaction_session_timeout`. Jangan menyisipkan parameter tersebut melalui URL atau `options` jika pooler menolaknya.
2. Minta administrator menetapkan batas server pada role aplikasi/database PostgreSQL. Contoh berikut memakai **nama contoh** yang harus diganti dengan role dan database sebenarnya, melalui koneksi administrasi langsung:

   ```sql
   ALTER ROLE tka_app IN DATABASE tka SET statement_timeout = '15s';
   ALTER ROLE tka_app IN DATABASE tka SET idle_in_transaction_session_timeout = '20s';
   ```

   Pengaturan berlaku untuk sesi server baru; administrator perlu memastikan koneksi server pooler diperbarui sesuai prosedur layanannya. `DB_STATEMENT_TIMEOUT_MS` tidak diterapkan oleh aplikasi ketika `DB_SERVER_TIMEOUTS=false`. `DB_QUERY_TIMEOUT_MS` tetap membatasi waktu tunggu driver, tetapi tidak menjamin query berhenti di PostgreSQL.
3. Dari root proyek, jalankan `npm --prefix backend run build`, lalu `pm2 startOrReload ecosystem.config.cjs --update-env`. Environment yang sudah ada di PM2 mengalahkan `.env`; jika variabel ini pernah dipasang pada environment PM2, perbarui juga nilai tersebut secara eksplisit saat reload.
4. Periksa `pm2 status`, log aplikasi, serta `/api/ready`. Setelah seluruh worker sehat, jalankan `pm2 save`. Tidak diperlukan migrasi atau reset database.

Jumlah worker diatur pada environment saat file ecosystem dibaca, bukan dari `backend/.env`. Untuk satu VM dengan delapan worker, gunakan `WEB_CONCURRENCY=8 APP_WORKERS=8` saat menjalankan perintah PM2. Jika jumlah proses lama belum berubah, gunakan `pm2 scale tka-app-server 8` setelah environment `APP_WORKERS` diperbarui. Dengan konfigurasi bawaan, delapan worker memiliki maksimum total 40 koneksi client pool; koneksi server PostgreSQL di belakang pooler mengikuti konfigurasi pooler.

## Memasang database baru

Siapkan database kosong dan akun pemilik schema menggunakan pengelolaan PostgreSQL Anda. Pastikan `DATABASE_URL` menunjuk ke database tersebut, lalu dari root proyek:

```bash
./ops/prepare-release.sh
cd backend
npm run db:deploy
```

Skrip prepare hanya menginstal dependency terkunci, generate Prisma Client, dan build; tidak memigrasikan database atau me-restart proses. `db:deploy` menjalankan seluruh migrasi dan membandingkan schema akhir dengan `schema.prisma`. Seluruh migrasi awal tetap utuh; migrasi bridge melengkapi struktur lama sebelum migrasi kartu, versi jawaban, dan indeks. Buat admin dengan `npm run create-admin` dari backend setelah build; perintah memakai JavaScript hasil kompilasi tanpa mengunduh runner tambahan. seed bukan langkah pembaruan produksi.

## Mengadopsi database yang sudah ada

Instalasi lama mungkin dibuat memakai `db push` atau SQL manual, sehingga data sudah benar tetapi riwayat migrasi belum lengkap. **Backup dan uji prosedur berikut pada hasil restore terlebih dahulu.** Hentikan seluruh writer ketika mengadopsi/memigrasikan agar schema tidak berubah saat diperiksa.

```bash
cd backend
npm run db:adopt
npm run db:adopt -- --apply
npm run db:deploy
```

Perintah pertama hanya memeriksa. Perintah kedua merekam migrasi yang struktur fisiknya sudah ada; tidak mengganti akun, hash, kartu, jawaban, atau nilai. Pemeriksaan menggunakan diff schema Prisma untuk kolom, tipe, constraint, dan indeks; memeriksa checksum riwayat yang dikenal; dan menolak migrasi gagal, indeks/kolom parsial, serta drift tak dikenal. Setelah adopsi, `db:deploy` menjalankan hanya migrasi yang masih diperlukan. Adopsi hanya berlaku pada schema lengkap yang sudah cocok dengan model terbaru. Schema parsial atau schema yang masih memiliki bacaan terpisah ditolak tanpa perubahan; untuk rilis Tahap 5 gunakan panduan database kosong bila memulai ulang.

Jika riwayat dan schema sudah sepenuhnya selaras, cukup `npm run db:deploy`. `migrate deploy` pada deployment biasa tidak menggantikan audit drift: `db:check` tetap dijalankan oleh skrip tersebut. Jangan mengedit file migrasi yang sudah diterapkan atau menandai migrasi selesai hanya untuk menghilangkan error.

Schema awal yang masih berisi `School.id`/`User.schoolId` dan belum memiliki username/password memerlukan pemetaan identitas sekolah ke NPSN dan penetapan kredensial yang ditinjau khusus. Migrasi menolak data semacam itu daripada menebak identitas. Uji pemetaan pada clone, rekonsiliasi relasi dan jumlah data, lalu audit ulang. Riwayat migrasi tetap dapat membangun instalasi kosong hingga model terbaru; migrasi penghapusan bacaan menolak data bacaan terpisah yang masih terisi. Schema parsial/tak dikenal harus diperbaiki pada clone sebelum jalur produksi dipilih.

Pembuatan indeks menggunakan `CREATE INDEX` biasa dan dapat menahan penulisan. Hindari jam ujian. Bila migrasi gagal, jangan menjalankan reset: catat migrasi dan error, periksa transaksi/schema pada clone, siapkan perbaikan atau pemulihan, lalu selesaikan status migrasi sesuai hasil sebenarnya.

## Backup

Bundle berisi `database.dump` format custom PostgreSQL, media lokal dalam `uploads/`, serta `manifest.json` berisi waktu, checksum SHA-256 dump/media, dan penyedia storage. Nama `.partial` menandai proses belum selesai; hanya rename akhir yang menyatakan backup berhasil. Script keluar dengan kode bukan nol bila database, utilitas dump, atau media gagal. Secret/config **tidak** disalin otomatis.

Untuk backup pemeliharaan yang konsisten antara gambar dan database, hentikan seluruh writer aplikasi termasuk worker pada host lain. Backup PostgreSQL konsisten pada snapshot dump; berkas yang berubah saat backup tidak memiliki snapshot bersama database.

```bash
cd /srv/tka/backend
BACKUP_DIR=/srv/tka-backups npm run backup
```

`BACKUP_DIR` wajib absolut dan di luar repository. `UPLOAD_DIR` dan penyedia storage dibaca dari environment/backend `.env`. Direktori media lokal yang hilang dianggap gagal. Script tidak mengikuti symlink di dalam media. Bundle dibuat privat untuk pemilik; belum dienkripsi oleh skrip. Simpan di penyimpanan terenkripsi dengan akses terbatas dan salinan di host/lokasi lain.

Cadangkan terpisah melalui pengelola secret: konfigurasi koneksi, key efektif enkripsi kartu, JWT, kredensial bucket, serta konfigurasi deployment. Jangan menaruh secret di repository atau manifest. Tanpa key yang sesuai, hash password tetap dapat dipakai login tetapi kartu terenkripsi tidak dapat dibaca. Berkas SQL `supabase_schema.sql` bukan pengganti backup PostgreSQL aplikasi.

Contoh cron akun layanan, setelah path dan izin diverifikasi (backup harian pukul 01:00 mengikuti timezone host):

```cron
0 1 * * * /usr/bin/flock -n /srv/tka-backups/.backup.lock /bin/bash -c 'cd /srv/tka/backend && BACKUP_DIR=/srv/tka-backups /usr/bin/npm run backup' >> /srv/tka-backups/backup.log 2>&1
```

Siapkan direktori sebelum memasang cron. Gunakan path Node/npm yang benar pada server; cron tidak otomatis memuat konfigurasi nvm. Contoh cron melakukan backup saat aplikasi hidup, sehingga konsistensi media membutuhkan jadwal tanpa perubahan media atau snapshot/maintenance terpisah. Jadwal ini belum dipasang oleh perubahan kode. Periksa log/kode keluar, ruang disk, umur backup terakhir, dan salinan di luar host. Atur rotasi log serta retensi storage, misalnya 7 backup harian dan 4 mingguan setelah kebutuhan pemulihan disepakati. Skrip tidak menghapus backup lama otomatis. Backup harian memiliki potensi kehilangan perubahan sejak backup terakhir; kebutuhan kehilangan data dalam menit memerlukan WAL/PITR dan layanan backup PostgreSQL tersendiri.

## Restore ke database terpisah

Gunakan bundle dari sumber tepercaya; checksum mendeteksi kerusakan, bukan membuktikan keaslian. Siapkan database kosong khusus pemulihan dan folder media baru/kosong. Simpan `RESTORE_DATABASE_URL` dalam environment aman. Script tidak menggunakan `DATABASE_URL` sebagai fallback, menolak target berisi tabel/view/sequence, dan tidak menjalankan `DROP`/`--clean`.

```bash
cd /srv/tka/backend
RESTORE_UPLOAD_DIR=/srv/tka-restore/uploads npm run restore -- /srv/tka-backups/NAMA_BUNDLE
```

`RESTORE_DATABASE_URL` wajib diisi sebelum perintah tersebut. Target harus PostgreSQL dengan schema `public`; URL driver khusus seperti parameter `connection_limit`/`pool_timeout` tidak didukung oleh utilitas backup. Parameter TLS libpq yang didukung dipetakan ke environment; password tidak diletakkan dalam argumen proses.

Urutan script: periksa manifest dan checksum seluruh media, periksa database/media target kosong, baca arsip, restore PostgreSQL dalam satu transaksi, lalu salin media. Kegagalan SQL membatalkan transaksi restore. Jika penyalinan media gagal setelah transaksi database selesai, database sudah terisi: gunakan target baru dan ulangi restore, atau selesaikan salinan secara terkontrol; script tidak mengklaim transaksi atomik lintas database dan filesystem. Untuk GCP, restore ini hanya memulihkan database; bucket harus dipulihkan/diverifikasi terpisah.

Setelah restore:

1. Buat environment aplikasi pengujian yang menunjuk ke database/media hasil restore dan secret yang benar. Jangan gunakan proses produksi untuk menguji clone.
2. Jalankan `npm run db:check` terhadap target; gunakan versi aplikasi yang cocok dengan backup. Terapkan migrasi teruji bila target akan dinaikkan ke release terbaru.
3. Periksa jumlah akun/sekolah/paket/sesi/jawaban, nilai, login, dekripsi kartu, gambar, dan hasil ujian. Sweep startup dapat menyelesaikan sesi yang deadlinenya sudah lewat; catat hasilnya. Restore tidak mengembalikan waktu ujian.
4. Sebelum mengalihkan traffic, hentikan semua worker lama. Bila Redis digunakan, tetapkan **`CACHE_NAMESPACE` baru** pada seluruh worker agar cache sebelum restore tidak terbaca. Contoh nilai: `tka-restore-20261025`. Jangan memakai namespace berbeda antar-worker aplikasi yang sama.
5. Alihkan koneksi dan media ke hasil restore yang sudah diperiksa, jalankan aplikasi, cek readiness dan alur pengguna, lalu buka kembali akses. Simpan database lama untuk investigasi sesuai kebijakan retensi.

Backup server tidak menyertakan antrean jawaban di browser siswa. Jawaban yang belum pernah diterima server tidak dapat dipulihkan dari backup database. Pemulihan ke snapshot lama juga menghilangkan jawaban server sesudah snapshot tersebut; tentukan tindakan operasional untuk ujian terdampak sebelum melanjutkan.

## Urutan pembaruan aplikasi

1. Catat commit release dan konfigurasi lama, pilih jadwal pemeliharaan, serta uji build/migrasi/restore pada clone. Siapkan release baru menggunakan `ops/prepare-release.sh` di checkout terpisah bila memungkinkan.
2. Tutup akses ujian melalui maintenance di proxy dan hentikan seluruh worker/writer. Untuk satu host: `pm2 stop tka-app-server`. Tunggu proses berhenti sebelum backup.
3. Buat dan verifikasi backup database/media serta ketersediaan secret. Jangan lanjut bila backup gagal.
4. Pasang checkout/build release yang dituju. Pertahankan `.env` dan volume media persisten. Jalankan jalur adopsi satu kali bila diperlukan, lalu `npm run db:deploy` dari backend release baru.
5. Dari root release, jalankan `pm2 startOrReload ecosystem.config.cjs --update-env`, periksa `pm2 status`, lalu endpoint dan alur pengguna di bawah. Simpan daftar proses dengan `pm2 save` setelah konfigurasi benar. Pengaturan startup PM2 setelah reboot mengikuti sistem host.
6. Buka maintenance setelah pemeriksaan berhasil. Pantau error, koneksi PostgreSQL, CPU/RAM, disk, dan sweep sesi. PM2 reload tidak menjamin tanpa downtime ketika migrasi atau perubahan kontrak API membutuhkan maintenance.

Rollback kode: bila schema tetap kompatibel, hentikan worker, gunakan build dan konfigurasi release sebelumnya, lalu mulai ulang dan verifikasi. Jika schema tidak kompatibel, jangan sekadar checkout kode lama. Pulihkan backup ke database/media baru, verifikasi, ganti namespace Redis dan koneksi, lalu alihkan traffic. Restore snapshot akan kehilangan penulisan sesudah snapshot; jangan melakukannya tanpa keputusan operasional yang jelas. Migrasi bridge/indeks tidak menyediakan down migration otomatis.

## Pemeriksaan dan pengujian

- `GET /api/health`: liveness proses HTTP; tidak membuktikan database sehat.
- `GET /api/ready`: 200 bila query ringan terhadap tabel/kolom operasional berhasil; 503 ketika database/schema tidak siap atau proses sedang draining. Timeout respons 2 detik, permintaan bersamaan digabung, hasil singkat disimpan 1 detik. Query database juga dibatasi timeout pool. Respons publik tidak berisi detail koneksi. Redis bersifat opsional dan menggunakan fallback PostgreSQL.
- Shutdown menerima SIGINT/SIGTERM, berhenti menerima koneksi, menunggu HTTP/sweep, lalu menutup Redis/Prisma/pool. Batas internal 18 detik; PM2 20 detik. Batas paksa dapat memutus request, sehingga klien tetap memerlukan retry idempoten yang sudah tersedia.
- Pantau readiness dari luar host dan alarm kegagalan backup/disk melalui sistem monitoring yang digunakan. Endpoint/log sudah disiapkan; layanan alarm eksternal belum dipasang.

Tes database hanya berjalan dengan opt-in eksplisit. Akun pengujian membutuhkan CREATE/DROP DATABASE selain CREATE SCHEMA; suite membuat nama acak dan membersihkannya, tidak memakai `DATABASE_URL` aplikasi sebagai fallback. Utilitas dump/restore wajib tersedia untuk suite operasi; `PG_DUMP_BIN`/`PG_RESTORE_BIN` dapat mengarah ke instalasi client tertentu.

```bash
INTEGRITY_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/TEST_DB' npm test --prefix backend
npm run test:sync
npm run build
npm run lint
```

Suite operasi menguji fresh deploy tanpa drift, adopsi database berisi data, penolakan schema parsial sebelum P1 tanpa mengubah data, penolakan legacy yang memerlukan mapping, backup/restore nyata, dekripsi kartu dengan key yang sama, checksum rusak, penolakan target terisi, frontend/media produksi, endpoint kesehatan, dan shutdown. Tes ini membuktikan prosedur pada fixture terisolasi; waktu pemulihan dan kapasitas server produksi harus diukur pada ukuran data serta infrastruktur target.
