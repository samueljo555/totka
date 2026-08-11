# Spesifikasi Menu "Analisis Hasil"
### Website Try Out SD — Bahasa Indonesia & Matematika

> Skema: **1 Paket Try Out = 1 Mata Pelajaran**

---

## 1. Informasi Umum Pengerjaan

- Nama paket try out
- Mata pelajaran
- Tanggal & waktu pengerjaan
- Durasi pengerjaan (waktu terpakai vs waktu tersedia)
- Status (selesai tepat waktu / waktu habis)

---

## 2. Ringkasan Skor

- Skor akhir (misal: 78/100)
- Jumlah soal benar
- Jumlah soal salah
- Jumlah soal tidak dijawab/kosong
- Status kelulusan (Lulus/Tidak, jika ada KKM/passing grade)
- Predikat kualitatif (misal: Sangat Baik / Baik / Cukup / Perlu Latihan)

---

## 3. Breakdown per Sub-topik/Kategori

- Persentase benar untuk tiap sub-topik (bar chart atau radar chart)
- Urutkan dari nilai terendah ke tertinggi agar kelemahan langsung terlihat

**Contoh sub-topik Matematika:**
- Bilangan & operasi hitung
- Pecahan
- Geometri & pengukuran
- Soal cerita

**Contoh sub-topik Bahasa Indonesia:**
- Membaca pemahaman
- Tata bahasa (EYD)
- Kosakata
- Menulis/mengarang

---

## 4. Review Butir Soal (Detail per Nomor)

- Nomor soal & pertanyaan
- Jawaban siswa vs kunci jawaban
- Status (benar/salah/kosong) — biasanya pakai warna (hijau/merah/abu)
- Pembahasan/penjelasan jawaban (kalau tersedia)
- Sub-topik dari soal tersebut

---

## 5. Perbandingan *(opsional, nilai tambah)*

- Skor siswa vs rata-rata seluruh peserta yang mengerjakan paket sama
- Skor siswa vs nilai tertinggi
- Ranking siswa (jika fitur kompetitif diinginkan)

---

## 6. Rekomendasi Belajar

- Saran otomatis berdasarkan sub-topik dengan skor terendah
  - Contoh: *"Kamu perlu latihan lebih di topik Pecahan (skor 40%)"*
- Bisa ditambah link ke materi/latihan soal terkait topik tersebut

---

## 7. Riwayat & Progress *(jika siswa pernah mengerjakan paket lain)*

- Grafik tren skor dari waktu ke waktu
- Perbandingan skor try out saat ini dengan try out sebelumnya (naik/turun)

---

## 8. Aksi Tambahan

- Tombol **Download/Cetak Hasil (PDF)** — berguna untuk orang tua/guru
- Tombol **Kerjakan Ulang** atau **Coba Paket Lain**
- Tombol **Kembali ke Riwayat Try Out**

---

## Prioritas Pengembangan (MVP)

| Tahap | Bagian |
|---|---|
| **Wajib (MVP)** | 1. Informasi Umum, 2. Ringkasan Skor, 3. Breakdown Sub-topik, 4. Review Butir Soal |
| **Lanjutan** | 5. Perbandingan, 6. Rekomendasi Belajar, 7. Riwayat & Progress, 8. Aksi Tambahan |

---

## Referensi Struktur Data (opsional)

```
paket_try_out   (id, nama, mapel, jumlah_soal, durasi_menit)
soal            (id, paket_id, sub_topik, pertanyaan, kunci_jawaban)
hasil_pengerjaan(id, siswa_id, paket_id, waktu_mulai, waktu_selesai, skor)
detail_jawaban  (id, hasil_id, soal_id, jawaban_siswa, status)
```
