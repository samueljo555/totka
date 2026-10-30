# Pengujian HTTP eksternal melalui domain

Runner: `backend/scripts/run-live-load.mjs`; skenario: `load-tests/live-student.js`.
Menggunakan k6 dengan autentikasi normal. Tidak menggunakan koneksi database, JWT buatan, seed/reset, atau monitoring GCP. Target default `https://naingsima.my.id`; `LIVE_TARGET_URL` dapat menunjuk origin internal yang Anda kelola dan mengakses fixture yang sama. Jalankan hanya dalam lingkup izin pemilik website. Untuk paket mandiri di VM GCP, lihat [panduan GCP](K6_GCP.md).

## Prasyarat dan pelaksanaan

- k6 pada `K6_BIN`, Node.js, Linux `/proc`, serta `getconf CLK_TCK`.
- Build backend untuk utilitas konten: `npm --prefix backend run build`.
- Fixture yang telah diverifikasi pada `load-tests/results/dummy-preparation-state.json`: 100 sekolah, 100 siswa per sekolah, file ID/username/password/NPSN privat.
- `LIVE_QUESTION_SOURCE_FILE`: JSON tepat 30 soal Matematika dengan konten editor, pilihan, dan kunci yang valid.
- File login admin JSON dengan username/password, disimpan di luar Git dengan izin 600. Dapat diberikan melalui stdin atau path `LIVE_ADMIN_FILE`.

Dari root proyek, sesuaikan path privat:

```bash
K6_BIN=/path/to/k6 \
LIVE_QUESTION_SOURCE_FILE=/secure/source-questions.json \
node backend/scripts/run-live-load.mjs < /secure/admin-login.json
```

Runner membuat 30 salinan soal dummy milik admin agar ujian tidak mengunci soal asli guru. Setiap tahap memakai paket baru: token acak, durasi 60 menit, nilai langsung. Paket ditutup setelah tahap berhenti. Data dummy tidak otomatis dihapus.

## Model beban

- Satu VU, satu siswa unik, satu iterasi. Akun dipilih bergiliran menurut sekolah; 100 peserta pertama berasal dari 100 sekolah.
- Pemeriksaan awal 3 siswa selama 10 detik.
- Tahap 100, 250, 500, 1.000, 2.500, 5.000, 7.500, 10.000.
- Jendela aktivitas bersama 300 detik; tahap 10.000 memakai 600 detik. Login berlangsung 10–180 detik di luar jendela itu. Penyelesaian disebar 15–30 detik.
- Menjawab 30 soal, mengubah satu jawaban lalu mengembalikannya dengan versi lebih tinggi, tiga replay identik, serta resume pertengahan ujian yang memeriksa receipt dan payload.
- Heartbeat sekitar setiap 15 detik dalam VU yang sama; request lambat dapat menundanya.
- Semua peserta tetap aktif sampai akhir jendela. Jeda menjawab sekitar 9 detik untuk aktivitas 5 menit: simulasi dipercepat, bukan kecepatan membaca siswa yang terukur.

Counter API `sessions_started - sessions_finished` disampel setiap detik melalui REST API lokal k6 untuk mengamati sesi aktif terkonfirmasi. Kelulusan memerlukan seluruh target aktif selama durasi yang direncanakan dengan toleransi sampel/delay delapan detik. Ini bukan hitungan sesi dari database. Satu generator tidak mensimulasikan alamat IP sekolah yang berbeda.

## Kelulusan dan penghentian

Target p95 end-to-end per request: login <2.000 ms, mulai <1.000 ms, simpan <750 ms, selesai <2.000 ms. Receipt, resume, heartbeat, nilai dari API, dan penyelesaian seluruh peserta wajib benar. Error HTTP <1%.

Evaluasi abort error HTTP/kegagalan operasi dimulai setelah 60 detik. HTTP 403 tidak dicoba ulang. Tahap gagal menghentikan seluruh kenaikan berikutnya. Resource generator dipantau secara lokal; berhenti jika memori tersedia <512 MB, RSS mendekati batas host, CPU jenuh berkelanjutan, atau deadline terlewati. `GOMEMLIMIT=4GiB` adalah target GC Go, bukan batas memori keras.

Diagnosis ulang satu tahap dapat memakai bank dummy sebelumnya:

```bash
K6_BIN=/path/to/k6 \
LIVE_QUESTION_SOURCE_FILE=/secure/source-questions.json \
LIVE_REUSE_QUESTIONS_DIR=/path/to/previous/private/result \
LIVE_STAGES=100 \
node backend/scripts/run-live-load.mjs < /secure/admin-login.json
```

`LIVE_SMOKE_ONLY=true` hanya menjalankan pemeriksaan awal. Paket tetap baru pada setiap pengulangan.

Untuk melanjutkan setelah tahap yang sudah lolos, `LIVE_PREVIOUS_RUN_DIR` dapat
menunjuk laporan sebelumnya. Runner memeriksa target, fixture, serta tahap
sebelumnya yang lolos dan paketnya sudah ditutup. Semua tahap yang dipilih
melalui `LIVE_STAGES` harus lebih tinggi daripada tahap sebelumnya tersebut.
Laporan baru merekam hubungan kelanjutannya; metrik lama tidak dihitung ulang.

Jika sesi admin ditolak dengan HTTP 401, runner melakukan login admin ulang
dan mengulangi operasi kontrol sekali. Penolakan 403 tidak dicoba ulang.
Kegagalan tahap menghasilkan exit code bukan nol; interupsi menghasilkan 130.

## Artefak dan batas interpretasi

Folder `load-tests/results/HTTP-…/` memuat laporan, ringkasan k6, log error tanpa body/JWT, resource generator, kredensial dan kunci privat. Folder berizin 700, file 600, seluruh hasil diabaikan Git. Jangan memublikasikan seluruh folder.

Penyelesaian sesi setelah abort harus dicatat sebagai cleanup, bukan kelulusan benchmark. Menutup paket tidak otomatis mengakhiri sesi aktif; tanpa cleanup sesi mengikuti deadline/sweeper aplikasi.

HTTP 403 HTML mengindikasikan penolakan pada jalur permintaan, tetapi tidak membuktikan aturan Cloud Armor tertentu. Periksa proxy/WAF/rate limit sebelum melanjutkan. Jangan memakai header IP palsu atau menonaktifkan perlindungan secara menyeluruh.

Simulasi HTTP tidak menjalankan 10.000 browser dan tidak mengaudit semua record database. Hasil pertama: [laporan 29 Oktober 2026](LIVE_LOAD_TEST_RESULTS.md).

Fixture dapat dipindahkan melalui arsip privat dari `export-live-load-kit.mjs`.
`LIVE_FIXTURE_FILE` menunjuk manifest alternatif; `fixture.dir` relatif terhadap
root paket atau absolut untuk kompatibilitas workspace asal. Paket tidak
memerlukan Git atau node_modules. Metadata asal dan hash skrip disertakan dalam
`kit-version.json`.
