# TKA APP (Aplikasi Ujian & Try Out)

Aplikasi platform ujian dan Try Out berbasis web yang memungkinkan pengaturan Bank Soal, Paket Ujian, manajemen peserta didik, dan penilaian otomatis.


## Keamanan API dan konfigurasi JWT

Backend membaca `backend/.env` ketika dijalankan dari direktori `backend` (konfigurasi PM2 sudah menggunakan direktori tersebut). Isi `JWT_SECRET` dengan secret acak minimal 32 karakter; gunakan `openssl rand -hex 32` untuk membuatnya. Aplikasi menolak startup jika secret kosong atau terlalu pendek. Jangan gunakan nilai contoh sebagai secret produksi.

Setelah pembaruan keamanan ini diterapkan, semua pengguna perlu login kembali karena JWT sekarang menyertakan pengenal sesi aktif (`sid`). Login pada perangkat lain atau reset password membatalkan token sebelumnya. Backend membaca identitas, peran, sekolah, dan sesi aktif dari database pada setiap request terproteksi; optimasi kapasitas pembacaan ini tetap perlu diuji pada tahap performa.

| Peran | Akses |
| --- | --- |
| Admin / super admin | Mengelola akun, sekolah, paket, seluruh bank soal/bacaan, dan analitik |
| Guru | Membaca, membuat, dan mengubah soal serta bacaan miliknya; mengunggah gambar |
| Operator | Melihat dan mendaftarkan siswa di sekolahnya; melihat token paket aktif dan sesi sekolahnya; detail hasil hanya untuk sesi selesai di sekolahnya, tanpa kunci jawaban |
| Siswa | Memulai, menjawab, dan menyelesaikan sesi miliknya; tidak mendapat akses bank soal atau API administrasi |

Operator tanpa sekolah ditolak. ID siswa, pembuat paket, dan penulis soal/bacaan ditentukan oleh identitas terautentikasi. Endpoint yang belum masuk daftar izin ditolak secara default. Endpoint publik hanya login dan health check. Pemeriksaan sesi juga memerlukan Bearer JWT.

Password/hash dan token aktif tidak dikirim melalui daftar pengguna maupun relasi siswa pada sesi/analitik. Respons login tetap mengirim token milik pengguna itu sendiri. Kunci jawaban tidak dikirim melalui respons ujian siswa atau hasil operator. Nilai siswa yang ditunda juga disembunyikan oleh API.

Password akun baru, termasuk akun dari seed dan generator data uji, langsung di-hash. Akun lama yang masih menggunakan plaintext tetap dapat login dan otomatis diubah menjadi bcrypt setelah login berhasil; pembaruan kode ini tidak menjalankan perubahan massal pada database yang sudah ada. Password awal operator yang dibuat dari data sekolah tetap mengikuti NPSN, sehingga admin sebaiknya menggantinya sebelum digunakan.

Password siswa baru dibuat otomatis sebanyak 6 karakter huruf kapital/angka tanpa karakter 0/O dan 1/I/L yang mudah tertukar. Password untuk autentikasi tetap di-hash dengan bcrypt. Salinan untuk kartu login disimpan terenkripsi AES-256-GCM pada kolom `User.loginCardPassword`, terikat pada ID siswa. Daftar pengguna biasa, login, sesi, dan analitik tidak mengirim hash atau nilai terenkripsi tersebut.

Endpoint kartu login khusus admin/operator (`GET /api/users/login-cards` dan `GET /api/users/:id/login-card`) mengembalikan `loginPassword` untuk pencetakan. Operator hanya dapat mengakses siswa di sekolahnya; siswa dan guru ditolak. Dasbor operator memuat password tersebut pada daftar siswa dan mengambil kartu terbaru sebelum mencetak. Password tetap tersedia setelah reload; CSV tidak lagi diunduh otomatis. Form edit admin dapat menampilkan password kartu siswa, dan menyimpan password yang sama saat mengubah profil tidak memutus sesi siswa.

Akun lama yang masih plaintext tetap dapat dicetak dan otomatis mendapatkan salinan terenkripsi ketika login meng-upgrade password menjadi hash. Akun lama yang sudah di-hash tetapi belum memiliki salinan terenkripsi tidak dapat dipulihkan dari hash. UI menampilkan “Belum tersedia” dan menyediakan tombol Atur ulang dengan konfirmasi; reset membuat password 6 karakter, memperbarui hash dan kartu secara bersamaan, serta membatalkan sesi lama. Tidak ada reset massal atau perubahan otomatis terhadap password lama. Jika ada kartu yang belum tersedia, pencetakan dihentikan dengan pesan untuk mengatur ulang akun tersebut, agar kartu tanpa password tidak dibagikan.

Token paket aktif tersedia kembali bagi operator melalui daftar paket untuk menu Pantau Ujian; token paket draft/nonaktif tetap disembunyikan. Token sesi pengguna dan kunci jawaban tetap dilindungi.

### Migrasi kartu login

Sebelum menjalankan versi ini pada database eksisting, tambahkan kolom nullable menggunakan migrasi `backend/prisma/migrations/20261024120000_student_login_cards/migration.sql`, lalu jalankan `prisma generate` sebelum build backend. Migrasi hanya menambahkan satu kolom; tidak mengganti password, akun, atau sesi lama. Database uji dibuat dari schema terbaru. Riwayat migrasi awal proyek masih perlu diselaraskan pada tahap deployment; jangan menginisialisasi ulang atau menjalankan seed untuk menerapkan perubahan ini.

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

Suite membuat schema acak dari schema Prisma terbaru, menjalankan transaksi menggunakan dua client/pool PostgreSQL, lalu menghapus schema buatannya. Pengguna database uji harus boleh membuat schema. Pengujian mencakup mulai serentak, jawaban lintas paket, payload salah, deadline setelah menunggu lock, finalisasi bersamaan, rollback, sweep multi-worker, dan perubahan konten saat peserta pertama masuk. Pengujian ini tidak membuktikan kapasitas 10.000 peserta. Perbaikan urutan versi jawaban, antrean offline, optimasi query/cache, migrasi deployment, dan load test tetap masuk prioritas berikutnya.

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
