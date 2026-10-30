# Uji 2.500 siswa dengan resume acak — 31 Oktober 2026

**Lulus: seluruh 2.500 peserta menyelesaikan ujian, skor sesuai kunci,
tanpa error HTTP, retry, atau kegagalan heartbeat.** Hasil berlaku untuk pola
resume acak dan durasi yang diuji; bukan bukti kapasitas 10.000 peserta atau
pemulihan 2.500 sesi secara serempak.

## Lingkungan dan model

- Target publik `https://naingsima.my.id/`, k6 v2.3.0, skrip commit `30c81d5`.
- Run `HTTP-20261030T183732414Z`; nama folder memakai UTC. Pelaksanaan pada
  31 Oktober 2026 pukul 01.37.32–01.44.02 WIB (30 Oktober 18.37.32–18.44.02 UTC).
- Hanya smoke tiga peserta dan tahap 2.500 yang dijalankan. Tidak menaikkan
  beban ke 5.000–10.000.
- Fixture sama: 100 sekolah, 10.000 akun dummy, serta 30 soal Matematika dari
  tiga tipe. Sebanyak 2.500 akun dipilih bergiliran menurut sekolah. Dua paket
  baru dibuat; akun, sekolah, dan bank soal tidak digandakan atau di-reset.
- Setiap peserta melakukan satu resume pada posisi yang dipilih independen
  setelah soal ke-5–25, ditambah jitter 0–3 detik. Satu perubahan jawaban lalu
  dikembalikan ke jawaban benar, tiga replay identik, dan heartbeat tetap diuji.
- Ramp login 60 detik, jendela aktivitas bersama 300 detik, dan penyelesaian
  tersebar 15 detik. Semua threshold dan pemeriksaan integritas API tetap sama.
- Generator terpisah: 6 CPU logis, RAM 7,08 GiB, satu jalur keluar jaringan.
  Tidak ada monitoring GCP atau audit record database.

## Hasil tahap utama

| Ukuran | Hasil |
| --- | ---: |
| Target dan puncak sesi aktif terkonfirmasi | 2.500 |
| Seluruh target aktif teramati | 298,87 detik |
| Selesai normal dengan skor sesuai kunci | 2.500 |
| Durasi tahap, termasuk ramp/finalisasi | 376,69 detik |
| Request HTTP | 154.666 |
| Request gagal | 0 |
| Retry | 0 |
| Login p95 / p99 | 325 / 394 ms |
| Mulai p95 / p99 | 213 / 309 ms |
| Simpan p95 / p99 | 97 / 157 ms |
| Finalisasi p95 / p99 | 100 / 149 ms |
| Maksimum simpan | 279 ms |
| Heartbeat berhasil | 57.166 dari 57.166 |
| Resume berhasil | 2.500 dari 2.500 |
| Validasi skor berhasil | 2.500 dari 2.500 |
| Threshold gagal | 0 |

Puncak semua sesi aktif dan lama pemeliharaannya dihitung dari counter API yang
disampel setiap detik, bukan query langsung ke database. Durasi teramati berada
dalam toleransi sampling delapan detik untuk jendela lima menit. Skor 100
merupakan hasil yang diharapkan karena pilihan benar diketahui dari fixture.
Konfirmasi skor/receipt API tidak menggantikan audit semua record database.

Smoke juga lulus. Tidak ada status 403 pada log. Total request termasuk smoke
adalah 154.786, seluruhnya tanpa error pada ringkasan k6.

## Sebaran resume yang teramati

- Posisi minimum soal ke-5, maksimum ke-25, median ke-15, rata-rata 14,94.
- Resume dimulai sekitar 42,12–225,71 detik sejak awal jendela aktivitas.
- Data sebaran disimpan dalam `stages[].resumeDistribution`; waktu tersebut
  adalah posisi waktu mulai, bukan latensi respons.

## Perbandingan dengan pola lama

| Ukuran tahap 2.500 | Resume bersama ke-15, ulang sebelumnya | Resume acak |
| --- | ---: | ---: |
| Hasil | Dihentikan sekitar 213 detik | Lulus, 2.500 selesai |
| Error HTTP | 0,317% | 0% |
| Simpan p95 | 1.054 ms | 97 ms |
| Simpan p99 | 8.260 ms | 157 ms |
| Heartbeat gagal | 6 | 0 |
| HTTP 403 tercatat | 0 | 0 |

Perubahan utama adalah penyebaran waktu resume, bukan pengurangan jumlah soal,
penghapusan pemeriksaan jawaban, atau pelonggaran threshold. Hasil mendukung
dugaan bahwa penumpukan resume berperan dalam pola timeout sebelumnya. Namun,
resource backend/jaringan tidak diobservasi dan data historis terus bertambah,
sehingga satu perbandingan ini tidak menetapkan akar masalah secara mutlak.
Skenario lama tetap merupakan hasil uji gelombang pemulihan sesi dan tidak
boleh dianggap telah lulus karena pola baru berhasil.

Puncak RSS generator sekitar 2.622 MiB; memori tersedia minimum 3.077 MiB.
Puncak CPU tersampel sekitar 241% (100% setara satu core logis). Guard resource
generator tidak terpicu; data ini tidak menyatakan pemakaian ketiga VM GCP.

## Penutupan dan artefak

Kedua paket uji ditutup setelah selesai. Seluruh sesi selesai melalui alur
benchmark normal, sehingga tidak memerlukan finalisasi parsial sebagai cleanup.
Data dummy tetap tersedia dan tidak dihapus.

Artefak privat: `load-tests/results/HTTP-20261030T183732414Z/`. Folder memuat
kredensial serta kunci jawaban dan diabaikan Git. Hanya ringkasan yang ditinjau
ini yang dipublikasikan. [Metode](LIVE_LOAD_TESTING.md),
[hasil pola lama](LIVE_LOAD_2500_RETEST_20261031.md).
