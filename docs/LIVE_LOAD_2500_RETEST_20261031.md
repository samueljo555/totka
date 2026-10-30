# Uji ulang khusus 2.500 siswa — 31 Oktober 2026

**Pembaruan:** percobaan berikutnya dengan resume acak lulus. Lihat
[hasil pola acak](LIVE_LOAD_RANDOM_RESUME_20261031.md). Laporan di bawah tetap
merupakan hasil pola resume bersama pada soal ke-15.

**Tahap 2.500 siswa belum lulus. Tidak ada HTTP 403 yang tercatat. Timeout
kembali muncul di sekitar gelombang resume, dan simpan p95 melewati target.**

Pengguna meminta pengulangan dari tingkat 2.500. Percobaan ini hanya menjalankan
pemeriksaan awal tiga peserta dan tahap 2.500; tidak mengulang 100–1.000 atau
menaikkan beban di atas 2.500.

## Pelaksanaan

- Target publik `https://naingsima.my.id/`, k6 v2.3.0, skrip yang sama tanpa
  perubahan perilaku selama pengujian; commit workspace `b07faf5`.
- Run `HTTP-20261030T181149028Z` (timestamp nama folder memakai UTC).
- Periode 31 Oktober 2026 pukul 01.11.49–01.15.35 WIB. Tahap utama dimulai
  01.12.02 WIB, dengan ramp login 60 detik dan rencana aktivitas 300 detik.
- Akun/soal dummy digunakan kembali. Hanya dua paket baru dibuat, untuk smoke
  dan tahap utama. Tidak ada akun/sekolah tambahan atau reset database.
- Generator yang sama: 6 CPU logis, RAM 7,08 GiB. Tidak ada monitoring GCP
  atau audit record database. Konfigurasi backend aktual tidak diverifikasi.

Pemeriksaan awal tiga siswa lulus. Pada tahap utama, semua 2.500 peserta
berhasil memulai sesi dan target aktif teramati sekitar 150,21 detik. Tes
di-abort setelah 212,83 detik termasuk ramp, sebelum penyelesaian normal.

## Perbandingan dengan percobaan sebelumnya

| Ukuran tahap 2.500 | Percobaan 30 Oktober | Ulang 31 Oktober |
| --- | ---: | ---: |
| Sesi berhasil dimulai | 2.500 | 2.500 |
| Durasi sebelum penghentian | 212,71 detik | 212,83 detik |
| Request HTTP pada ringkasan | 81.973 | 81.995 |
| Request gagal pada ringkasan | 278 | 260 |
| Error HTTP | 0,339% | 0,317% |
| Login p95 | 299 ms | 275 ms |
| Mulai p95 | 208 ms | 189 ms |
| Simpan p95 | 1.011 ms | 1.054 ms |
| Simpan p99 | 8.108 ms | 8.260 ms |
| Heartbeat gagal | 16 | 6 |
| HTTP 403 tercatat | 0 | 0 |
| Selesai dalam alur benchmark | 0, tes di-abort | 0, tes di-abort |

Target simpan p95 <750 ms tidak terpenuhi. Persentase error masih di bawah
batas <1%, tetapi ada enam kegagalan heartbeat sehingga syarat semua operasi
berhasil juga gagal. Nol penyelesaian bukan bukti endpoint finish gagal;
jendela penyelesaian belum tercapai pada tahap ini.

Receipt simpan yang selesai diperiksa valid 100% (47.788 pemeriksaan); resume
yang selesai diperiksa valid 100% (693 pemeriksaan). Angka ini tidak mencakup
semua operasi yang masih berjalan ketika abort. Ringkasan mencatat 254 retry.
Error dihitung dari metrik k6, bukan menambahkan seluruh baris status 0 yang
muncul saat request terputus akibat abort.

## Pola yang perlu ditelusuri

Timeout pertama tercatat pada endpoint resume sekitar **01.15.32 WIB**
(30 Oktober 18.15.32 UTC), sekitar 210 detik setelah tahap utama dimulai.
Log memuat `request timeout`; simpan maksimum mendekati batas 20 detik.
Untuk pencocokan log infrastruktur, periksa 31 Oktober 01.15.10–01.15.40 WIB
(30 Oktober 18.15.10–18.15.40 UTC).

Skrip menjadwalkan resume sesudah soal ke-15 untuk semua peserta dalam jendela
waktu yang berdekatan. Dua percobaan menunjukkan pola waktu kegagalan yang
mirip. Ini memperkuat dugaan bahwa gelombang resume perlu diperiksa, tetapi
belum membuktikan apakah hambatan berada pada endpoint, pool, query/lock,
load balancer, atau jaringan. Percobaan ulang juga menambah data historis
karena menggunakan paket baru, sehingga keadaan database tidak identik.

Puncak RSS generator sekitar 2.118 MiB; memori tersedia minimum 3.426 MiB.
Puncak CPU tersampel sekitar 296% (100% setara satu core). Guard resource
generator tidak terpicu. Ini tidak menggantikan pengukuran backend/jaringan.

Pemeriksaan lanjutan yang terarah adalah membandingkan aktivitas normal dengan
gelombang resume dan resume yang waktunya disebar. Skenario tersebut belum
dijalankan pada percobaan ini; skrip yang sama dipertahankan sepanjang pengujian.

## Penutupan dan artefak

Kedua paket uji ditutup. Seluruh 2.500 sesi parsial dikonfirmasi selesai melalui
API dengan beban rendah, tanpa error cleanup. Hasilnya dicatat pada
`cleanup.json`; proses itu tidak dihitung sebagai peserta benchmark lulus.
Data dummy tidak dihapus. Pemeriksaan `/api/ready` setelah cleanup mendapat
HTTP 200 dengan status `ready`.

Artefak privat: `load-tests/results/HTTP-20261030T181149028Z/`. Folder tersebut
juga memuat kredensial dan kunci jawaban sehingga diabaikan Git.
[Metode](LIVE_LOAD_TESTING.md), [hasil sebelumnya](LIVE_LOAD_RETEST_20261030.md).
