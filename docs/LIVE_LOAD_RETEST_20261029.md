# Pengujian ulang domain — 29 Oktober 2026

**Pembaruan 30 Oktober:** respons 403 tidak teramati lagi; tahap 100–1.000
lulus dan tahap 2.500 mengalami timeout. Lihat [hasil terbaru](LIVE_LOAD_RETEST_20261030.md).
Bagian berikut adalah riwayat pengujian 29 Oktober.

**100 siswa lulus. Tahap 250 gagal karena respons HTTP 403 HTML. Target 10.000
belum tercapai; tahap 500 dan seterusnya tidak dijalankan.**

Pengguna menyatakan konfigurasi Cloud Armor telah diubah. Detail aturan tidak
diakses atau diubah oleh penguji. Target tetap `https://naingsima.my.id/` melalui
HTTPS, k6 v2.3.0, satu generator 6 CPU logis/7,08 GiB, tanpa monitoring GCP atau
audit database. Fixture tetap 100 sekolah/10.000 siswa; soal dummy yang sama
digunakan kembali, tanpa mengubah atau mengunci soal asli guru.

## Hasil yang teramati

| Ukuran | 100 siswa | 250 siswa |
| --- | ---: | ---: |
| Aktivitas direncanakan | 300 detik | 300 detik |
| Seluruh target aktif teramati | 299,20 detik | 45,34 detik |
| Durasi tahap, termasuk login/penyelesaian | 325,39 detik | 62,48 detik |
| Sesi dimulai | 100 | 250 |
| Selesai dalam alur benchmark | 100 | 0, tes di-abort |
| Request HTTP | 6.017 | 2.556 |
| Request gagal | 0 | 120 |
| Error HTTP | 0% | 4,69% |
| Login p95 end-to-end | 262 ms | 236 ms |
| Mulai p95 end-to-end | 164 ms | 167 ms |
| Simpan jawaban p95 end-to-end | 75 ms | 136 ms |
| Selesai p95 end-to-end | 84 ms | Tidak diuji sampai akhir |
| Puncak RSS generator | 157 MiB | 242 MiB |
| Memori tersedia minimum | 5.583 MiB | 5.514 MiB |
| Kelulusan | Lulus semua threshold | Gagal; kenaikan dihentikan |

Seluruh 100 peserta yang selesai memperoleh nilai 100 sesuai kunci. Receipt,
replay identik, perubahan versi jawaban, resume, dan heartbeat lulus 100%.
Konfirmasi berasal dari API, bukan audit record database. Jendela aktivitas
lima menit lulus dengan toleransi sampling yang telah ditetapkan delapan detik.

Pada tahap 250, semua sesi berhasil dimulai, tetapi tes dihentikan setelah
sekitar satu menit sebelum jendela penyelesaian. Karena itu, nol peserta selesai
bukan bukti bahwa endpoint finalisasi gagal; endpoint tersebut belum diuji pada
tingkat ini. Dua pemeriksaan awal tambahan dengan tiga siswa juga lulus.

## Respons yang menyebabkan penghentian

| Endpoint | Respons | Content type | Jumlah |
| --- | --- | --- | ---: |
| Simpan jawaban | 403 | `text/html; charset=UTF-8` | 75 |
| Pemeriksaan sesi | 403 | `text/html; charset=UTF-8` | 45 |

Rentang error yang tercatat: 29 Oktober 2026 pukul **23.27.28–23.27.42 WIB**
(16.27.28–16.27.42 UTC). Rentang ini dapat dipakai pemilik infrastruktur untuk
mencocokkan penolakan dengan konfigurasi atau log miliknya.

Penolakan masih teramati pada beban yang lebih tinggi. Format HTML berbeda
dengan error otorisasi JSON pada backend lokal. Ini mengarah pada kemungkinan
penolakan proxy, WAF, rate limit, atau lapisan lain dalam jalur akses, tetapi
asal dan aturan penyebab belum terkonfirmasi. Tidak ada dasar untuk menyatakan
Cloud SQL atau web server kehabisan kapasitas hanya dari hasil ini. Latensi
di atas mencakup respons gagal, bukan hanya operasi yang berhasil.

Seluruh request berasal dari satu generator, sehingga pembagian siswa ke 100
sekolah bukan simulasi 100 alamat IP sekolah. Sebelum lanjut, cocokkan batas
akses dengan pola pengujian yang disepakati. Jangan memalsukan header IP atau
menonaktifkan perlindungan secara menyeluruh.

## Kelanjutan dan koreksi alat penguji

Run pertama `HTTP-20261029T161910053Z` menyelesaikan tahap 100 dengan seluruh
threshold lulus. Sesudah itu, operasi kontrol penutupan paket mengalami error
di runner: penanganan error native Fetch menggunakan `response.status()`
padahal status adalah properti. Error ini tidak mengubah metrik k6 tahap 100.
Status HTTP pemicu awal tidak tersimpan, sehingga tidak dapat dipastikan.

Runner diperbaiki untuk mempertahankan status HTTP serta memperbarui sesi
admin sekali bila menerima 401 dari otorisasi. Perubahan tidak menyentuh
middleware autentikasi aplikasi. Tiga tes lokal mencakup pembaruan token,
penolakan 403 tanpa retry, serta batas satu pembaruan sesi.

Paket tahap 100 ditutup melalui API dan dicatat pada `controlRecovery` di
laporan privat. Run kedua `HTTP-20261029T162640577Z` merekam `continuedFrom`
dan melanjutkan ke tahap 250 tanpa mengulang tahap 100 yang sudah lulus.
Commit dasar pengukuran pertama adalah `9091dfd`; run kelanjutan memakai
working tree dengan koreksi runner. Versi pada setiap VM GCP tidak diverifikasi.

## Penutupan dan batas kesimpulan

Keempat paket dari pengujian ulang ditutup. Sesi parsial tahap 250 ditutup
terpisah melalui API dengan beban rendah dan dicatat dalam `cleanup.json`;
penutupan tersebut bukan kelulusan benchmark. Data dummy tidak dihapus.

Artefak privat:

- `load-tests/results/HTTP-20261029T161910053Z/`
- `load-tests/results/HTTP-20261029T162640577Z/`

Folder berisi kredensial/kunci dan tidak dimasukkan Git. Pengujian membuktikan
alur HTTP 100 siswa pada kondisi serta durasi tersebut, bukan kapasitas maksimum,
ujian penuh, atau 10.000 browser. [Metode lengkap](LIVE_LOAD_TESTING.md).
