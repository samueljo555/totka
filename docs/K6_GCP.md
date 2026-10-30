# Menjalankan pengujian TOTKA dari VM GCP

Paket mandiri `totka-k6-gcp.tar.gz` memuat skrip k6, runner Node.js, 10.000
kredensial siswa dummy pada 100 sekolah, serta referensi 30 soal dummy yang
sudah tersedia di aplikasi. Tidak perlu clone aplikasi, npm install, akses
database, atau akses monitoring GCP. Kredensial admin tidak disertakan.

## 1. Siapkan VM generator terpisah

Gunakan VM Linux terpisah dari web server/Cloud SQL/Redis agar generator tidak
mengambil resource aplikasi. Pasang Node.js 22 atau lebih baru dan k6. Periksa:

```bash
node --version
k6 version
```

Instalasi k6 untuk Debian/Ubuntu, mengikuti [dokumentasi resmi](https://grafana.com/docs/k6/latest/set-up/install-k6/):

```bash
sudo apt-get update
sudo apt-get install -y curl gnupg ca-certificates
curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor --yes -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install -y k6
```

Skenario diuji menggunakan k6 2.3.0. Ketersediaan RAM/CPU generator tetap perlu
diamati; jumlah vCPU aplikasi bukan kapasitas generator. Nilai default target
GC Go adalah 4 GiB. Jika VM generator memiliki ruang memori yang cukup, batas
ini dapat disesuaikan lewat `LIVE_GENERATOR_GOMEMLIMIT`, misalnya `8GiB`.
Nilai itu bukan batas keras dan bukan jaminan mampu 10.000 VU.

## 2. Pindahkan dan ekstrak paket privat

Unduh arsip dan file `.sha256` yang diberikan, lalu pindahkan ke VM generator
melalui SCP atau mekanisme transfer berkas Anda. Isi arsip termasuk password
siswa dummy; jangan taruh di folder web publik atau repository Git.

```bash
umask 077
sha256sum -c totka-k6-gcp.tar.gz.sha256
tar -xzf totka-k6-gcp.tar.gz
cd totka-k6-gcp
cp admin-login.example.json admin-login.json
chmod 600 admin-login.json
nano admin-login.json
```

Isi username dan password admin yang berlaku pada file itu. Jangan memakai
akun admin yang sama pada pengujian lain secara bersamaan; login lain dapat
mengganti sesi, meskipun runner dapat memperbaruinya sekali.

## 3. Pilih jalur pengujian

**Default: domain publik melalui load balancer**

```bash
./run.sh smoke
./run.sh full
```

Target default `https://naingsima.my.id`. Walaupun generator ada di GCP,
permintaan ke domain publik tetap mengikuti jalur load balancer dan kebijakan
yang berlaku. Lokasi generator saja tidak menjamin hilangnya HTTP 403.
Cloud Armor dapat memfilter permintaan sebelum backend berdasarkan atribut
request: [dokumentasi Cloud Armor](https://docs.cloud.google.com/armor/docs/security-policy-overview).

**Opsional: endpoint aplikasi internal yang Anda kelola**

```bash
LIVE_TARGET_URL=http://10.128.0.10:3001 ./run.sh smoke
LIVE_TARGET_URL=http://10.128.0.10:3001 ./run.sh full
```

Alamat dan port di atas hanya contoh. Gunakan IP/port backend yang bisa
diakses VM generator dan mengarah ke aplikasi dengan database/fixture yang
sama. Isi origin saja, tanpa `/api`; runner menambahkannya sendiri. Endpoint
harus benar-benar melayani API dan tidak mengalihkan kembali ke domain publik.
Jangan mengubah aturan Cloud Armor hanya untuk menjalankan skrip ini.

Pengujian langsung satu web VM hanya mengukur jalur VM tersebut, bukan
keseluruhan tiga web server, load balancer publik, dan Cloud Armor. Jika memakai
internal load balancer, hasil mewakili jalur internal beserta konfigurasi yang
melekat padanya. Simpan hasil internal dan publik sebagai pengujian berbeda.
Tidak ada pemalsuan header IP atau penonaktifan verifikasi TLS pada skrip.

## 4. Tahapan dan durasi

`smoke` hanya menjalankan 3 siswa selama 10 detik aktivitas. `full` selalu
memulai dari smoke lalu menaikkan beban:

| Siswa bersamaan | Aktivitas |
| ---: | ---: |
| 100 | 5 menit |
| 250 | 5 menit |
| 500 | 5 menit |
| 1.000 | 5 menit |
| 2.500 | 5 menit |
| 5.000 | 5 menit |
| 7.500 | 5 menit |
| 10.000 | 10 menit |

Aktivitas total 45 menit, di luar login bertahap dan penyelesaian. Estimasi
pelaksanaan 70–90 menit adalah perkiraan; kegagalan dapat menghentikannya lebih
awal. Setiap percobaan membuat paket baru sehingga sesi selesai tidak dipakai
ulang. Soal dan akun dummy yang ada digunakan kembali.

Untuk memeriksa satu tingkat saja, tetap didahului smoke:

```bash
./run.sh stage 250
```

Jangan menjalankan dua generator menggunakan akun yang sama bersamaan karena
sesi login dapat saling menggantikan. Satu VM generator juga berarti satu jalur
keluar jaringan, bukan 100 IP sekolah berbeda.

## 5. Membaca hasil dan menghentikan pengujian

Progress muncul setiap sekitar 30 detik. Hasil berada di:

```text
load-tests/results/HTTP-<waktu>/report.json
load-tests/results/HTTP-<waktu>/<tahap>-summary.json
load-tests/results/HTTP-<waktu>/<tahap>-k6.log
load-tests/results/HTTP-<waktu>/<tahap>-generator.jsonl
```

Ringkasan kelulusan ada pada `report.json`: `complete`, `stages[].passed`,
`completed`, `httpErrorRate`, `endpointLatency`, `thresholdFailures`, dan
`generatorError`. HTTP 403 tidak diulang, tahap gagal menghentikan kenaikan,
dan exit code bukan nol menandakan gagal. Kekurangan resource generator tidak
boleh disimpulkan sebagai batas kapasitas aplikasi.

Gunakan `Ctrl+C` untuk berhenti. Runner berusaha menutup paket aktif. Jika
proses dihentikan paksa, periksa paket dummy secara manual. Penutupan paket
tidak mengakhiri sesi yang sudah aktif; sesi parsial mengikuti deadline ujian
60 menit dan sweeper aplikasi. Data dummy tidak dihapus otomatis. Jangan
menghitung penyelesaian sesi setelah abort sebagai peserta benchmark lulus.

Folder hasil juga berisi salinan kredensial dan kunci privat. Untuk berbagi
hasil analisis, kirim `report.json`, `*-summary.json`, dan `*-k6.log` yang sudah
ditinjau, bukan seluruh folder `data/` atau folder hasil. Pengujian ini tidak
mengakses monitoring GCP atau mengaudit semua record database.

## Membuat ulang arsip dari workspace asal

Bagian ini untuk workspace yang memiliki fixture privat hasil persiapan:

```bash
npm --prefix backend run build
LIVE_QUESTION_SOURCE_FILE=/secure/source-questions.json \
LIVE_REUSE_QUESTIONS_DIR=/secure/previous-result \
node backend/scripts/export-live-load-kit.mjs
```

Exporter hanya membaca/menulis file lokal dan membuat arsip, tanpa menghubungi
website atau membuat data baru. Arsip disimpan di `load-tests/results/gcp-kit-*`
yang diabaikan Git. `kit-version.json` mencatat commit dan hash skrip.
