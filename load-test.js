import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

// --- KONFIGURASI LOAD TEST ---
export const options = {
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% request harus selesai di bawah 2 detik
    http_req_failed: ['rate<0.01'],    // Error rate tidak boleh lebih dari 1%
  },
};

// Pastikan ini adalah IP Public / Domain GCP Anda
const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';
const EXAM_TOKEN = __ENV.EXAM_TOKEN || 'SIMULASI123'; // Token ujian aktif

export default function (data) {
  // 1. Ambil nomor identitas VU (Virtual User) untuk login
  // k6 VU id dimulai dari 1. Kita punya siswa1 sampai siswa10000
  const studentId = (__VU % 10000) + 1; 
  const username = `siswa${studentId}`;
  const password = '123456';

  // --- LOGIN ---
  let res = http.post(`${BASE_URL}/login`, JSON.stringify({
    username: username,
    password: password
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'login berhasil': (r) => r.status === 200,
  });

  if (res.status !== 200) {
    sleep(1);
    return; // Jika gagal login, coba lagi nanti (abort iterasi ini)
  }

  const userObj = res.json('user');
  
  const authHeaders = {
    headers: {
      'Content-Type': 'application/json'
    }
  };

  // Simulasi baca petunjuk ujian
  sleep(Math.random() * 2 + 1);

  // --- START EXAM ---
  res = http.post(`${BASE_URL}/sessions/start`, JSON.stringify({
    studentId: userObj.id,
    token: EXAM_TOKEN
  }), authHeaders);

  check(res, {
    'ujian dimulai': (r) => r.status === 200,
    'dapat sessionId': (r) => r.json('session.id') !== undefined,
  });

  if (res.status !== 200) {
    sleep(2);
    return; // Mungkin token salah atau ujian belum aktif
  }

  const sessionId = res.json('session.id');
  const questions = res.json('questions') || [];

  // --- MENGERJAKAN SOAL (Satu per satu) ---
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    
    // Waktu berpikir/membaca soal (5 hingga 15 detik per soal)
    // Dipercepat agar script tidak terlalu lama untuk simulasi
    sleep(Math.random() * 5 + 2); 

    // Pilih jawaban ngawur (opsi A/B/C/D)
    // Format jawaban disesuaikan dengan skema PG
    const answerPayload = {
      questionId: q.id,
      answerData: { selected: "A" } 
    };

    let ansRes = http.post(`${BASE_URL}/sessions/${sessionId}/answer`, JSON.stringify(answerPayload), authHeaders);
    
    check(ansRes, {
      'submit jawaban OK': (r) => r.status === 200,
    });
  }

  // --- SELESAI UJIAN ---
  res = http.post(`${BASE_URL}/sessions/${sessionId}/finish`, JSON.stringify({}), authHeaders);
  
  check(res, {
    'ujian selesai OK': (r) => r.status === 200,
  });

  // Istirahat sebelum user ini mengulang (walau jarang terjadi user ujian berkali-kali)
  sleep(10);
}
