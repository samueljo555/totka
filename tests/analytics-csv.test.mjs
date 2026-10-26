import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeCsv, analyticsCsv } from '../.test-build/analytics-csv.js';

test('CSV escapes commas, quotes and both newline styles without changing identifiers', () => {
  assert.equal(serializeCsv([['001234', 'A, B', 'Dia "B"', 'dua\nbaris', 'CR\rLF\r\n', null, 0]]), '001234,"A, B","Dia ""B""","dua\nbaris","CR\rLF\r\n",,0\r\n');
});
test('analytics preserves zero and distinguishes unavailable scores in both exports', () => {
  const row = { nisn: '000123', studentName: 'Nama, "A"\nB', npsn: '001', school: 'Sekolah, A', score: 0, startTime: '2026-01-01T00:00:00Z', endTime: '2026-01-01T00:00:00Z', status: 'Selesai', elementBreakdown: { 'Elemen, "1"': { correct: 0, total: 2 } } };
  const full = analyticsCsv([row, { ...row, score: null, nisn: null, startTime: null }], true);
  assert.ok(full.includes('000123,"Nama, ""A""\nB",001,"Sekolah, A",0,0,Selesai,"Elemen, ""1"": 0/2"'));
  assert.ok(full.includes(',Belum tersedia,,Selesai,'));
  assert.equal(analyticsCsv([], false), 'NISN,Nama Siswa,NPSN,Skor Total,Lama Mengerjakan (Menit),Status,Catatan\r\n');
  assert.ok(!analyticsCsv([row], false).includes('Sekolah, A'));
});
test('invalid timestamps do not leak NaN into exports', () => {
  assert.ok(!analyticsCsv([{ studentName: 'A', status: 'Selesai', startTime: 'invalid', endTime: 'invalid' }], false).includes('NaN'));
});
