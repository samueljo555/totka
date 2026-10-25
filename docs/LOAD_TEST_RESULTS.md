# Hasil uji beban awal — 25 Oktober 2026

**Sistem belum dapat dinyatakan layak untuk 10.000 peserta bersamaan berdasarkan pengujian ini.** Semua alur yang dijalankan berhasil dan audit data lolos, tetapi beberapa tahap melewati batas respons sementara. Pengujian 10.000 VU belum dijalankan karena tingkat yang lebih rendah sudah gagal threshold.

## Lingkungan dan metode

- Host bersama: 4 CPU logis, Intel(R) Core(TM) i5-6400T CPU @ 2.20GHz, RAM 3.37 GiB. Aplikasi, PostgreSQL, dan generator berada pada mesin yang sama.
- Node v20.20.2, PostgreSQL 18.4, k6 2.3.0. Dua worker aplikasi, pool maksimum 5 per worker, Redis dinonaktifkan.
- Fixture per run: 10.050 siswa, 50 soal dari tiga tipe, 502.500 jawaban historis. bcrypt cost 10; endpoint login melakukan compare nyata.
- Jeda antarjawaban 0,5 detik ±20%, satu putaran 50 soal. Request replay identik dilakukan lima kali per peserta, serta satu resume pada pertengahan pengerjaan.
- Batas sementara p95: login <2.000 ms, mulai <1.000 ms, simpan <750 ms, finalisasi <2.000 ms. Semua peserta harus menyelesaikan alur, error HTTP <1%, dan audit data lolos.
- Tahap menggunakan proses aplikasi yang sama dengan paket berbeda; tahapan sebelumnya dapat memanaskan cache OS/JIT dan menambah sedikit data. Tidak ada warm-up formal atau pengulangan statistik untuk setiap ukuran.
- Base commit: `729ac72` dengan working tree P2 dimodifikasi. Kode dan laporan disimpan bersama pada commit P2; benchmark menguji alur HTTP produksi yang sama, disertai perbaikan shutdown IPC.

Metode, konfigurasi, dan batas lengkap tersedia di [LOAD_TESTING.md](LOAD_TESTING.md). Data mesin yang ditampilkan merupakan lingkungan pengujian lokal, bukan spesifikasi produksi yang dikonfirmasi pengguna.

## Baseline

| Profil | Peserta | Login p95 | Mulai p95 | Simpan p95 | Selesai p95 | Hasil |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | 25 | 621.5 ms | — | — | — | Lolos |
| login | 100 | 2059.8 ms | — | — | — | Gagal batas login |
| login | 250 | — | — | — | — | Dilewati setelah profil yang sama gagal pada tingkat lebih rendah |
| journey | 10 | 359.8 ms | 251.4 ms | 30.6 ms | 44.5 ms | Lolos |
| journey | 25 | 684.2 ms | 169.9 ms | 24.0 ms | 32.7 ms | Lolos |
| journey | 50 | 1333.4 ms | 181.7 ms | 26.7 ms | 33.8 ms | Lolos |
| journey | 100 | 2706.9 ms | 378.0 ms | 52.1 ms | 36.5 ms | Gagal batas login |
| journey | 250 | — | — | — | — | Dilewati setelah profil yang sama gagal pada tingkat lebih rendah |
| steady | 50 | — | 253.2 ms | 26.7 ms | 51.1 ms | Lolos |
| steady | 100 | — | 480.9 ms | 52.1 ms | 81.1 ms | Lolos |
| steady | 250 | — | 1249.8 ms | 496.5 ms | 506.3 ms | Gagal batas mulai |

Total 34,240 request HTTP pada sembilan tahap yang dijalankan, error HTTP 0%, retry transient 0. Sebanyak 585 sesi ujian selesai dengan 29,250 jawaban akhir. Audit tidak menemukan jumlah, isi, versi jawaban, flag benar, atau nilai yang salah. Seluruh peserta pada tahap yang dijalankan selesai; label gagal berasal dari latency, bukan kegagalan penyimpanan atau crash.

`journey` mencakup login. `steady` menggunakan token fixture valid dan tetap memeriksa sesi aktif di database, tetapi tidak melewati endpoint login. Keberhasilan `steady` tidak membuktikan kemampuan menerima gelombang login sebesar itu.

## Resource baseline

| Profil / peserta | CPU aplikasi rata-rata | RSS aplikasi maksimum | RSS generator maksimum | Koneksi aplikasi maksimum | Memori host tersedia minimum |
| --- | ---: | ---: | ---: | ---: | ---: |
| login / 25 | 199.6% | 346.2 MiB | 70.7 MiB | 10 | 1534.0 MiB |
| login / 100 | 306.7% | 326.3 MiB | 72.8 MiB | 10 | 1524.2 MiB |
| journey / 10 | 46.3% | 446.3 MiB | 67.3 MiB | 10 | 1443.5 MiB |
| journey / 25 | 70.3% | 450.9 MiB | 72.6 MiB | 10 | 1395.6 MiB |
| journey / 50 | 97.8% | 470.6 MiB | 102.4 MiB | 10 | 1327.6 MiB |
| journey / 100 | 150.0% | 488.8 MiB | 154.1 MiB | 10 | 1265.8 MiB |
| steady / 50 | 82.2% | 486.2 MiB | 101.3 MiB | 10 | 1316.1 MiB |
| steady / 100 | 130.5% | 485.8 MiB | 148.7 MiB | 10 | 1244.6 MiB |
| steady / 250 | 199.9% | 498.5 MiB | 302.3 MiB | 10 | 1093.7 MiB |

CPU 100% adalah satu core logis. Pada `steady:250`, dua worker aplikasi memakai rata-rata sekitar 200% CPU dan waktu mulai meningkat. Ini menjadi petunjuk untuk profiling jalur aplikasi, bukan bukti bahwa satu fungsi tertentu sudah dipastikan menjadi penyebab. Pada burst login, CPU aplikasi juga meningkat saat bcrypt compare berjalan. Belum dilakukan profiling CPU/event loop untuk membedakan penyebab secara pasti.

Tidak ada lock waiter yang tertangkap sampel satu detik; lock singkat masih dapat terlewat. Jumlah koneksi sesuai batas pool. Resource PostgreSQL dalam JSON hanya mencakup proses koneksi aplikasi; RSS proses tersebut dapat menghitung halaman shared berulang dan tidak mewakili keseluruhan biaya PostgreSQL/storage.

## Pemeriksaan lanjutan

Run kedua menggunakan worker baru tanpa tahap warm-up: 100 peserta, empat putaran soal yang sama dengan versi 1–4, jeda 0,5 detik, dan waktu finalisasi bersama pada detik ke-120. Seluruh peserta menyimpan 20.000 mutasi jawaban, 2.000 replay identik, serta 5.000 jawaban akhir versi 4. Semua nilai benar; error HTTP 0%, retry transient 0, dan audit lolos. Total 22.300 request, durasi 121.26 detik.

| Mulai p95 | Simpan p95 | Finalisasi p95 | Hasil tahap |
| ---: | ---: | ---: | --- |
| 1276.6 ms | 44.0 ms | 628.4 ms | Gagal batas mulai <1.000 ms |

Walaupun `steady:100` lolos setelah tahap-tahap sebelumnya pada baseline, run dengan worker baru melewati batas mulai ujian. Perbedaan ini menegaskan bahwa 100 peserta belum lolos secara konsisten; hasil satu run hangat tidak cukup untuk menetapkan kapasitas. Perlu pengulangan terkontrol dan profiling untuk memastikan kontribusi warm-up, antrean aplikasi, dan variasi host.

RSS maksimum aplikasi 446.7 MiB, generator 161.7 MiB, koneksi aplikasi maksimum 10; CPU aplikasi rata-rata 122.5%. Server benchmark berhenti dengan exit code 0 dan database fixture dihapus. Bukti: [repeat-finish-20261025.json](../load-tests/repeat-finish-20261025.json).

Dua menit ini merupakan pemeriksaan pembaruan berulang dan gelombang finalisasi, belum menggantikan ujian penuh 90 menit atau soak test panjang.

## Kesimpulan operasional

- Alur lengkap 50 peserta lolos pada baseline lokal. Alur tanpa login 100 peserta lolos pada baseline yang sudah menjalankan tahap sebelumnya, tetapi gagal batas mulai saat memakai worker baru pada run kedua. Angka tersebut bukan batas maksimum atau janji kapasitas produksi.
- Burst login 100 peserta melewati 2 detik; hasil login-only dekat batas (2,06 detik) perlu diulang sebelum menetapkan kapasitas. Pada alur lengkap, login 100 peserta mencapai 2,71 detik.
- Mulai ujian 250 peserta tanpa login mencapai 1,25 detik, melewati batas sementara 1 detik, walaupun semua ujian selesai dan jawaban tetap benar.
- Kandidat pekerjaan selanjutnya adalah profiling login dan mulai ujian, evaluasi jumlah worker/pool dan beban transaksi, lalu benchmark ulang dengan parameter yang sama. Jangan menurunkan cost password atau melewati pemeriksaan sesi demi angka benchmark.
- Keputusan untuk 10.000 peserta memerlukan spesifikasi target aplikasi/PostgreSQL/Redis, generator terpisah, SLA yang disepakati, pengujian berulang dan berdurasi representatif, serta jaringan/monitoring produksi yang setara. Hardware produksi belum dikonfirmasi.

Database sementara baseline sudah dihapus; proses server benchmark berhenti dengan exit code 0. Perubahan tidak menyentuh database aplikasi, konfigurasi PM2 aktif, atau deployment produksi.

Bukti mesin tersedia pada [baseline-20261025.json](../load-tests/baseline-20261025.json). Laporan mentah k6/resource disimpan di lingkungan uji, diabaikan Git; rangkuman JSON yang ditinjau menyertai kode tanpa password atau JWT.
