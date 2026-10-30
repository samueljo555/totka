# TKA APP (Aplikasi Ujian & Try Out)

Aplikasi platform ujian dan Try Out berbasis web yang memungkinkan pengaturan Bank Soal, Paket Ujian, manajemen peserta didik, dan penilaian otomatis.

**Uji domain 29 Oktober 2026:** pengujian ulang 100 siswa lulus selama jendela lima menit, tanpa error HTTP. Tahap 250 dihentikan karena 120 respons 403 HTML (4,69%); tahap 10.000 belum tercapai. Lihat [hasil terbaru](docs/LIVE_LOAD_RETEST_20261029.md), [hasil awal](docs/LIVE_LOAD_TEST_RESULTS.md), serta [metode k6 eksternal](docs/LIVE_LOAD_TESTING.md).

**Menjalankan k6 dari GCP:** tersedia [paket mandiri dan panduan VM generator](docs/K6_GCP.md), dengan pilihan domain publik atau target internal serta data dummy privat yang diekspor terpisah dari Git.

**Rilis Tahap 5:** dashboard Guru menggunakan satu editor soal dan tidak memiliki bacaan terpisah. Untuk keputusan memulai database dari kosong, ikuti [panduan penerapan Tahap 5](docs/FRESH_DATABASE_STAGE5.md). Catatan migrasi P0/P1 di bawah merupakan riwayat perubahan; urutan penerapan rilis ini mengikuti panduan tersebut.

**Status frontend:** keenam tahap desain yang disetujui sudah diterapkan, termasuk halaman siswa dan pemeriksaan lintas peran pada Tahap 6. Kebutuhan database Tahap 5 tetap berlaku untuk penerapan rilis gabungan.


## Keamanan API dan konfigurasi JWT

Backend membaca `backend/.env` dari lokasi backend, baik dijalankan melalui source maupun hasil build. Isi `JWT_SECRET` dengan secret acak minimal 32 karakter; gunakan `openssl rand -hex 32` untuk membuatnya. Aplikasi menolak startup jika secret kosong atau terlalu pendek. Jangan gunakan nilai contoh sebagai secret produksi.

Setelah pembaruan keamanan ini diterapkan, semua pengguna perlu login kembali karena JWT sekarang menyertakan pengenal sesi aktif (`sid`). Login pada perangkat lain atau reset password membatalkan token sebelumnya. Backend membaca identitas, peran, sekolah, dan sesi aktif dari database pada setiap request terproteksi; pool koneksi dibatasi per proses dan kapasitas aktual tetap perlu dibuktikan melalui load test.

| Peran | Akses |
| --- | --- |
| Admin / super admin | Mengelola akun, sekolah, paket, seluruh bank soal, dan analitik |
| Guru | Membaca, membuat, dan mengubah soal miliknya; mengunggah gambar |
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

Setelah terdapat sesi ujian, isi paket (termasuk durasi dan daftar soal), serta isi soal tidak dapat diedit atau dihapus melalui API. Buat konten/paket baru untuk revisi. Status paket dan pengaturan rilis nilai tetap dapat diubah. Menutup status paket mencegah peserta baru; peserta yang sudah memulai tetap dapat melanjutkan sampai deadline semula. Advisory lock bersama pada mulai ujian dan eksklusif pada perubahan konten mencegah benturan saat peserta pertama masuk. Lihat [mekanisme locking PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).

Backend menjalankan sweep sesi kedaluwarsa saat startup dan setiap 15 detik. Setiap batch memproses maksimal 100 sesi, lalu menjadwalkan batch berikutnya jika penuh; row lock menjaga konsistensi ketika beberapa worker menjalankannya bersamaan. Sesi yang ditinggalkan browser tetap diselesaikan. Waktu selesai dibatasi pada deadline, meski sweep berjalan lebih lambat. Ini tidak memerlukan perubahan schema database.

### Pengujian integritas dengan PostgreSQL

`npm test --prefix backend` menjalankan pengujian keamanan dan validasi jawaban. Suite transaksi PostgreSQL hanya berjalan jika `INTEGRITY_TEST_DATABASE_URL` diberikan secara eksplisit; tidak pernah mengambil `DATABASE_URL` aplikasi sebagai fallback. Gunakan database pengujian terpisah:

```bash
cd backend
INTEGRITY_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/TEST_DB' npm test
```

Suite membuat schema acak dari schema Prisma terbaru, menjalankan transaksi menggunakan dua client/pool PostgreSQL, lalu menghapus schema buatannya. Pengguna database uji harus boleh membuat schema. Pengujian mencakup mulai serentak, jawaban lintas paket, payload salah, deadline setelah menunggu lock, finalisasi bersamaan, rollback, sweep multi-worker, dan perubahan konten saat peserta pertama masuk. Pengujian ini tidak membuktikan kapasitas 10.000 peserta. Optimasi query/cache dijelaskan pada bagian P1 di bawah. Deployment dan pemulihan dijelaskan pada [panduan operasional](docs/OPERATIONS.md). Hasil uji beban awal tersedia pada [laporan P2](docs/LOAD_TEST_RESULTS.md); kapasitas 10.000 peserta bersamaan belum terbukti.

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

Daftar hasil siswa menyediakan pencarian nama/NISN/username/kelas, filter sekolah (termasuk tanpa sekolah), kelas, status, serta pengurutan nama A–Z/Z–A atau nilai tertinggi/terendah. Tombol **Lihat Semua Siswa** membuka daftar lintas sekolah; pencarian nama/NPSN juga tersedia pada tabel distribusi sekolah. Filter daftar diterapkan PostgreSQL sebelum pagination dan tidak mengubah ringkasan seluruh paket. Pergantian filter/urutan kembali ke halaman pertama; pergantian sekolah mengosongkan pilihan kelas. Nilai belum final atau tidak tersedia selalu berada setelah nilai akhir dalam urutan nilai, sehingga nilai nol tetap diperlakukan sebagai hasil sah.

CSV pada daftar siswa mengambil seluruh halaman sesuai filter dan urutan aktif. Tombol CSV pada daftar paket tetap mengekspor seluruh siswa paket, karena pada tampilan tersebut belum ada filter siswa yang dipilih. Ekspor memakai cursor yang terikat pada paket, sekolah, pencarian, kelas, status, dan urutan; ID siswa menjadi pembeda ketika nama/nilai sama. API menerima `status=selesai|sedang_mengerjakan|belum_mulai|lainnya`, `sort=name_asc|name_desc|score_asc|score_desc|id` (default API `id`), `search`, `className`, dan `schoolNpsn` (`UNKNOWN` untuk siswa tanpa sekolah). Cursor tidak boleh dipakai ulang untuk filter/urutan berbeda. Ekspor beberapa request bukan snapshot historis; jika penanda halaman keluar dari hasil filter, server mengembalikan 409 agar ekspor diulang, bukan mengunduh hasil yang terpotong. Update frontend dan backend bersama; tidak ada perubahan schema database.

Ringkasan Analitik Hasil membedakan **Total Akun Siswa**, **Sudah Mulai**, **Sedang Mengerjakan**, **Selesai**, dan **Belum Mulai**, baik secara keseluruhan maupun per sekolah. Total akun berasal dari seluruh akun berperan siswa di sistem, bukan daftar peserta khusus paket. Sudah mulai mencakup siswa yang memiliki sesi paket; status lama di luar sedang/selesai ditampilkan terpisah sebagai **Status Lain** jika ada. Jumlah akun = sudah mulai + belum mulai; sudah mulai = sedang + selesai + status lain. Statistik nilai tetap memakai peserta selesai; sekolah tanpa peserta selesai menampilkan “Belum tersedia”. Label siswa tanpa sesi menjadi “Belum Mulai”. Pembaruan frontend/backend dilakukan bersama tanpa migrasi database.

Kolom level kognitif dan nilai C3 statis dihapus dari analisis butir karena metadata level belum tersedia pada bank soal. Laporan detail individual di menu Analitik Hasil juga dihapus; daftar nilai, CSV, dan analisis butir tetap tersedia.

Analisis butir memakai seluruh sesi selesai pada paket sebagai pembagi persentase benar. Tabel menampilkan benar, salah, dan kosong; ketiganya berjumlah sama dengan peserta selesai. Jawaban yang tidak pernah disimpan, JSON null, array kosong, dan kategori yang seluruh isiannya kosong dihitung sebagai kosong. Kategori yang terisi sebagian tetap termasuk jawaban terisi dan mengikuti flag benar/salah final dari server. Contoh: 2 benar dan 8 kosong dari 10 peserta selesai menghasilkan indeks 0,20 (20%). Bila belum ada peserta selesai, indeks bernilai null dan UI menampilkan “Belum ada data”. Agregasi populasi dan jawaban menggunakan satu statement PostgreSQL agar konsisten saat ada finalisasi bersamaan; jawaban/nilai tersimpan tidak dihitung ulang. Frontend dan backend perlu diperbarui bersama, tanpa migrasi database.

### Koneksi database dan worker

PM2 default dua worker. Ubah jumlahnya melalui `WEB_CONCURRENCY` pada environment proses PM2. `APP_WORKERS` diisi otomatis dari jumlah worker, atau dapat ditentukan dari shell untuk mencerminkan total proses pada beberapa host. Jangan menganggap konfigurasi ini mendeteksi host lain secara otomatis. Jika jumlah instance aplikasi yang sudah berjalan berbeda, sesuaikan juga jumlah proses PM2 sebelum memakai anggaran tersebut.

Pool default per proses maksimal 5 koneksi, dengan `DB_CONNECTION_BUDGET=40` untuk semua proses yang dihitung dalam `APP_WORKERS`. Nilai efektif adalah minimum `DB_POOL_MAX` dan `floor(DB_CONNECTION_BUDGET / APP_WORKERS)`; konfigurasi yang mustahil ditolak. Timeout menunggu koneksi default 5 detik, statement 15 detik, query 16 detik, koneksi idle 30 detik. Sisakan koneksi PostgreSQL untuk administrasi dan layanan lain di luar budget aplikasi. Shutdown menghentikan sweep, menunggu HTTP selesai, lalu menutup Prisma, pool, dan Redis; PM2 diberi waktu 20 detik untuk shutdown.

Variabel opsional tersedia di `backend/.env_example`: `DB_POOL_MAX`, `DB_CONNECTION_BUDGET`, `DB_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, dan `DB_QUERY_TIMEOUT_MS`. Nilai default adalah titik awal yang konservatif, bukan jaminan throughput. Pencarian `contains` dapat memerlukan scan; indeks baru terutama menargetkan filter exact, relasi, pengelompokan sesi, dan paging berurutan.

Jika startup gagal dengan `08P01: unsupported startup parameter: statement_timeout` melalui PgBouncer/pooler, tambahkan `DB_SERVER_TIMEOUTS=false` pada `backend/.env`, rebuild backend, lalu reload PM2. Default `true` mempertahankan perilaku koneksi PostgreSQL langsung. Mode `false` tidak mengirim `statement_timeout` maupun `idle_in_transaction_session_timeout` saat membuka koneksi; timeout koneksi, batas pool, dan `DB_QUERY_TIMEOUT_MS` tetap aktif. Parameter URL `pgbouncer=true` tidak mengubah pengiriman parameter startup oleh driver `pg`. Atur batas eksekusi SQL dan transaksi idle pada role/database PostgreSQL melalui administrator; timeout query di client saja tidak menjamin query berhenti di server. Lihat [panduan pooler](docs/OPERATIONS.md#koneksi-melalui-pgbouncerpooler). Tidak ada migrasi/reset database untuk perubahan ini.

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

Suite PostgreSQL menggunakan schema terisolasi dengan 10.050 siswa dan 502.500 jawaban untuk memverifikasi paging, filter sekolah, agregasi, cetak/ekspor yang dapat ditelusuri cursor, migrasi indeks, dan query plan indeks. Unit test menguji batas paging, budget pool, cold miss bersamaan, invalidasi antar-worker, serta kegagalan cache. Jalankan `INTEGRITY_TEST_DATABASE_URL=... npm test --prefix backend`, `npm run test:sync`, dan `npm run build`. Volume fixture ini bukan simulasi 10.000 pengguna bersamaan; uji beban awal tersedia pada bagian P2 di bawah, sedangkan ukuran server target dan kapasitas produksi masih perlu diverifikasi; prosedur backup/restore tersedia pada panduan operasional.

## Deployment dan pemulihan (P1)

Lihat [panduan operasional lengkap](docs/OPERATIONS.md) untuk pemasangan baru, adopsi database eksisting, pembaruan release, backup, restore, dan rollback. `ops/prepare-release.sh` membangun frontend/backend dengan lockfile; `npm run db:deploy --prefix backend` menjalankan migrasi serta pemeriksaan drift. Database yang dibuat melalui `db push` perlu diaudit dengan `db:adopt` sebelum riwayatnya dicatat; perintah audit tanpa `--apply` tidak mengubah riwayat. Migrasi yang sudah diterbitkan tetap utuh dan dilengkapi bridge untuk fresh install. Schema legacy berisi identitas sekolah/login yang belum dipetakan ditolak untuk penanganan khusus.

Lokasi frontend dan unggahan sekarang sama pada source dan backend hasil kompilasi: root `dist` dan `backend/uploads`, dapat diganti melalui `FRONTEND_DIST_DIR`/`UPLOAD_DIR`. Periksa dan pindahkan media versi compiled lama dari `backend/dist/uploads` saat maintenance; tidak ada pemindahan otomatis. Gunakan volume persisten di luar folder release.

`GET /api/health` menunjukkan proses hidup. `GET /api/ready` memeriksa akses tabel/kolom database, merespons 503 ketika tidak siap, dan membatasi waktu respons. PM2 menunggu readiness startup; shutdown memberi waktu bagi HTTP dan sweep sebelum menutup koneksi. `CACHE_NAMESPACE` dapat diganti seragam pada semua worker setelah restore agar cache lama tidak terbaca.

`npm run backup --prefix backend` memerlukan `BACKUP_DIR` absolut di luar repository dan PostgreSQL client. Bundle menyertakan database, media lokal, serta checksum; secret dicadangkan terpisah secara aman. `npm run restore --prefix backend -- /PATH/BUNDLE` memerlukan `RESTORE_DATABASE_URL` khusus dan direktori media kosong, serta menolak database target terisi. Restore diuji menggunakan `pg_dump`/`pg_restore` nyata dengan verifikasi akun, kartu terenkripsi, jawaban, nilai, dan gambar. Objek GCP memerlukan backup terpisah. Cron, penyimpanan di luar host, monitoring eksternal, dan migrasi produksi belum dipasang/dijalankan oleh perubahan kode ini.

## Uji beban awal (P2)

[Metode dan cara menjalankan](docs/LOAD_TESTING.md) serta [hasil baseline](docs/LOAD_TEST_RESULTS.md) tersedia untuk pengujian HTTP nyata dengan k6 dan database terpisah. Harness `npm run test:load --prefix backend` memerlukan `LOAD_TEST_DATABASE_URL` eksplisit, membuat database acak berisi 10.050 siswa/502.500 jawaban historis, lalu membersihkannya. Generator lama yang menulis ke `DATABASE_URL` dinonaktifkan. Akun unik, satu alur per peserta, paket baru per tahap, receipt versi, replay idempoten, resume, manifest finalisasi, dan audit nilai mencegah hasil ringan palsu akibat sesi yang sudah selesai dipakai ulang.

Pada baseline lokal 4 CPU logis/RAM 3,37 GiB, dua worker tanpa Redis, alur lengkap 50 peserta lolos batas sementara. Alur tanpa login 100 peserta lolos pada baseline, tetapi run kedua dengan worker baru gagal batas mulai. Login 100 peserta dan mulai ujian 250 peserta juga melewati batas respons walaupun tidak ada error HTTP atau kerusakan jawaban/nilai. Pengujian pembaruan berulang dan finalisasi pada detik ke-120 tetap menjaga isi/versi jawaban dan nilai. **Ini belum membuktikan kapasitas 10.000 peserta bersamaan.** Pengujian produksi memerlukan spesifikasi target, generator terpisah, profiling, dan pengujian durasi representatif. Proses shutdown cluster juga diperbaiki agar kanal IPC ditutup setelah HTTP/pool selesai.

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

### Ketahanan tampilan dan ekspor analitik

Ringkasan paket dan analisis butir menampilkan kegagalan dengan tombol **Coba Lagi**. Permintaan dibatalkan ketika konteks berubah; respons lama tidak dapat mengganti paket yang sedang dibuka. Data kosong ditampilkan terpisah dari keadaan memuat atau gagal.

Ekspor CSV menampilkan jumlah siswa yang telah dimuat dan mengunci tombol unduh selama proses. File dibuat setelah seluruh halaman berhasil; kegagalan satu halaman membatalkan unduhan. Ekspor menggunakan filter/urutan saat tombol ditekan. Koma, tanda kutip, dan baris baru di setiap kolom di-escape; nilai nol dan nilai belum tersedia tetap dibedakan. CSV menyimpan NISN berawalan nol secara utuh, tetapi aplikasi spreadsheet dapat menebak kolom sebagai angka: pilih tipe **Text** saat impor untuk mempertahankannya.

Verifikasi: `npm run test:analytics` untuk serializer. Setelah `npm run build`, jalankan `node tests/analytics-browser.mjs` dengan Playwright/Chromium tersedia; jika dipasang di luar proyek, set `PLAYWRIGHT_MODULE` ke path absolut modul Playwright. Uji browser menggunakan API tiruan dan tidak mengubah database.

### Desain tabel dan laporan lintas paket

Tabel admin, operator, dan guru memakai gaya yang sama: header melekat saat digulir, label status, angka rata kanan, mode ringkas, pilihan 5–100 baris, pencarian, pengurutan nama/judul, pagination bernomor, serta scroll horizontal di layar kecil. Aksi pengelolaan dan cetak kartu login tetap tersedia. Ekspor tabel mengambil seluruh halaman sesuai pencarian/filter/urutan; CSV identitas siswa tidak memuat password.

Analitik memiliki tab **Hasil siswa**, **Analisis butir soal**, dan **Hasil per sekolah**. Filter **Semua Paket** atau paket tertentu tersedia di ketiganya dan pada **Riwayat Ujian** operator. Nama paket dicantumkan pada setiap baris dan CSV. Hasil siswa/sekolah dihitung per pasangan dengan paket, bukan digabung lintas paket; jumlah entri bukan jumlah siswa unik. Akun yang belum mempunyai sesi tetap muncul sebagai *Belum Mulai*, termasuk pada paket draft, karena sistem belum memiliki daftar penugasan peserta. Ringkasan kartu pada paket terpilih mencakup seluruh sekolah; filter sekolah, kelas, dan pencarian berlaku untuk tabel/CSV. Indeks soal menggunakan peserta selesai pada paket yang sama.

Riwayat operator menampilkan sesi **selesai** milik sekolahnya, termasuk ketika paket masih aktif. Paket aktif dan tokennya tetap tersedia pada **Pantau Ujian**, yang diperbarui setiap 15 detik ketika halaman terlihat. Operator tanpa sekolah ditolak saat meminta data siswa/monitoring.

API baru (pagination maksimal 100 baris):

- `GET /api/analytics/reports/students`: admin; `packageId`, `schoolNpsn` (termasuk `UNKNOWN`), `search`, `className`, `status`, `sort`.
- `GET /api/analytics/reports/schools`: admin; `packageId`, `schoolNpsn`, `search`, `sort`.
- `GET /api/analytics/reports/items`: admin; `packageId`, `search`, `category`, `sort`.
- `GET /api/monitoring/history`: operator/admin; filter hasil siswa yang sama, hanya sesi selesai; operator selalu dibatasi sekolah akun.

Kosongkan `packageId` untuk seluruh paket. Urutan laporan: `name_asc`, `name_desc`, `score_asc`, `score_desc`; nilai belum tersedia selalu di akhir. Endpoint daftar akun, sekolah, paket, soal, kartu login, dan pantau ujian juga menerima `sort=name_asc|name_desc`; default API lama tetap urutan ID. Cursor ekspor terkait filter/urutan dan ditolak jika konteks berubah. Ekspor lintas permintaan bukan snapshot historis: perubahan data selama proses dapat menggeser urutan; penanda yang hilang menghasilkan 409 dan ekspor harus diulang.

Tidak ada perubahan skema atau migrasi database. Perbarui frontend dan backend bersama. Untuk uji browser dengan PostgreSQL terisolasi: build frontend/backend, lalu jalankan `node tests/tables-real-browser.mjs` dengan `INTEGRITY_TEST_DATABASE_URL` mengarah ke instance uji dan `PLAYWRIGHT_MODULE` jika Playwright dipasang di luar proyek. Uji ini membuat dan menghapus schema sendiri. `tests/analytics-browser.mjs` menguji kegagalan jaringan, respons terlambat, dan kegagalan di tengah ekspor menggunakan API tiruan.

### Ruang ujian siswa

Halaman pengerjaan mengikuti pratinjau yang disetujui: timer melekat di atas, progres jawaban, pilihan yang mudah ditekan, ukuran teks 15–22 px, dan navigasi nomor soal. Identitas dari akun login (nama, NISN, kelas, sekolah) tampil pada panel kanan; pada ponsel tersedia melalui tombol **Daftar soal**. Nama paket dan mata pelajaran berasal dari respons mulai ujian. Rumus, bacaan Markdown, gambar yang dapat diperbesar, dan ketiga tipe soal tetap tersedia.

**Tandai untuk ditinjau** adalah catatan lokal per sesi di `sessionStorage`, terpisah dari jawaban dan nilai. Penanda bertahan setelah refresh pada tab/sesi yang sama dan dibersihkan setelah sesi selesai; penanda tidak disinkronkan ke perangkat lain. Bila penyimpanannya gagal, halaman memberi pesan tanpa mengganggu antrean jawaban. Ringkasan sebelum selesai menunjukkan soal terjawab, kosong, ditandai, dan pernyataan kategori yang belum lengkap. Hitungan *terjawab* tetap mengikuti perilaku sebelumnya: sebuah soal kategori dihitung ketika setidaknya satu pernyataan dipilih, sementara ringkasan mengingatkan jika masih ada bagian yang kosong.

Status terkirim hanya muncul setelah konfirmasi `AnswerSync`. Pengiriman offline, konflik versi, peringatan penyimpanan, dan pilihan penyelesaian konflik tetap memakai mesin yang sama. Penyelesaian manual menunggu semua jawaban dikonfirmasi dan koneksi tersedia. Batas waktu monotonik serta penyelesaian otomatis tetap mengikuti server; dialog ringkasan tidak menghentikan timer. Tampilan tidak menyertakan soal atau kontrol simulasi dari file pratinjau.

Tidak ada perubahan API atau migrasi database untuk pembaruan ini. Verifikasi: `npm run build`, `npm run test:sync`, dan setelah build jalankan `node tests/student-exam-browser.mjs` dengan Playwright/Chromium tersedia. `PLAYWRIGHT_MODULE` dapat menunjuk modul di luar proyek; `PLAYWRIGHT_EXECUTABLE_PATH` dapat menunjuk binary Chromium yang tersedia. Uji browser menjalankan UI dan `AnswerSync` asli dengan respons API terkontrol, termasuk offline/refresh, konflik, expiry, nilai ditunda, serta pencabutan sesi saat dialog terbuka; tidak mengubah database.

Profil login menyertakan NISN, kelas, dan NPSN. Respons `POST /api/sessions/start` juga menyertakan `student` dari profil aman akun yang terautentikasi (tanpa hash password, key kartu, atau token aktif). Halaman ujian memakai profil terbaru ini sehingga data login lama di browser dan perubahan identitas setelah login tidak menyebabkan NISN/kelas hilang. Pembaruan perbaikan ini memerlukan build/deploy frontend dan backend bersama; tidak memerlukan migrasi atau pendaftaran ulang siswa.

### Editor soal visual dan pilihan bergambar

Bank Soal guru menggunakan editor WYSIWYG Tiptap. Bacaan, puisi, gambar, dan pertanyaan dapat ditulis dalam **Isi soal** yang sama. **Enter** membuat paragraf/bait, sedangkan **Shift+Enter** membuat baris baru dalam paragraf/bait. Tersedia format Paragraf/Puisi/Bebas, jarak baris, inden, judul, tebal/miring/garis bawah, perataan, daftar, tabel, dan rumus LaTeX.

Rumus juga dapat diketik langsung, misalnya `\frac{a}{b}` atau `\sqrt{x}`, lalu tekan **Spasi/Enter** untuk mengubahnya menjadi tampilan matematika. Sintaks yang belum lengkap/tidak valid tetap berupa teks. Enter tetap membuat paragraf baru; Ctrl+Z membatalkan konversi, dan rumus dapat diklik untuk mengedit LaTeX-nya. Tombol **Sisipkan rumus** tetap tersedia untuk rumus yang lebih panjang atau satu baris tersendiri. Konversi otomatis berlaku pada isi soal dan pilihan jawaban, di luar blok/kutipan kode.

Dropdown **Ukuran font** mendukung **14, 16, 18, 20, 22, dan 24 px**. Blok sebagian teks untuk mengubah bagian tersebut, atau tekan Ctrl+A saat fokus di editor untuk seluruh teks. Tanpa seleksi, ukuran berlaku pada ketikan berikutnya. Pilih **Ukuran otomatis** untuk menghapus ukuran khusus dari seleksi. Ukuran tersimpan bersama konten dan dipakai pada pratinjau/ujian; tombol A−/A+ siswa tetap memperkecil/memperbesar teks secara proporsional dari ukuran yang ditetapkan guru. Perubahan ini memerlukan frontend dan backend diperbarui bersama, tanpa migrasi skema database.

Untuk menempatkan gambar di antara tulisan, klik posisi yang diinginkan lalu pilih **Sisipkan gambar**. Unggahan, tempel gambar, dan seret file mendukung PNG/JPEG/WebP maksimal **5 MB per gambar**. Klik gambar dalam editor untuk mengubah keterangan, posisi kiri/tengah/kanan, atau lebar 25/50/75/100%. Gambar merupakan blok mengikuti urutan dokumen; susun ulang dengan seret atau potong/tempel. Ini mempertahankan urutan paragraf/gambar sambil menyesuaikan pembungkusan teks dengan ukuran layar siswa.

Setiap pilihan jawaban/pernyataan memiliki editor sendiri: dapat berisi teks, rumus, gambar saja, atau gabungannya. Kunci tetap dipilih melalui kontrol terpisah dan penilaian tetap menggunakan indeks pilihan. Pratinjau langsung, pratinjau lengkap, serta ujian siswa menggunakan renderer yang sama. Pada ujian, siswa dapat memperbesar gambar tanpa memilih jawaban secara tidak sengaja.

Mulai Tahap 5, bacaan ditulis langsung pada isi soal. Menu, API, relasi, dan model bacaan terpisah dihapus; tidak ada penggabungan atau migrasi konten soal lama. Penguncian konten yang sudah memiliki sesi ujian tetap berlaku.

Konten baru disimpan sebagai dokumen terstruktur berversi di kolom teks yang sudah ada, dengan validasi jenis node, URL gambar, kedalaman, dan ukuran di backend. HTML mentah tidak disimpan/dirender sebagai HTML. Teks pencarian, urutan soal, dan CSV memakai isi yang terbaca, bukan metadata editor. Unggahan memeriksa tipe dan signature raster; media lokal/GCP mengikuti konfigurasi yang sudah ada. Editor dimuat hanya ketika form soal dibuka.

Perbarui **frontend dan backend bersama**; tidak ada migrasi database. Jalankan `npm ci && npm run build` di root dan `npm ci && npm run build` di `backend` sesuai prosedur deployment. Verifikasi tambahan: `node --test backend/tests/rich-content.test.mjs backend/tests/security.test.mjs`; uji PostgreSQL menggunakan `INTEGRITY_TEST_DATABASE_URL` pada `backend/tests/report-pages-postgres.test.mjs` (schema uji terisolasi). Setelah build, `node tests/wysiwyg-browser.mjs` menguji pembuatan soal bergambar, opsi gambar saja, rumus, posisi/ukuran gambar, penyimpanan ulang, kompatibilitas soal lama, dan pengerjaan siswa. Variabel Playwright sama dengan uji ruang ujian di atas.

### Rekonstruksi frontend — tahap 1

Dashboard Super Admin, Operator, Guru, dan halaman siswa sebelum masuk ujian memakai `WorkspaceShell` bersama: identitas TOTKA, sidebar, judul/breadcrumb, profil akun, footer, serta fondasi tombol, field, dan panel putih–biru mengikuti pratinjau frontend yang disetujui. Identitas berasal dari akun login, tanpa menambahkan permintaan API. Isi modul dan handler pencarian/navigasi yang sudah ada dipertahankan. Ruang ujian aktif tetap memakai workspace ujian khusus.

Pada lebar maksimal 850 px, sidebar tersedia lewat **Buka menu**. Drawer menggunakan dialog modal, mendukung Tab/Shift+Tab, Escape, klik area luar, serta mengembalikan fokus setelah ditutup. Pemilihan menu memindahkan fokus ke judul halaman. Perubahan ke layar desktop menutup drawer dan memulihkan scroll. Tersedia tautan keyboard **Lewati ke konten utama**.

Tahap berikutnya memerlukan persetujuan terpisah: beranda/login; modul Super Admin; modul Operator; modul Guru; halaman siswa dan pemeriksaan menyeluruh. Tahap 1 hanya memerlukan build/deploy frontend, tanpa migrasi atau perubahan backend. Verifikasi: `npm run build`, `npm run lint`, dan `node tests/workspace-browser.mjs` (variabel Playwright sama dengan pengujian ruang ujian). Uji browser mencakup semua peran, navigasi, pencarian, drawer/fokus/resize, logout, dan luapan layar kecil menggunakan API terkontrol.

### Rekonstruksi frontend — tahap 2

Beranda dan halaman login mengikuti pratinjau yang disetujui, menggunakan brand/token desain bersama dan stylesheet publik yang terpisah dari ruang ujian. Beranda menyediakan akses Siswa, Operator Sekolah, Guru Penulis, serta Super Admin. Halaman login memiliki pilihan peran, label username/NISN, tombol tampilkan/sembunyikan password, dukungan pengelola password browser, status proses, dan pesan kesalahan berbahasa Indonesia. Siswa tetap login dengan akun terlebih dahulu, lalu memasukkan token pada workspace siswa.

Login tetap mengirim `{ username, password }` ke `POST /api/login`; NISN berawalan nol dan password tidak diubah. Tujuan dashboard selalu mengikuti peran akun pada respons server, termasuk alias `admin`/`super_admin`, bukan pilihan peran pada formulir. JWT dan profil menggunakan penyimpanan sesi aplikasi yang sudah ada. UI mengunci pengiriman ganda, membatalkan permintaan ketika halaman ditinggalkan, serta menampilkan pesan ketika permintaan melewati 15 detik. Tidak ada aturan password atau autentikasi backend yang diubah.

Tahap 2 memerlukan build/deploy frontend saja, tanpa migrasi database. Setelah `npm run build`, jalankan `node tests/access-browser.mjs` dengan variabel Playwright seperti pengujian workspace. Uji menggunakan respons API terkontrol untuk navigasi empat peran, ukuran layar 320–1440 px, required field, toggle password, kesalahan jaringan/server/kredensial, respons tidak valid, batas waktu, pembatalan, pengiriman ganda, dan pengalihan akun. Pengelolaan modul Super Admin adalah tahap berikutnya dan memerlukan persetujuan pengguna.

### Rekonstruksi frontend — tahap 3

Modul Super Admin mengikuti desain yang disetujui: ringkasan empat statistik dari API, akses cepat, ringkasan paket, tabel akun/sekolah/paket, dialog formulir akun/sekolah, dialog impor CSV, serta formulir paket dengan ringkasan pilihan. Ringkasan yang belum tersedia ditampilkan sebagai `—`, bukan angka nol; kegagalan dapat dicoba ulang. Peran `admin` ditampilkan sebagai Admin dan tabel akun menggunakan sekolah/username yang tersedia, tanpa mengasumsikan status aktif akun yang tidak disediakan API.

Formulir menahan isian saat server menolak penyimpanan. Password kartu siswa tetap dimuat dan dapat diperlihatkan saat admin mengedit siswa, sesuai perilaku sebelumnya. Impor sekolah tetap menggunakan CSV sederhana `npsn,name,region`, dengan pratinjau lima baris, jumlah baris valid, dan pemberitahuan baris tidak lengkap. Jangan gunakan koma di dalam nilai kolom pada format impor ini. NPSN dan NISN tetap berupa teks agar nol di depan tidak hilang.

Paket menyediakan token, durasi, navigasi, rilis nilai, serta soal dari mata pelajaran terpilih. Pencarian soal di formulir kini terhubung ke API dan terpisah dari pencarian daftar paket; pilihan bertahan ketika berpindah halaman/pencarian dan dikosongkan ketika mata pelajaran berubah. Paket baru disimpan sebagai draft. Mengedit paket tidak mengubah status aktifnya; buka/tutup ujian dilakukan melalui aksi terpisah yang dikonfirmasi dan diperiksa hasil responsnya. Penolakan penguncian konten dari backend ditampilkan tanpa membuang isian.

Analitik tetap menggunakan komponen/API dan perhitungan yang sama; perubahan tahap ini pada tab, panel, filter, dan tampilan tabel di workspace admin. Pengaturan ujian mengarahkan pengguna ke konfigurasi paket yang sudah tersedia. Ekspor CSV akun tidak menyertakan password dan ekspor daftar paket tetap tidak menyertakan token.

Tahap 3 hanya memerlukan build/deploy frontend, tanpa perubahan backend/migrasi. Setelah build, jalankan `node tests/admin-browser.mjs`, `node tests/workspace-browser.mjs`, dan `node tests/analytics-browser.mjs` dengan Playwright tersedia, serta `npm run test:analytics`. `tests/tables-real-browser.mjs` menguji API dengan schema PostgreSQL terisolasi menggunakan `INTEGRITY_TEST_DATABASE_URL` khusus uji. Tahap selanjutnya adalah dashboard Operator dan memerlukan persetujuan pengguna.

### Rekonstruksi frontend — tahap 4

Dashboard Operator mengikuti tampilan yang disetujui: identitas sekolah, tabel siswa beserta username/NISN/kelas/password kartu, dialog pendaftaran dan impor CSV, daftar paket aktif dengan token, ringkasan peserta per paket, serta riwayat hasil. Endpoint dan pembatasan sekolah tetap mengikuti akun yang terautentikasi; tidak ada perubahan backend, aturan password, atau hak akses.

Pendaftaran tetap mengirim NISN sebagai teks dan kelas bebas. Password 6 karakter dibuat server dan tersedia kembali pada kartu login. Impor tetap menggunakan CSV sederhana `nisn,fullName,className`, dengan pratinjau lima baris, jumlah baris tidak lengkap, dan jumlah siswa baru dari respons server. Jangan gunakan koma di dalam nilai kolom. Kegagalan simpan/impor mempertahankan isian. Atur ulang password tetap memerlukan konfirmasi dan tidak pernah dijalankan otomatis ketika mencetak.

**Cetak Kartu Login** memuat seluruh siswa sekolah, sesuai perilaku sebelumnya; tombol cetak pada baris memuat satu siswa. Semua halaman harus berhasil dimuat dan mempunyai password kartu sebelum dokumen cetak dibuat. Kegagalan menutup jendela penyiapan, dan perpindahan menu/logout membatalkan penyiapan yang belum selesai. Kartu memakai username akun sebenarnya, NISN terpisah, kelas, sekolah, dan password terbaru dari server, dengan escaping teks. Dokumen cetak putih–biru menggunakan dua kolom A4 dan tidak menyertakan JWT/hash password. Filter tabel tetap berlaku pada CSV identitas yang tidak memuat password.

Pantau ujian memperbarui data setiap 15 detik ketika tab terlihat, dengan pengiriman pembaruan yang tidak bertumpuk. Token tampil pada daftar dan paket terpilih. Paket yang tidak ditemukan lagi pada halaman daftar aktif terbaru ditandai untuk diperiksa, dengan token/ringkasan tidak ditampilkan sebagai data terverifikasi. Ringkasan menghitung seluruh siswa sekolah per paket; pencarian, kelas, dan status hanya memfilter tabel peserta. Skor akhir ditampilkan hanya pada sesi selesai, termasuk skor nol. Riwayat tetap memakai komponen/API laporan yang sama, termasuk Semua Paket dan CSV.

Tahap 4 memerlukan build/deploy frontend saja, tanpa migrasi. Setelah build, `node tests/operator-browser.mjs` memeriksa alur operator dengan API terkontrol, termasuk kredensial terbaru, cetak lebih dari 100 kartu, kegagalan di tengah pemuatan, pembatalan, polling, serta tampilan ponsel. Variabel Playwright sama dengan uji sebelumnya. Regresi: `node tests/workspace-browser.mjs`, `node tests/analytics-browser.mjs`, `npm run test:analytics`, serta `tests/tables-real-browser.mjs` dengan PostgreSQL terisolasi. Tahap selanjutnya adalah dashboard Guru dan memerlukan persetujuan pengguna.

### Rekonstruksi frontend — tahap 5

Dashboard Guru kini hanya memiliki **Bank Soal**, dengan pencarian, filter mata pelajaran/tipe, pengurutan, pagination, CSV, tambah/edit/hapus, serta pratinjau yang sama dengan siswa. Editor menggabungkan cerita, puisi, pertanyaan, tabel, rumus, dan gambar, termasuk pilihan jawaban bergambar, ukuran font, serta konversi LaTeX otomatis. Kegagalan simpan tetap mempertahankan isi; kontrol dikunci selama penyimpanan.

Menu dan CRUD bacaan terpisah, relasi `Question.readingId`, model `ReadingText`, dan tombol penggabungan bacaan dihapus. API menolak payload bacaan terpisah; respons ujian tidak menyertakan relasi tersebut. Histori migrasi yang sudah diterbitkan tetap utuh, dengan migrasi baru `20261029090000_unify_question_content`. Migrasi baru menolak bacaan terpisah yang masih berisi data, sesuai keputusan pengguna memulai dari database kosong; tidak ada penggabungan soal lama.

**Tahap ini memerlukan build frontend dan backend, Prisma Client baru, serta migrasi/reset yang direncanakan pengelola server.** Ikuti [urutan penerapan database kosong](docs/FRESH_DATABASE_STAGE5.md). Pembuatan Super Admin dilakukan kembali setelah reset. Jika Redis dipakai, gunakan namespace baru untuk memisahkan cache instalasi lama. `db:adopt` hanya menerima schema lengkap model terbaru.

Verifikasi mencakup build, pengujian HTTP keamanan, PostgreSQL integritas ujian/laporan, fresh deploy tanpa drift, penolakan migrasi pada bacaan terisi, backup/restore nyata, dan browser editor/siswa. Jalankan `tests/wysiwyg-browser.mjs`, `tests/student-exam-browser.mjs`, `tests/workspace-browser.mjs`, dan `tests/tables-real-browser.mjs` dengan variabel Playwright/database uji seperti tahap sebelumnya. Tahap 6 (halaman siswa dan pemeriksaan menyeluruh) tetap memerlukan persetujuan pengguna.

### Rekonstruksi frontend — tahap 6

Halaman siswa mengikuti desain yang disetujui: identitas dari profil login, menu Profil Siswa yang hanya dibaca, formulir token, petunjuk sebelum mulai, ruang ujian dengan brand bersama, dan hasil dengan identitas peserta. Profil terbaru dari respons mulai ujian digunakan selama pengerjaan dan pada hasil. Token dikirim persis sesuai isian; tampilan tidak mengubah huruf besar/kecil secara diam-diam.

Pengiriman mulai ujian dikunci selama request aktif, dibatalkan ketika halaman ditinggalkan, dan menampilkan kesalahan/batas waktu. Respons ujian yang tidak lengkap tidak membuka lembar soal kosong. Rekaman token pada `sessionStorage` disimpan atomik bersama ID siswa; rekaman milik akun lain, format lama, atau rekaman rusak tidak dipakai untuk memulai otomatis. Siswa dapat memasukkan token kembali untuk melanjutkan sesi miliknya. Kegagalan penyimpanan token ditampilkan tanpa menghalangi pengerjaan atau hasil yang sudah dikonfirmasi server.

AnswerSync, payload jawaban, versi/mutation ID, manifest finalisasi, dan batas waktu server tetap digunakan. Nilai nol ditampilkan sebagai hasil sah; nilai langsung yang belum tersedia tidak diubah menjadi nol atau NaN. Nilai tertunda disembunyikan meskipun field angka diterima klien. Nilai langsung memakai angka server dengan maksimal dua desimal. Kesalahan penyelesaian mempertahankan halaman/ringkasan untuk dicoba lagi; sesi dinonaktifkan menutup workspace dan dialog tanpa menghapus outbox jawaban yang masih diperlukan untuk pemulihan.

Dialog ujian, gambar, pratinjau, serta konfirmasi umum memakai modal native dengan fokus keyboard dan penguncian scroll yang mendukung pratinjau bertingkat. Pembesaran gambar tetap mendukung 50–300%, tombol +/−, reset, dan Escape. Menutup semua dialog atau berganti ke hasil memulihkan scroll. Notifikasi dan dialog umum menggunakan gaya putih–biru; font antarmuka memakai font sistem tanpa mengunduh font Google. Rumus tetap memakai KaTeX lokal.

Tahap 6 tidak menambah migrasi atau mengubah backend. Jika skema Tahap 5 belum diterapkan, ikuti panduan database kosong sebelum menerapkan rilis gabungan. Setelah build, `node tests/student-pages-browser.mjs` menguji identitas/token, scope akun, batas waktu/pembatalan, gangguan storage, dialog, kegagalan finish/retry, nilai nol/tidak tersedia/tertunda, serta lebar 320–1440 px. Regresi mencakup browser akses publik, workspace, admin, operator, editor Guru, ruang ujian dan analitik; `npm run test:sync` dan `npm run test:analytics` memeriksa outbox serta CSV. `tests/tables-real-browser.mjs` juga menjalankan login, mulai, simpan/ack, dan finalisasi siswa melalui API sungguhan pada PostgreSQL terisolasi untuk nilai langsung dan tertunda. Variabel Playwright dan `INTEGRITY_TEST_DATABASE_URL` mengikuti tahap sebelumnya. Pengujian ini tidak membuktikan kapasitas 10.000 peserta bersamaan.
