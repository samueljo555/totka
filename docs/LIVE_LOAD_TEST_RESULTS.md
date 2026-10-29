# Hasil pengujian domain — 29 Oktober 2026

**Target 10.000 siswa belum tercapai. Kenaikan dihentikan pada tahap 100 karena error HTTP. Hasil ini belum menentukan kapasitas maksimum aplikasi/database.**

Target: `https://naingsima.my.id/`. k6 v2.3.0 resmi, checksum SHA-256 diverifikasi. Pengukuran melalui HTTPS dan autentikasi normal, tanpa monitoring GCP atau audit database.

## Lingkungan

- Menurut pengguna: load balancer, tiga web VM masing-masing 8 vCPU/16 GB, Cloud SQL 16 vCPU/32 GB, Redis 4 vCPU/8 GB. Resource aktual dan pembagian trafik tidak diverifikasi.
- Generator terpisah: 6 CPU logis, RAM 7,08 GiB. Tidak ada environment HTTP proxy. Jalur jaringan eksternal merupakan bagian pengukuran.
- Fixture `LT20261029-99499`: 100 sekolah, 10.000 siswa unik. Tahap 100 memakai satu siswa dari setiap sekolah, tetapi seluruh request berasal dari satu generator, bukan 100 IP sekolah.
- Bank uji: 30 salinan soal Matematika dari tiga tipe, termasuk tabel. Soal asli guru tidak diubah atau ditautkan ke paket uji.
- Paket baru setiap tahap. Commit dasar lokal tercatat `801ee56`, working tree berisi skrip baru; ini tidak mengonfirmasi commit yang terpasang pada setiap VM GCP.

## Hasil

| Pengujian | Target aktif | Aktivitas direncanakan | Hasil |
| --- | ---: | ---: | --- |
| Pemeriksaan awal pertama | 3 | 10 detik | 3 selesai, nilai 100, error HTTP 0% |
| Tahap 100 pertama | 100 | 300 detik | Abort sekitar 62 detik; 100 sesi aktif teramati sekitar 50 detik |
| Pemeriksaan awal pengulangan | 3 | 10 detik | 3 selesai, nilai 100, error HTTP 0% |
| Tahap 100 pengulangan | 100 | 300 detik | Abort sekitar 62 detik; 100 sesi aktif teramati sekitar 50 detik |
| 250–10.000 | — | — | Tidak dijalankan setelah tahap 100 gagal |

Kedua pemeriksaan awal lulus receipt, replay, perubahan versi jawaban, resume, heartbeat, dan nilai akhir dari API. Pada tahap 100 belum ada peserta selesai secara normal karena tes dihentikan sebelum jendela penyelesaian. Resume pertengahan ujian dan finalisasi belum tercapai pada tingkat ini; metrik tanpa sampel tidak berarti latensi nol.

| Ukuran tahap 100 | Pertama | Pengulangan |
| --- | ---: | ---: |
| Request HTTP | 1.011 | 1.149 |
| Request gagal | 75 | 31 |
| Error HTTP | 7,42% | 2,70% |
| Login p95 end-to-end | 234 ms | 223 ms |
| Mulai p95 end-to-end | 164 ms | 160 ms |
| Simpan p95 end-to-end | 141 ms | 133 ms |
| Puncak RSS generator | 128 MiB | 129 MiB |
| Memori host tersedia terendah | 5.642 MiB | 5.608 MiB |

Latensi mencakup respons gagal, bukan hanya operasi berhasil. Respons yang cepat ditolak tidak membuktikan performa aplikasi baik. Generator tidak terkena penghentian resource. Batas error <1% dan keberhasilan operasi 100% gagal.

## Bukti error dan batas diagnosis

Pengulangan mencatat enum error, endpoint, status, dan content type tanpa body, JWT, atau kredensial. Seluruh 31 error tercatat:

| Endpoint | Status | Content type | Jumlah |
| --- | --- | --- | ---: |
| Simpan jawaban | 403 | `text/html; charset=UTF-8` | 23 |
| Pemeriksaan sesi | 403 | `text/html; charset=UTF-8` | 8 |

Format HTML berbeda dengan error otorisasi JSON pada backend lokal. **Dugaan:** penolakan proxy, WAF, rate limit, atau jalur akses lain. Lokasi dan aturan penyebab belum terkonfirmasi. Konfigurasi Cloud Armor, load balancer, Nginx, serta Cloud SQL tidak diubah.

Probe terpisah dengan tiga akun dummy lain dan 36 heartbeat berkecepatan rendah semuanya HTTP 200. Ini tidak membuktikan aturan rate limit tertentu. Setelah uji, `/api/health` kembali HTTP 200.

Sebelum meningkatkan beban, pastikan pengaturan akses menerima pola pengujian. Cloud Armor dapat memakai HTTP 403 untuk deny/rate limiting; perlu konfirmasi konfigurasi dari pemilik infrastruktur. Rujukan: [rate limiting Cloud Armor](https://docs.cloud.google.com/armor/docs/rate-limiting-overview). Pengujian satu IP belum mewakili jaringan 100 sekolah. Jangan menggunakan header IP palsu.

## Penutupan dan artefak

Seluruh empat paket uji ditutup. Sebanyak **200 sesi dummy yang terhenti dikonfirmasi selesai melalui API** pada proses cleanup berkecepatan rendah. Cleanup tidak dihitung sebagai peserta benchmark berhasil. Sekolah/siswa dummy, soal, sesi, dan jawaban tetap tersedia; data tidak dihapus.

Artefak privat, termasuk `cleanup.json`, tersimpan pada:

- `load-tests/results/HTTP-20261029T155348425Z/`
- `load-tests/results/HTTP-20261029T155752789Z/`

Folder diabaikan Git karena juga memuat kredensial dan kunci jawaban. Hanya ringkasan ini yang dipublikasikan. [Metode lengkap](LIVE_LOAD_TESTING.md).
