# TKA APP (Aplikasi Ujian & Try Out)

Aplikasi platform ujian dan Try Out berbasis web yang memungkinkan pengaturan Bank Soal, Paket Ujian, manajemen peserta didik, dan penilaian otomatis.

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

---

## 🛠️ Tech Stack
- **Frontend**: React, TypeScript, Vite, Vanilla CSS (Tema *Glassmorphism* modern).
- **Backend**: Node.js, Express, Prisma ORM.
- **Database**: PostgreSQL.
