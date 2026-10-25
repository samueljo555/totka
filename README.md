# TKA APP (Aplikasi Ujian & Try Out)

Aplikasi platform ujian dan Try Out berbasis web yang memungkinkan pengaturan Bank Soal, Paket Ujian, manajemen peserta didik, dan penilaian otomatis.


## Keamanan API dan konfigurasi JWT

Backend membaca `backend/.env` dari lokasi backend, baik dijalankan melalui source maupun hasil build. Isi `JWT_SECRET` dengan secret acak minimal 32 karakter; gunakan `openssl rand -hex 32` untuk membuatnya. Aplikasi menolak startup jika secret kosong atau terlalu pendek. Jangan gunakan nilai contoh sebagai secret produksi.

Setelah pembaruan keamanan ini diterapkan, semua pengguna perlu login kembali karena JWT sekarang menyertakan pengenal sesi aktif (`sid`). Login pada perangkat lain atau reset password membatalkan token sebelumnya. Backend membaca identitas, peran, sekolah, dan sesi aktif dari database pada setiap request terproteksi; pool koneksi dibatasi per proses dan kapasitas aktual tetap perlu dibuktikan melalui load test.

| Peran | Akses |
| --- | --- |
| Admin / super admin | Mengelola akun, sekolah, paket, seluruh bank soal/bacaan, dan analitik |
| Guru | Membaca, membuat, dan mengubah soal serta bacaan miliknya; mengunggah gambar |
| Operator | Melihat dan mendaftarkan siswa di sekolahnya; melihat token paket aktif dan sesi sekolahnya; detail hasil hanya untuk sesi selesai di sekolahnya, tanpa kunci jawaban |
| Siswa | Memulai, menjawab, dan menyelesaikan sesi miliknya; tidak mendapat akses bank soal atau API administrasi |

Operator tanpa sekolah ditolak. ID siswa, pembuat paket, dan penulis soal/bacaan ditentukan oleh identitas terautentikasi. Endpoint yang belum masuk daftar izin ditolak secara default. Endpoint publik hanya login, liveness, dan readiness. Pemeriksaan sesi juga memerlukan Bearer JWT.

Password/hash dan token aktif tidak dikirim melalui daftar pengguna maupun relasi siswa pada sesi/analitik. Respons login tetap mengirim token milik pengguna itu sendiri. Kunci jawaban tidak dikirim melalui respons ujian siswa atau hasil operator. Nilai siswa yang ditunda juga disembunyikan oleh API.

Password akun baru, termasuk akun dari seed dan generator data uji, langsung di-hash. Akun lama yang masih menggunakan plaintext tetap dapat login dan otomatis diubah menjadi bcrypt setelah login berhasil; pembaruan kode ini tidak menjalankan perubahan massal pada database yang sudah ada. Password awal operator yang dibuat dari data sekolah tetap mengikuti NPSN, sehingga admin sebaiknya menggantinya sebelum digunakan.

Password siswa baru dibuat otomatis sebanyak 6 karakter huruf kapital/angka tanpa karakter 0/O dan 1/I/L yang mudah tertukar. Password untuk autentikasi tetap di-hash dengan bcrypt. Salinan untuk kartu login disimpan terenkripsi AES-256-GCM pada kolom `User.loginCardPassword`, terikat pada ID siswa. Daftar pengguna biasa, login, sesi, dan analitik tidak mengirim hash atau nilai terenkripsi tersebut.

Endpoint kartu login khusus admin/operator (`GET /api/users/login-cards` dan `GET /api/users/:id/login-card`) mengembalikan `loginPassword` untuk pencetakan. Operator hanya dapat mengakses siswa di sekolahnya; siswa dan guru ditolak. Dasbor operator memuat password tersebut pada daftar siswa dan mengambil kartu terbaru sebelum mencetak. Password tetap tersedia setelah reload; CSV tidak lagi diunduh otomatis. Form edit admin dapat menampilkan password kartu siswa, dan menyimpan password yang sama saat mengubah profil tidak memutus sesi siswa.

Akun lama yang masih plaintext tetap dapat dicetak dan otomatis mendapatkan salinan terenkripsi ketika login meng-upgrade password menjadi hash. Akun lama yang sudah di-hash tetapi belum memiliki salinan terenkripsi tidak dapat dipulihkan dari hash. UI menampilkan “Belum tersedia” dan menyediakan tombol Atur ulang dengan konfirmasi; reset membuat password 6 karakter, memperbarui hash dan kartu secara bersamaan, serta membatalkan sesi lama. Tidak ada reset massal atau perubahan otomatis terhadap password lama. Jika ada kartu yang belum tersedia, pencetakan dihentikan dengan pesan untuk mengatur ulang akun tersebut, agar kartu tanpa password tidak dibagikan.

Token paket aktif tersedia kembali bagi operator melalui daftar paket untuk menu Pantau Ujian; token paket draft/nonaktif tetap disembunyikan. Token sesi pengguna dan kunci jawaban tetap dilindungi.

### Migrasi kartu login

Sebelum menjalankan versi ini pada database eksisting, tambahkan kolom nullable menggunakan migrasi `backend/prisma/migrations/20261024120000_student_login_cards/migration.sql`, lalu jalankan `prisma generate` sebelum build backend. Migrasi hanya menambahkan satu kolom; tidak mengganti password, akun, atau sesi lama. Database uji dibuat dari schema terbaru. Untuk instalasi baru atau riwayat migrasi yang belum lengkap, gunakan prosedur adopsi/deployment pada [panduan operasional](docs/OPERATIONS.md); jangan reset atau seed untuk pembaruan.

`LOGIN_CARD_SECRET` bersifat opsional dan harus minimal 32 karakter jika diisi. Bila kosong, enkripsi menggunakan key yang diturunkan dari `JWT_SECRET`. Pertahankan secret yang dipilih beserta backup database; menggantinya tanpa migrasi enkripsi membuat kartu lama tidak dapat dibaca meski login bcrypt tetap berfungsi. Untuk memisahkan rotasi JWT dari enkripsi kartu, tetapkan `LOGIN_CARD_SECRET` yang stabil sejak pertama menerapkan fitur ini. Secret tidak disimpan di repository.

### Verifikasi perubahan keamanan

Jalankan `npm test --prefix backend` untuk build backend dan pengujian HTTP dengan repository terisolasi. Pengujian tidak mengakses database aplikasi. Jalankan `npm run build` untuk memeriksa frontend. Pengujian ini mencakup otorisasi peran, isolasi sekolah/kepemilikan, penyembunyian kredensial dan kunci jawaban, hash password, serta pencabutan sesi. Pengujian database produksi, cache Redis aktif, dan kapasitas 10.000 peserta tetap membutuhkan lingkungan pengujian tersendiri.

## Integritas ujian

Deadline dihitung dari `ExamSession.startTime + Package.durationMinutes`. Server menggunakan waktu PostgreSQL setelah memperoleh kunci sesi; timestamp dan jam perangkat siswa tidak menentukan penerimaan jawaban. Jawaban yang baru diproses setelah deadline ditolak dengan `409 EXAM_EXPIRED`. Sesi tersebut diselesaikan dari jawaban yang sudah tersimpan. Jawaban setelah sesi selesai ditolak dengan `409 EXAM_CLOSED`. Tidak ada tambahan waktu untuk antrean offline yang terlambat dikirim.

Mulai ujian mengembalikan `serverTime`, `deadline`, dan `remainingSeconds`. Timer browser memakai anggaran waktu server dan jam monotonic untuk menghindari drift interval serta perubahan jam perangkat. Jawaban offline hanya dapat dinilai jika diterima dan diperiksa server sebelum deadline. Browser menunggu request penyimpanan yang masih berjalan dan sinkronisasi sebelum finalisasi manual; ketika waktu habis, ujian tetap ditutup tanpa menunggu jawaban offline yang terlambat.

Penyimpanan jawaban dan finalisasi menggunakan transaksi serta row lock PostgreSQL pada sesi yang sama. Request selesai berulang mengembalikan hasil yang sudah tersimpan tanpa menghitung ulang atau mengganti waktu selesai. Flag benar/salah dan nilai akhir commit bersama; kegagalan membatalkan semuanya. Hanya soal dalam paket yang dihitung, termasuk saat database berisi jawaban lama dari soal di luar paket. Pembaruan flag jawaban menggunakan dua operasi batch, bukan satu update untuk setiap jawaban.

Format jawaban: pilihan tunggal berupa indeks angka; pilihan kompleks berupa array indeks unik; kategori berupa array 0/1 dengan `null` untuk pernyataan belum dijawab. Array kategori parsial dilengkapi `null`. Jawaban kosong tidak dianggap benar. Paket baru hanya dapat dimulai jika durasi, opsi, tipe soal, dan kunci jawaban valid. Urutan soal memakai ID yang stabil; backup baru memakai ID soal, dan antrean offline lama dipulihkan berdasarkan ID soal, bukan nomor tampilan.

Setelah terdapat sesi ujian, isi paket (termasuk durasi dan daftar soal), soal, serta bacaan terkait tidak dapat diedit atau dihapus melalui API. Buat konten/paket baru untuk revisi. Status paket dan pengaturan rilis nilai tetap dapat diubah. Menutup status paket mencegah peserta baru; peserta yang sudah memulai tetap dapat melanjutkan sampai deadline semula. Advisory lock bersama pada mulai ujian dan eksklusif pada perubahan konten mencegah benturan saat peserta pertama masuk. Lihat [mekanisme locking PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).

Backend menjalankan sweep sesi kedaluwarsa saat startup dan setiap 15 detik. Setiap batch memproses maksimal 100 sesi, lalu menjadwalkan batch berikutnya jika penuh; row lock menjaga konsistensi ketika beberapa worker menjalankannya bersamaan. Sesi yang ditinggalkan browser tetap diselesaikan. Waktu selesai dibatasi pada deadline, meski sweep berjalan lebih lambat. Ini tidak memerlukan perubahan schema database.

### Pengujian integritas dengan PostgreSQL

`npm test --prefix backend` menjalankan pengujian keamanan dan validasi jawaban. Suite transaksi PostgreSQL hanya berjalan jika `INTEGRITY_TEST_DATABASE_URL` diberikan secara eksplisit; tidak pernah mengambil `DATABASE_URL` aplikasi sebagai fallback. Gunakan database pengujian terpisah:

```bash
cd backend
INTEGRITY_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/TEST_DB' npm test
```

Suite membuat schema acak dari schema Prisma terbaru, menjalankan transaksi menggunakan dua client/pool PostgreSQL, lalu menghapus schema buatannya. Pengguna database uji harus boleh membuat schema. Pengujian mencakup mulai serentak, jawaban lintas paket, payload salah, deadline setelah menunggu lock, finalisasi bersamaan, rollback, sweep multi-worker, dan perubahan konten saat peserta pertama masuk. Pengujian ini tidak membuktikan kapasitas 10.000 peserta. Optimasi query/cache dijelaskan pada bagian P1 di bawah. Deployment dan pemulihan dijelaskan pada [panduan operasional](docs/OPERATIONS.md). Load test kapasitas tetap menjadi prioritas berikutnya.

## Keandalan penyimpanan jawaban (P1)

Setiap jawaban memiliki `version` yang meningkat per soal dan `mutationId` unik. Request simpan wajib menyertakan keduanya. Server memeriksa versi di dalam transaksi sesi: versi lebih tinggi disimpan; pengiriman ulang versi/ID/payload yang sama dikonfirmasi tanpa perubahan; versi lama atau benturan ID/versi ditolak dengan `409 ANSWER_VERSION_CONFLICT` disertai jawaban server saat ini. Respons mulai ujian menyertakan metadata ini pada `existingAnswers`. ID dan versi menentukan urutan, bukan timestamp perangkat. Klien lama yang belum mengirim metadata ditolak; frontend dan backend perlu diperbarui bersama, lalu halaman ujian dimuat ulang.

Browser menyimpan perubahan ke outbox per sesi dan ID soal sebelum mengirim request. Pilihan baru tetap tersimpan ketika request sebelumnya masih berjalan; respons lama hanya boleh menghapus entri dengan versi dan ID yang cocok. Konfirmasi server juga disimpan terpisah agar respons tertunda dari tab lain tidak menurunkan tampilan jawaban terbaru. Reload membandingkan outbox dengan versi server: pengiriman yang sudah diterima tidak dikirim ulang, pilihan baru dilanjutkan, dan perbedaan yang belum dapat dipastikan ditampilkan sebagai konflik. Pilih “Gunakan jawaban server” atau konfirmasikan “Kirim jawaban saya”; konflik tidak diselesaikan dengan menimpa data otomatis. Cadangan P0 dipulihkan berdasarkan ID soal, dan data tanpa versi yang berbeda dari server juga meminta pilihan eksplisit.

Pengiriman menggabungkan klik cepat selama 150 ms dan menggunakan satu request aktif per halaman. Gangguan jaringan, timeout 15 detik, HTTP 408/429/5xx dicoba ulang memakai ID dan versi yang sama, maksimal lima percobaan termasuk percobaan pertama. Jeda meningkat dari sekitar 1, 2, 4, 8 detik dengan jitter, batas normal 30 detik; `Retry-After` dapat memperpanjang jeda sampai lima menit. Setelah batas percobaan, siswa dapat menekan “Coba kirim ulang”. Error validasi/otorisasi permanen dan konflik tidak diulang otomatis. Error server tidak dianggap sebagai perubahan status koneksi browser. Deadline server tetap berlaku dan pengiriman otomatis berhenti ketika anggaran waktu habis.

Status ditampilkan per soal dan pada ringkasan: tersimpan, menunggu pengiriman/koneksi, menyimpan, menunggu kirim ulang, gagal, atau konflik. Navigasi soal berwarna oranye untuk perubahan yang belum dikonfirmasi dan merah untuk kegagalan/konflik. Kegagalan penyimpanan perangkat ditampilkan secara eksplisit; siswa tidak dijanjikan pemulihan setelah reload jika penyimpanan perangkat gagal. Cadangan yang rusak tidak dihapus diam-diam dan memblokir finalisasi manual sampai diperiksa; penutupan otomatis saat deadline tetap berlaku.

Finalisasi manual menunggu antrean dan menyertakan `expectedAnswers` berupa `{ questionId, version, mutationId }` untuk jawaban yang telah dikonfirmasi. Di dalam lock sesi yang sama, server menolak manifest yang tidak cocok dengan `409 ANSWERS_NOT_SYNCED`, tanpa mengubah status atau nilai. Ketika deadline sudah lewat, sesi tetap ditutup dari jawaban yang sudah diterima. Entri outbox dihapus setelah versi yang tepat dikonfirmasi; seluruh cadangan sesi dibersihkan setelah server mengonfirmasi sesi selesai; navigasi keluar atau sesi login berakhir mempertahankan cadangan.

### Migrasi versi jawaban

Database eksisting membutuhkan dua kolom tambahan. Migrasi ini mempertahankan isi dan hasil jawaban lama, dengan versi awal nol:

```bash
cd backend
npx prisma db execute --file prisma/migrations/20261024140000_answer_versions/migration.sql
npx prisma migrate resolve --applied 20261024140000_answer_versions
npx prisma generate
npm run build
cd ..
npm run build
```

Jalankan SQL hanya jika kolom tersebut belum ada. Jika database sudah dibuat dari schema terbaru melalui `db push`, tidak perlu menambahkan kolom yang sama lagi. Jalur migrasi lengkap dan adopsi database eksisting tersedia pada [panduan operasional](docs/OPERATIONS.md); jangan menjalankan reset/seed untuk pembaruan. Database aplikasi aktif tidak diubah oleh pengujian.

### Pengujian antrean

`npm run test:sync` mengompilasi modul antrean ke `.test-build` yang diabaikan Git, lalu menjalankan skenario koneksi putus, reload, respons hilang/terlambat, perubahan selama sinkronisasi, konflik, batas retry, kegagalan storage, dan finalisasi. Backend diuji dengan perintah PostgreSQL pada bagian sebelumnya, termasuk request bersamaan/tidak berurutan, replay idempoten, manifest finalisasi, serta migrasi yang mempertahankan jawaban lama. Skrip k6 disesuaikan dengan protokol versi dan manifest; pengujian beban 10.000 peserta belum dijalankan.

## Performa query dan dashboard (P1)

Daftar akun, kartu login, sekolah, soal, bacaan, paket, sesi, paket analitik, dan hasil siswa sekarang memakai pagination di server. Respons berbentuk `{ items, total, page, pageSize, totalPages, hasMore, nextCursor }`. Default 50 baris dengan batas 100; kontrol yang tidak valid ditolak. `search`, sekolah, kelas, mata pelajaran, tipe soal, dan status yang relevan diterapkan sebelum `skip/take`, bukan sesudah browser mengunduh seluruh data. Urutan ID stabil mendukung nomor halaman dan cursor `after`. Batas sekolah operator selalu berasal dari akun terautentikasi, dan permintaan sekolah lain ditolak.

Dashboard admin memakai agregasi jumlah pengguna/peran/paket untuk ringkasan. Daftar akun, sekolah, paket, soal, dan hasil siswa memakai halaman server; pemilih sekolah/bacaan memiliki pencarian terbatas 50 pilihan. Guru dapat mencari dan memfilter bank soal tanpa memuat seluruh bank. Operator membaca kartu login per halaman dan membuka peserta per paket di Pantau Ujian. Ringkasan paket tidak dihitung dari siswa yang sedang terlihat: angka selesai, mengerjakan, belum mulai, dan statistik nilai dihitung database untuk seluruh sekolah. Token paket aktif dan password kartu login tetap tersedia sesuai hak akses. Pantauan diperbarui setiap 15 detik saat tab terlihat, atau melalui tombol Perbarui.

Cetak kartu tetap mencakup seluruh siswa sekolah, bukan hanya halaman yang sedang tampil. Cetak dan ekspor CSV meminta cursor berikutnya dalam batch maksimal 100; operasi tersebut tetap menggunakan memori browser untuk hasil akhirnya, karena pengguna memang meminta seluruh kartu/file. Paging cursor menghindari pergeseran offset ketika membaca banyak halaman. Hasil lintas halaman bukan snapshot historis: perubahan data bersamaan tetap dapat memengaruhi ekspor.

Rata-rata, nilai tertinggi/terendah, dan jumlah peserta hasil ujian menggunakan sesi selesai. Jumlah siswa terdaftar dilaporkan terpisah; siswa yang belum ikut tidak lagi dianggap memperoleh nilai nol. Agregasi sekolah dan analisis butir dijalankan PostgreSQL, tanpa memuat seluruh jawaban ke Node.js. Analitik hasil siswa hanya mengambil siswa pada halaman yang diminta, dengan agregasi elemen untuk sesi pada halaman tersebut. Denominator elemen mencakup seluruh soal paket pada elemen itu, termasuk yang tidak dijawab. Rata-rata pembanding pada detail sesi memakai `AVG` database. Detail jawaban individual yang masih berubah tidak di-cache.

Cache Redis memakai revisi tag: hasil fetch lama tidak bisa mengisi generasi cache yang dibaca setelah invalidasi. Key menyertakan scope dan parameter halaman/filter. Cold read yang sama digabung per worker, termasuk saat Redis mati; tidak ada penyimpanan hasil mutable di memori worker tanpa Redis. Perubahan akun/sekolah/bank/paket menginvalidasi tag terkait; mulai/finalisasi/sweep menginvalidasi analitik dan daftar paket hasil setelah transaksi commit. TTL daftar/ringkasan dibuat singkat (15–30 detik). Cache bersifat best effort; invalidasi Redis yang gagal dapat menyisakan hasil ringkasan sampai TTL, tetapi autentikasi, kepemilikan, deadline, jawaban, dan nilai final tetap diperiksa di database.

Konten lengkap ujian di-cache hanya setelah ada sesi committed yang mengunci konten. Sebelum sesi pertama, Redis dilewati sehingga invalidasi yang terlewat saat bank masih diedit tidak dapat menghidupkan materi lama. Respons siswa tetap diproyeksikan tanpa kunci jawaban. Redis menggunakan status ready, antrean offline dinonaktifkan, antrean command dibatasi, dan timeout command 150 ms; kegagalan cache beralih ke PostgreSQL.

### Koneksi database dan worker

PM2 default dua worker. Ubah jumlahnya melalui `WEB_CONCURRENCY` pada environment proses PM2. `APP_WORKERS` diisi otomatis dari jumlah worker, atau dapat ditentukan dari shell untuk mencerminkan total proses pada beberapa host. Jangan menganggap konfigurasi ini mendeteksi host lain secara otomatis. Jika jumlah instance aplikasi yang sudah berjalan berbeda, sesuaikan juga jumlah proses PM2 sebelum memakai anggaran tersebut.

Pool default per proses maksimal 5 koneksi, dengan `DB_CONNECTION_BUDGET=40` untuk semua proses yang dihitung dalam `APP_WORKERS`. Nilai efektif adalah minimum `DB_POOL_MAX` dan `floor(DB_CONNECTION_BUDGET / APP_WORKERS)`; konfigurasi yang mustahil ditolak. Timeout menunggu koneksi default 5 detik, statement 15 detik, query 16 detik, koneksi idle 30 detik. Sisakan koneksi PostgreSQL untuk administrasi dan layanan lain di luar budget aplikasi. Shutdown menghentikan sweep, menunggu HTTP selesai, lalu menutup Prisma, pool, dan Redis; PM2 diberi waktu 20 detik untuk shutdown.

Variabel opsional tersedia di `backend/.env_example`: `DB_POOL_MAX`, `DB_CONNECTION_BUDGET`, `DB_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, dan `DB_QUERY_TIMEOUT_MS`. Nilai default adalah titik awal yang konservatif, bukan jaminan throughput. Pencarian `contains` dapat memerlukan scan; indeks baru terutama menargetkan filter exact, relasi, pengelompokan sesi, dan paging berurutan.

### Migrasi indeks dan verifikasi

Migrasi `backend/prisma/migrations/20261024160000_query_indexes/migration.sql` menambahkan 11 indeks tanpa mengubah akun, password, jawaban, atau nilai. Indeks berada pada kombinasi peran/sekolah/kelas, penulis dan bacaan soal, token/status paket, relasi paket–soal, paket/status sesi, sesi aktif/waktu mulai, dan soal/kebenaran jawaban. Jalankan pembentukan indeks di luar jadwal ujian karena `CREATE INDEX` dapat menahan penulisan selama pembentukan:

```bash
cd backend
npx prisma db execute --file prisma/migrations/20261024160000_query_indexes/migration.sql
npx prisma migrate resolve --applied 20261024160000_query_indexes
npx prisma generate
npm run build
cd ..
npm run build
```

Jika indeks sudah dibuat lewat `db push` memakai schema terbaru, jangan jalankan SQL yang sama lagi. Untuk fresh install dan riwayat migrasi yang belum lengkap, gunakan jalur deployment/adopsi pada [panduan operasional](docs/OPERATIONS.md). Frontend/backend harus diperbarui bersama karena kontrak respons daftar berubah menjadi pagination. Pengujian tidak mengubah database aplikasi aktif.

Suite PostgreSQL menggunakan schema terisolasi dengan 10.050 siswa dan 502.500 jawaban untuk memverifikasi paging, filter sekolah, agregasi, cetak/ekspor yang dapat ditelusuri cursor, migrasi indeks, dan query plan indeks. Unit test menguji batas paging, budget pool, cold miss bersamaan, invalidasi antar-worker, serta kegagalan cache. Jalankan `INTEGRITY_TEST_DATABASE_URL=... npm test --prefix backend`, `npm run test:sync`, dan `npm run build`. Volume fixture ini bukan simulasi 10.000 pengguna bersamaan; stress test dan ukuran server target tetap membutuhkan tahap berikutnya; prosedur backup/restore tersedia pada panduan operasional.

## Deployment dan pemulihan (P1)

Lihat [panduan operasional lengkap](docs/OPERATIONS.md) untuk pemasangan baru, adopsi database eksisting, pembaruan release, backup, restore, dan rollback. `ops/prepare-release.sh` membangun frontend/backend dengan lockfile; `npm run db:deploy --prefix backend` menjalankan migrasi serta pemeriksaan drift. Database yang dibuat melalui `db push` perlu diaudit dengan `db:adopt` sebelum riwayatnya dicatat; perintah audit tanpa `--apply` tidak mengubah riwayat. Migrasi yang sudah diterbitkan tetap utuh dan dilengkapi bridge untuk fresh install. Schema legacy berisi identitas sekolah/login yang belum dipetakan ditolak untuk penanganan khusus.

Lokasi frontend dan unggahan sekarang sama pada source dan backend hasil kompilasi: root `dist` dan `backend/uploads`, dapat diganti melalui `FRONTEND_DIST_DIR`/`UPLOAD_DIR`. Periksa dan pindahkan media versi compiled lama dari `backend/dist/uploads` saat maintenance; tidak ada pemindahan otomatis. Gunakan volume persisten di luar folder release.

`GET /api/health` menunjukkan proses hidup. `GET /api/ready` memeriksa akses tabel/kolom database, merespons 503 ketika tidak siap, dan membatasi waktu respons. PM2 menunggu readiness startup; shutdown memberi waktu bagi HTTP dan sweep sebelum menutup koneksi. `CACHE_NAMESPACE` dapat diganti seragam pada semua worker setelah restore agar cache lama tidak terbaca.

`npm run backup --prefix backend` memerlukan `BACKUP_DIR` absolut di luar repository dan PostgreSQL client. Bundle menyertakan database, media lokal, serta checksum; secret dicadangkan terpisah secara aman. `npm run restore --prefix backend -- /PATH/BUNDLE` memerlukan `RESTORE_DATABASE_URL` khusus dan direktori media kosong, serta menolak database target terisi. Restore diuji menggunakan `pg_dump`/`pg_restore` nyata dengan verifikasi akun, kartu terenkripsi, jawaban, nilai, dan gambar. Objek GCP memerlukan backup terpisah. Cron, penyimpanan di luar host, monitoring eksternal, dan migrasi produksi belum dipasang/dijalankan oleh perubahan kode ini.

## 🚀 Pembaruan Terkini (Changelog)

### 1. Implementasi Master Data Sekolah dengan NPSN
- **Tabel `School` Baru**: Menerapkan sistem *Master Data* untuk mengelola daftar sekolah/instansi secara terpusat.
- **Primary Key `npsn`**: Menggantikan UUID standar dengan **NPSN (Nomor Pokok Sekolah Nasional) 8 Digit** sebagai *Primary Key* di dalam database (*Prisma schema*).
- **Update Relasi Database**: Menyesuaikan tabel `User` agar merujuk ke tabel sekolah menggunakan kolom `schoolNpsn`.
- **UI Menu "Data Sekolah"**: Menambahkan *tab* khusus di dasbor Admin untuk mengelola (CRUD) data sekolah yang menampilkan Nama, Wilayah, dan NPSN.
- **Dropdown Dinamis**: Mengubah *input* teks manual asal sekolah menjadi *dropdown* pilihan (berisi daftar sekolah terdaftar) saat admin membuat atau mengedit akun Operator/Guru.

### 2. Fitur Import Data Sekolah via CSV
- **Panduan Format File CSV**: File CSV yang diunggah harus memiliki format 3 kolom (dipisahkan tanda koma). Baris pertama (*header*) opsional namun sangat disarankan:
  ```csv
  npsn,name,region
  10101234,SDN 01 Pagi Jakarta,Jakarta Pusat
  10101235,SDN 02 Petang Jakarta,Jakarta Selatan
  ```
- **Backend Batch API (`POST /api/schools/batch`)**: Menambahkan rute khusus yang dapat menerima *array of objects* dan memasukkannya ke *database* secara massal. Sudah dilengkapi sistem anti-duplikat (`skipDuplicates`).
- **Frontend CSV Parser**: Menulis fungsi pembaca CSV di browser (`FileReader`) yang secara cerdas mengekstrak kolom `npsn,name,region` (mendukung *file* yang memiliki maupun tidak memiliki *header* baris pertama).
- **Perbaikan UI Tombol**: Menambahkan tombol "Import CSV" bersebelahan dengan "Tambah Sekolah", dan merapikannya menggunakan *Flexbox* (gap, center alignment).
- **Standarisasi CSS**: Memperbaiki `.btn-secondary` di `index.css` agar secara bawaan memiliki *padding*, radius, efek transisi, dan posisi ikon (*flex*) yang konsisten dengan tombol utama (`.btn`).

### 3. Alur Otomatisasi (Workflow) Operator & Siswa
- Backend telah diperbarui untuk menyertakan (*include*) data relasi `school` setiap kali pengguna berhasil login (`/api/login`).
- Saat **Operator Sekolah** login dan menambahkan data peserta didik (Siswa), mereka tidak perlu lagi mengetikkan nama sekolah. Akun Siswa yang baru dibuat akan langsung secara otomatis diikat (*linked*) ke `schoolNpsn` milik Operator tersebut.
- **Import Massal Siswa via CSV**: Operator kini dapat mengunggah file CSV berisikan data siswa secara massal.
  - **Panduan Format CSV**: File harus memiliki 3 kolom (nisn, fullName, className).
    ```csv
    nisn,fullName,className
    1234567890,Budi Santoso,Kelas 6A
    0987654321,Siti Aminah,Kelas 6B
    ```
  - **Pembuatan Akun Otomatis**: Sistem secara otomatis akan memakai NISN sebagai `username`, membuat *password* 6-karakter acak secara otomatis, serta menautkannya dengan NPSN operator saat ini.

### 4. Analisis Butir Soal & Kalkulasi Indeks Kesulitan
- **Tinjauan Kinerja Soal (Item Analysis)**: Dasbor admin menyediakan analitik mendalam pada hasil ujian/paket. Sistem secara otomatis membaca seluruh sesi siswa yang sudah memiliki status `selesai`.
- **Kalkulasi Indeks Kesulitan**: Rasio yang menggambarkan seberapa besar populasi siswa yang mampu menjawab soal tersebut dengan benar.
  - **Rumus Dasar**: `Indeks Kesulitan = Jumlah Menjawab Benar / Total Menjawab` (Atau Total Sesi Ujian)
- **Kategorisasi Otomatis**:
  - **Mudah (Indeks > 0.70)**: Menandakan bahwa > 70% siswa berhasil menjawab pertanyaan dengan benar.
  - **Sulit (Indeks < 0.30)**: Menandakan bahwa < 30% siswa mampu memecahkan atau memahami konsep di soal ini.
  - **Sedang (0.30 ≤ Indeks ≤ 0.70)**: Soal dianggap optimal/rata-rata dan mampu dikerjakan oleh mayoritas yang wajar.
- **Tampilan Antarmuka**: Menampilkan kolom "Soal" (cuplikan baris dengan batasan dua baris maksimal untuk estetika) berpasangan dengan "Level Kognitif" untuk membantu guru mendeteksi miskonsepsi siswa (Misalnya soal sulit berlevel pemahaman dasar/L1 merupakan lampu merah bagi guru).

### 5. Penyempurnaan Dasbor Operator & Admin
- **Input Kelas Dinamis**: Kelas siswa pada Dasbor Operator (baik input manual maupun *import* CSV) tidak lagi menggunakan *dropdown* statis, melainkan input teks dinamis untuk beradaptasi dengan berbagai standar penamaan kelas di tiap sekolah (contoh: "XII MIPA 1", "7A").
- **Pembuatan Akun Operator Otomatis**: Saat Admin mengimpor data sekolah baru (baik massal via CSV atau satuan), sistem kini langsung memproduksi akun Operator untuk tiap sekolah secara *real-time*. *Username* dan *Password* akan disetel sesuai NPSN, dan Nama Lengkap disetel sesuai Nama Sekolah asal.

---

## 🛠️ Tech Stack
- **Frontend**: React, TypeScript, Vite, Vanilla CSS (Tema *Glassmorphism* modern).
- **Backend**: Node.js, Express, Prisma ORM.
- **Database**: PostgreSQL.
