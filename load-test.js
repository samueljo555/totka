import http from 'k6/http';
import { check, sleep } from 'k6';

// --- KONFIGURASI LOAD TEST ---
export const options = {
  // Anda bebas menimpa ini dari terminal menggunakan flag, misal:
  // k6 run --stage 2m:2000,3m:5000,2m:10000,3m:10000 ...
  // Namun ini adalah baseline default jika dijalankan tanpa argumen tambahan:
  stages: [
    { duration: '30s', target: 50 },   // naik pelan ke 50 VU
    { duration: '30s', target: 100 },  // naik ke 100 VU
    { duration: '1m', target: 100 },   // tahan di 100 VU
    { duration: '30s', target: 0 },    // turun pelan (graceful stop)
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% request harus selesai di bawah 2 detik
    http_req_failed: ['rate<0.01'],    // Error rate tidak boleh lebih dari 1%
  },
};

// Pastikan ini adalah IP Public / Domain GCP Anda
const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';
const EXAM_TOKEN = __ENV.EXAM_TOKEN || 'SIMULASI123'; // Token ujian aktif

export default function () {
  // 1. Ambil nomor identitas VU (Virtual User) untuk login
  // k6 VU id dimulai dari 1. Kita punya siswa1 sampai siswa10000
  const studentId = ((__VU - 1) % 10000) + 1;
  const username = `siswa${studentId}`;
  const password = '123456';

  // --- LOGIN ---
  let res = http.post(`${BASE_URL}/login`, JSON.stringify({
    username: username,
    password: password
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const loginOk = check(res, {
    'login berhasil': (r) => r.status === 200,
  });

  if (!loginOk) {
    // Catat detail error supaya kita tahu PENYEBABNYA, bukan cuma "gagal".
    // Lihat hasil ini lewat --console-output atau summary k6.
    console.error(
      `[LOGIN GAGAL] user=${username} status=${res.status} ` +
      `body=${res.body ? res.body.substring(0, 200) : '(kosong)'}`
    );
    // Backoff acak 2-5 detik, supaya VU tidak langsung "menabrak" server
    // yang sedang kewalahan berkali-kali tanpa jeda.
    sleep(Math.random() * 3 + 2);
    return;
  }

  const userObj = res.json('user');

  // Ambil token dari response login, jika backend menggunakan JWT/Bearer.
  // Aplikasi saat ini tidak mengeluarkan JWT, namun fallback ini aman dipakai.
  const token = res.json('token');

  const authHeaders = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  };

  // Simulasi baca petunjuk ujian
  sleep(Math.random() * 2 + 1);

  // --- START EXAM ---
  res = http.post(`${BASE_URL}/sessions/start`, JSON.stringify({
    studentId: userObj.id,
    token: EXAM_TOKEN
  }), authHeaders);

  const examStartOk = check(res, {
    'ujian dimulai': (r) => r.status === 200,
    'dapat sessionId': (r) => r.json('session.id') !== undefined,
  });

  if (!examStartOk) {
    console.error(
      `[START EXAM GAGAL] user=${username} status=${res.status} ` +
      `body=${res.body ? res.body.substring(0, 200) : '(kosong)'}`
    );
    sleep(2);
    return; // Mungkin token salah atau ujian belum aktif
  }

  const sessionId = res.json('session.id');
  const questions = res.json('questions') || [];
  const existingAnswers = res.json('existingAnswers') || [];
  const expectedAnswers = [];
  if (res.json('session.status') === 'selesai') { sleep(10); return; }

  // --- MENGERJAKAN SOAL (Satu per satu) ---
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    // Waktu berpikir/membaca soal (dipercepat untuk simulasi)
    sleep(Math.random() * 5 + 2);

    const answerPayload = {
      questionId: q.id,
      answerData: q.type === 'Pilihan Ganda Kompleks' ? [0] : q.type === 'Pilihan Ganda Kompleks Kategori' ? q.options.map(() => 0) : 0,
      version: (existingAnswers.find(a => a.questionId === q.id)?.version || 0) + 1,
      mutationId: `${Date.now()}-${__VU}-${__ITER}-${i}`
    };

    let ansRes = http.post(
      `${BASE_URL}/sessions/${sessionId}/answer`,
      JSON.stringify(answerPayload),
      authHeaders
    );

    const answerOk = check(ansRes, {
      'submit jawaban OK': (r) => r.status === 200,
    });

    if (answerOk) {
      expectedAnswers.push({ questionId: q.id, version: ansRes.json('version'), mutationId: ansRes.json('mutationId') });
    }
    if (!answerOk) {
      console.error(
        `[SUBMIT JAWABAN GAGAL] user=${username} soal=${i + 1} ` +
        `status=${ansRes.status} body=${ansRes.body ? ansRes.body.substring(0, 200) : '(kosong)'}`
      );
    }
  }

  // --- SELESAI UJIAN ---
  if (expectedAnswers.length !== questions.length) { sleep(10); return; }
  res = http.post(`${BASE_URL}/sessions/${sessionId}/finish`, JSON.stringify({ expectedAnswers }), authHeaders);

  const finishOk = check(res, {
    'ujian selesai OK': (r) => r.status === 200,
  });

  if (!finishOk) {
    console.error(
      `[FINISH GAGAL] user=${username} status=${res.status} ` +
      `body=${res.body ? res.body.substring(0, 200) : '(kosong)'}`
    );
  }

  // Istirahat sebelum user ini mengulang
  sleep(10);
}
