# Pratinjau desain TOTKA

Buka file HTML langsung di browser. Pratinjau memakai data ilustrasi, tidak memerlukan server, dan tidak terhubung ke API/database aplikasi.

- [Seluruh frontend](desain-frontend-totka.html): beranda, login empat peran, dashboard Super Admin/Operator/Guru/Siswa, tabel, formulir, editor visual, token, ruang ujian, serta hasil langsung/ditunda.
- [Desain tabel](desain-tabel-totka.html): referensi tabel yang sebelumnya disetujui.
- [Ruang ujian siswa](desain-ujian-siswa-totka.html): referensi desain ruang ujian yang sebelumnya disetujui.
- [Editor visual](desain-editor-soal-totka.html): pratinjau editor awal; implementasi aplikasi kini menggunakan isi soal terpadu, pilihan bergambar, rumus otomatis, dan ukuran font.

Pada **pratinjau seluruh frontend**, gunakan dropdown di bilah atas untuk berpindah peran, lalu sidebar untuk meninjau menu. Tombol desktop/ponsel menampilkan contoh lebar layar; file juga menyesuaikan viewport browser secara langsung. Tabel mendukung pencarian, filter, pengurutan, pergantian halaman, ekspor data contoh, dan simulasi memuat/kosong/gagal. Tombol tambah/edit membuka contoh formulir. Masuk dengan isian bebas untuk menjelajahi alur; kredensial tidak disimpan. Pada akun siswa, masukkan token contoh `BIND26` untuk melihat soal dan hasil.

Pratinjau editor keseluruhan memperagakan susunan konten dan perubahan teks sederhana. Toolbar lengkap, konversi rumus, unggahan gambar, kunci, dan penilaian tetap mengikuti implementasi aplikasi. Statistik dan nilai contoh tidak menunjukkan kapasitas atau hasil sistem sebenarnya. Pengaturan ujian ditunjukkan melalui paket, sesuai fitur yang tersedia.

Status rancangan: **disetujui dan diterapkan bertahap**. Pada Tahap 5, menu Manajemen Bacaan dan dukungan bacaan terpisah dihapus sesuai keputusan pengguna memulai database kosong; pratinjau HTML terdahulu disimpan sebagai referensi historis.
