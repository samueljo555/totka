# Uji beban TKA

Uji beban memakai aplikasi hasil build dan PostgreSQL nyata pada database sementara. Tujuannya menemukan batas respons dan kegagalan alur ujian, bukan menyimpulkan kapasitas dari jumlah baris data saja. Hasil lokal dan batas pengujiannya ada di [laporan baseline](LOAD_TEST_RESULTS.md).

## Apa yang diperbaiki dari skrip lama

Skrip lama menjalankan login ulang dalam loop, memetakan VU secara modulo ke 10.000 akun, dan bisa kembali masuk ke sesi yang sudah selesai. Ini dapat membatalkan sesi login antar-peserta atau menghasilkan beban yang semakin ringan karena siswa tidak lagi menjawab soal. Generator lama juga menghapus siswa dummy melalui `DATABASE_URL` aplikasi.

Skrip baru memakai satu iterasi per VU dengan satu akun unik, memerlukan file kredensial eksplisit, serta menolak sesi yang sudah selesai. Setiap tahap memakai paket baru. Generator lama dinonaktifkan; pengganti membuat database dengan nama acak `tka_load_<runId>`, lalu membersihkannya setelah selesai. Tidak ada fallback ke `DATABASE_URL`, reset database aplikasi, atau seed ke database yang dipilih secara implisit.

Executor `per-vu-iterations` memberi setiap VU jumlah iterasi yang ditentukan; dalam skrip ini satu peserta menyelesaikan satu alur. VU yang lebih cepat selesai tidak diganti peserta baru. Karena itu jumlah VU adalah peserta serentak yang diluncurkan, bukan jumlah request per detik dan bukan jaminan concurrency tetap sepanjang pengujian. Lihat [dokumentasi executor k6](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/per-vu-iterations/) dan [identitas eksekusi k6](https://grafana.com/docs/k6/latest/using-k6/execution-context-variables/).

## Lingkungan terisolasi

Siapkan Linux, k6, build frontend/backend, dan **cluster PostgreSQL khusus pengujian**. Akun database memerlukan CREATE/DROP DATABASE. Jangan menunjuk server database produksi, karena walaupun data aplikasi tidak diubah, beban CPU/IO/koneksi tetap memengaruhi server yang sama. Gunakan versi PostgreSQL, ekstensi, dan konfigurasi pool yang setara dengan target untuk pengujian kapasitas produksi.

```bash
npm run build --prefix backend
npm run build
# Isi LOAD_TEST_DATABASE_URL di environment aman sebelum menjalankan perintah berikut.
K6_BIN=/PATH/TO/k6 npm run test:load --prefix backend
```

`LOAD_TEST_DATABASE_URL` menunjuk database administratif pada cluster uji, bukan database hasil fixture. Harness membuat database baru, menerapkan migrasi, lalu menambahkan 10.050 siswa, 50 soal dari tiga tipe, dan 502.500 jawaban historis dengan sesi selesai. Hash menggunakan bcrypt cost 10 seperti aplikasi; fixture memakai satu hash bersama agar waktu persiapan tidak didominasi hashing 10.050 password. Login tetap melakukan bcrypt compare nyata untuk setiap request. Password dan JWT hanya berada di file sementara berizin 600, lalu dihapus.

Server benchmark menggunakan entrypoint `backend/dist/index.js` melalui dua worker Node cluster, pool maksimal 5 koneksi per worker dengan budget 40, konfigurasi timeout yang sama dengan default, dan Redis dinonaktifkan. Ini menguji jalur aplikasi yang sama; proses benchmark bukan proses PM2 produksi. Folder unggahan terpisah, frontend memakai build proyek. Aplikasi, generator, dan PostgreSQL pada baseline berbagi host sehingga hasilnya tidak boleh dianggap kapasitas layanan terdistribusi.

`K6_BIN` opsional jika `k6` sudah berada di PATH. Harness merekam versi k6, Node/PostgreSQL, CPU/RAM, commit dasar, dan apakah working tree dimodifikasi saat dijalankan. Gunakan release bersih dan generator terpisah untuk benchmark produksi yang dapat dibandingkan.

## Profil dan parameter

| Profil | Beban yang dilakukan |
| --- | --- |
| `login` | Satu login nyata per siswa, diluncurkan serentak. Mengukur antrean autentikasi tanpa mencampurnya dengan waktu membaca soal. |
| `journey` | Login, mulai ujian, menjawab semua soal, pengiriman ulang identik, resume, dan finalisasi dengan manifest versi. |
| `steady` | Alur ujian yang sama memakai JWT fixture yang valid dan pemeriksaan sesi database tetap aktif. Melewati endpoint login untuk memisahkan biaya autentikasi dari aktivitas ujian. Profil ini bukan soak test berdurasi panjang secara default. |

| Variabel | Default / fungsi |
| --- | --- |
| `LOAD_STAGES` | `journey:10,journey:25,journey:50,journey:100,journey:250,steady:25,steady:50,steady:100,steady:250` |
| `LOAD_WORKERS` | 2, batas 1–32. Pool efektif mengikuti budget 40 dan maksimum 5 per worker. |
| `THINK_SECONDS` | 1 detik per jawaban dengan jitter ±20%; beban dipercepat dibanding ujian nyata. |
| `ANSWER_ROUNDS` | 1; nilai lebih besar memperbarui soal yang sama dengan versi meningkat, lalu memfinalisasi versi terbaru. |
| `MAX_DURATION` | `5m` per tahap, ditambah graceful stop k6 20 detik. Atur lebih lama untuk banyak putaran. |
| `FINISH_AT_SECONDS` | 0; bila positif, peserta yang sudah menyimpan semua jawaban menunggu waktu tersebut sejak awal skenario untuk membuat gelombang finalisasi. Peserta terlambat langsung memfinalisasi; ini bukan barrier yang menjamin semua request selesai serentak. |
| `LOAD_RESULTS_DIR` | Direktori timestamp di `load-tests/results/`, diabaikan Git. |

Contoh burst login dan alur lengkap:

```bash
LOAD_STAGES=login:25,login:100,login:250,journey:25,journey:50,journey:100,steady:100,steady:250 \
THINK_SECONDS=0.5 npm run test:load --prefix backend
```

Contoh pengujian lebih panjang dan gelombang finalisasi, setelah tingkat sebelumnya lolos:

```bash
LOAD_STAGES=steady:50 ANSWER_ROUNDS=6 THINK_SECONDS=0.5 MAX_DURATION=5m \
FINISH_AT_SECONDS=180 npm run test:load --prefix backend
```

Setiap soal ke-1, 11, 21, 31, dan 41 dikirim ulang dengan ID/versi yang sama untuk menguji idempotensi. Pada tengah putaran pertama, peserta melakukan resume dan memeriksa receipt jawaban yang sudah tersimpan. Respons simpan harus mengonfirmasi ID soal, payload, versi, dan mutation ID yang tepat. Error transient dicoba ulang maksimal lima kali dengan backoff; error HTTP tetap tercatat walaupun retry berhasil. Ini mensimulasikan replay request, **belum** memutus jaringan atau membuka browser siswa nyata.

Beban lebih tinggi pada profil yang sama dilewati setelah satu tahap gagal. Profil lain tetap diuji agar login lambat tidak menutupi karakteristik penyimpanan jawaban. Tahap juga dihentikan bila memori tersedia host kurang dari 128 MB atau worker gagal. Tidak ada kenaikan otomatis ke 10.000 VU. Tambahkan tahap hanya setelah tahap sebelumnya lolos, periksa resource generator, dan gunakan generator di host terpisah untuk skala besar.

## Kriteria sementara

Batas berikut adalah asumsi pengujian awal yang perlu disepakati untuk target produksi; bukan SLA yang sudah ditetapkan pengguna.

| Ukuran | Batas lolos |
| --- | --- |
| Login p95 | < 2.000 ms |
| Mulai ujian p95 | < 1.000 ms |
| Simpan jawaban p95 | < 750 ms |
| Finalisasi p95 | < 2.000 ms |
| Error HTTP | < 1% |
| Alur berhasil | 100% peserta yang ditargetkan selesai |
| Audit data | Tidak ada sesi selesai dengan jumlah/isi/versi jawaban atau nilai yang salah |

Kegagalan threshold membuat exit code bukan nol meski semua request akhirnya berhasil. Baca latency per endpoint dan pemeriksaan database, bukan hanya persentase HTTP sukses. Satu hasil lolos tidak menetapkan kapasitas maksimum; ulangi beberapa kali dengan warm-up, durasi representatif, dan beban latar yang terkontrol.

## Hasil dan resource

`report.json` berisi hasil per tahap, threshold yang gagal, audit database, jumlah request/retry, dan resource. File ringkasan k6 per tahap menyimpan p50/p95/p99 dan metrik detail. File resource diambil kira-kira per detik; tahap sangat singkat hanya memiliki sedikit sampel.

Resource mencakup CPU/RSS worker aplikasi dan k6, jumlah koneksi aplikasi PostgreSQL, koneksi aktif, lock waiter, serta memori tersedia host. CPU 100% berarti satu core logis; total beberapa worker dapat lebih dari 100%. RSS backend PostgreSQL adalah penjumlahan proses koneksi aplikasi yang dapat menghitung halaman shared lebih dari sekali, dan **tidak** mencakup seluruh postmaster, background writer, WAL, atau biaya storage. Sampel lock satu detik dapat melewatkan lock singkat. Angka ini membantu diagnosis awal dan tidak menggantikan monitoring PostgreSQL/host lengkap.

Audit database setelah tahap memeriksa semua sesi paket tersebut. Sesi selesai harus memiliki tepat 50 jawaban, versi terakhir sesuai putaran, payload fixture benar, seluruh flag benar, dan nilai 100. Jumlah siswa selesai harus cocok dengan counter k6; sesi yang berhenti di tengah tetap tercatat. Counter lengkap juga harus sama dengan target VU agar tahap lolos. Karena setiap akun/paket hanya dijalankan sekali, sesi selesai yang dipakai ulang tidak dapat membuat hasil lulus palsu.

Setelah server benchmark berhenti, harness menghapus database dan file kredensial sementara. Status cleanup dan shutdown dicatat. Jika proses dibunuh paksa sebelum cleanup, identifikasi database `tka_load_<runId>` dari laporan dan bersihkan hanya database fixture tersebut melalui administrasi PostgreSQL. Laporan mentah tidak otomatis di-commit; rangkuman yang sudah ditinjau disimpan di dokumentasi.

## Batas kesimpulan

Baseline HTTP lokal belum mencakup 10.000 browser, rendering frontend, TLS/load balancer, latensi jaringan sekolah, Redis aktif, upload gambar, cetak kartu, operator/admin bersamaan, ataupun ujian penuh 90 menit. Ketersediaan 10.050 akun dan 502.500 jawaban adalah ukuran fixture, bukan 10.050 pengguna aktif.

Untuk keputusan produksi: tetapkan spesifikasi host aplikasi/database/Redis, pola login serentak atau bertahap, ukuran soal/gambar, jumlah operator, durasi, dan SLA. Jalankan pengujian bertahap pada arsitektur tersebut dengan generator terpisah, monitoring CPU/RAM/IO/WAL/pool, pengujian durasi panjang, gelombang login/finalisasi, dan gangguan jaringan/worker. Jangan menyatakan layak 10.000 peserta bersamaan sebelum bukti ini tersedia.
