# Uji ulang domain — 30 Oktober 2026

**Pembaruan 31 Oktober:** pengulangan khusus 2.500 siswa menunjukkan pola
timeout serupa, tanpa HTTP 403. Lihat [perbandingan percobaan](LIVE_LOAD_2500_RETEST_20261031.md).

**Tidak ada HTTP 403 yang tercatat. Tahap 100, 250, 500, dan 1.000 siswa lulus.
Tahap 2.500 dihentikan karena waktu simpan melampaui target dan terjadi timeout.
Tahap 5.000–10.000 tidak dijalankan.**

Target `https://naingsima.my.id/`, melalui load balancer publik, setelah pengguna
menyatakan konfigurasi GCP telah diperbarui. Detail pengaturan tersebut tidak
diakses atau diubah penguji. Periode pengukuran 30 Oktober 2026 pukul
23.33.09–23.59.14 WIB (16.33.09–16.59.14 UTC). Penutupan sesi dummy berlanjut
sesudah pengukuran dan dicatat terpisah.

## Metode

- k6 v2.3.0, skrip pada commit `0417825`, dengan fixture yang sama:
  `LT20261029-99499`, 100 sekolah dan 10.000 siswa unik.
- Tidak membuat akun, sekolah, atau soal tambahan. Membuat enam paket dummy
  baru, satu untuk pemeriksaan awal dan lima untuk tingkat beban yang dijalankan.
- Setiap paket memiliki 30 soal Matematika dari tiga tipe, memakai bank dummy
  yang sudah ada. Akun diseimbangkan menurut sekolah, satu akun per VU.
- Semua peserta pada satu tahap memakai jendela aktivitas bersama lima menit,
  di luar login bertahap dan penyelesaian. Ada heartbeat, replay identik,
  perubahan jawaban, dan resume. Sesi selesai tidak digunakan kembali.
- Generator terpisah: 6 CPU logis dan RAM 7,08 GiB, seluruh permintaan dari satu
  jalur keluar jaringan. Tidak ada akses monitoring GCP atau audit database.

## Hasil per tingkat

| Siswa bersamaan | Selesai normal | Request | Error HTTP | Simpan p95 | Finalisasi p95 | Hasil |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 100 | 100 | 6.025 | 0% | 91 ms | 101 ms | Lulus |
| 250 | 250 | 15.082 | 0% | 81 ms | 111 ms | Lulus |
| 500 | 500 | 30.278 | 0% | 97 ms | 95 ms | Lulus |
| 1.000 | 1.000 | 60.687 | 0% | 179 ms | 97 ms | Lulus |
| 2.500 | 0, tes dihentikan | 81.973 | 0,339% | 1.011 ms | Belum diuji | Gagal |
| 5.000–10.000 | — | — | — | — | — | Tidak dijalankan |

Pemeriksaan awal tiga peserta juga lulus, dengan 120 request dan tanpa error.
Total ringkasan: 194.165 request dan 278 request gagal. Jumlah gagal menggunakan
metrik k6, bukan menghitung ulang seluruh baris log sesudah abort.

Semua peserta yang selesai normal memperoleh nilai 100 sesuai kunci. Receipt,
replay, perubahan versi, resume, heartbeat, dan finalisasi lulus pada empat
tingkat pertama. Seluruh target aktif teramati selama 298,52–299,27 detik dalam
jendela lima menit, sesuai toleransi sampling delapan detik yang sudah ditetapkan.
Data ini berasal dari konfirmasi API/counter penguji, bukan audit record DB.

## Kegagalan pada 2.500 siswa

Semua 2.500 sesi berhasil dimulai. Target aktif teramati sekitar 150,09 detik;
tes berhenti setelah 212,71 detik termasuk ramp login 60 detik, sebelum jendela
penyelesaian. Nol peserta selesai pada tahap ini bukan bukti endpoint finish
gagal, karena penyelesaian normal belum tercapai.

- Login p95 299 ms dan mulai p95 208 ms masih di bawah target.
- Simpan p95 1.011 ms melewati target <750 ms. Simpan p99 sekitar 8.108 ms,
  dengan maksimum sekitar 20.004 ms.
- Ringkasan mencatat 278 request gagal dari 81.973 (0,339%). Ini masih di bawah
  batas error HTTP <1%, tetapi 16 pemeriksaan heartbeat gagal dan syarat semua
  operasi berhasil tidak terpenuhi. Abort otomatis terjadi; tidak menaikkan beban.
- Log sebelum penghentian memuat `request timeout`. Setelah abort, request
  yang masih berjalan juga dapat menghasilkan status 0; baris tersebut tidak
  boleh ditambahkan begitu saja ke jumlah kegagalan ringkasan.
- Tidak ada status 403 pada log dari semua tingkat yang dijalankan.
- Receipt simpan yang selesai diperiksa valid 100%; resume yang selesai
  diperiksa juga valid 100%. Ini tidak membuktikan seluruh operasi yang
  terputus sudah tersimpan atau seluruh VU telah melewati resume.

Status 0 pada log menunjukkan tidak tersedia respons HTTP yang dapat dipakai
oleh penguji, bukan respons HTTP server bernomor nol. Dokumentasi k6 membedakan
error transport/timeout dari status HTTP: [Response](https://grafana.com/docs/k6/latest/javascript-api/k6-http/response/),
[Error Codes](https://grafana.com/docs/k6/latest/javascript-api/error-codes/).

Rentang log error utama: 23.59.11–23.59.13 WIB. Request timeout berlangsung
hingga 20 detik; untuk pencocokan di infrastruktur, periksa sekitar
23.58.50–23.59.15 WIB (16.58.50–16.59.15 UTC).

## Resource generator dan batas kesimpulan

Pada tahap 2.500, RSS puncak generator sekitar 2.148 MiB, memori host tersedia
terendah sekitar 3.420 MiB, dan puncak CPU tersampel sekitar 269% (100% setara
satu core logis). Tidak ada guard resource generator yang terpicu. Sampling
satu detik tetap dapat melewatkan lonjakan singkat dan tidak mengukur seluruh
jalur jaringan maupun resource backend.

**Terbukti lulus: 1.000 siswa pada model dan durasi pengujian ini.** Ini bukan
kapasitas maksimum, jaminan ujian penuh, atau bukti siap 10.000 siswa. Bahkan
pada 1.000 siswa, simpan p99 sekitar 1.306 ms dan maksimum sekitar 14.397 ms;
kelulusan p95 tidak berarti setiap request cepat.

Penyebab timeout belum dapat ditempatkan secara pasti pada aplikasi, pool
koneksi, Cloud SQL, load balancer, atau jaringan dari pengamatan eksternal saja.
Pengujian dari VM GCP menggunakan [paket yang telah disiapkan](K6_GCP.md) dapat
membantu membandingkan jalur publik dan internal, tanpa menganggap hasil satu
web VM mewakili keseluruhan tiga server dan load balancer publik.

## Penutupan dan artefak

Semua enam paket uji telah ditutup. Seluruh 2.500 sesi parsial dikonfirmasi
selesai melalui API dengan beban rendah, tanpa error cleanup. Progres dan konfirmasinya dicatat di
`cleanup.json`; penyelesaian cleanup tidak dihitung sebagai kelulusan benchmark.
Data dummy tetap tersedia dan tidak dihapus.

Artefak privat: `load-tests/results/HTTP-20261030T163309293Z/`. Folder memuat
laporan, ringkasan, log, sampel generator, kredensial, serta kunci jawaban dan
diabaikan Git. Hanya ringkasan yang telah ditinjau ini yang dipublikasikan.
[Metode lengkap](LIVE_LOAD_TESTING.md).
