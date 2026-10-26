// CSV stores identifiers verbatim; spreadsheet applications may infer numeric types.
export function serializeCsv(rows: unknown[][]): string {
  return rows.map(row => row.map(value => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',')).join('\r\n') + '\r\n';
}

interface AnalyticsStudent {
  nisn?: string | null; studentName: string; npsn?: string | null; school?: string | null;
  score?: number | null; startTime?: string | null; endTime?: string | null; status: string;
  elementBreakdown?: Record<string, { correct: number; total: number }>;
}
export function analyticsCsv(students: AnalyticsStudent[], includeSchool: boolean): string {
  const header = ['NISN', 'Nama Siswa', 'NPSN', ...(includeSchool ? ['Sekolah'] : []), 'Skor Total', 'Lama Mengerjakan (Menit)', 'Status', 'Catatan'];
  return serializeCsv([header, ...students.map(student => {
    const elapsed = student.startTime && student.endTime ? Math.round((Date.parse(student.endTime) - Date.parse(student.startTime)) / 60000) : null;
    const notes = Object.entries(student.elementBreakdown || {}).map(([name, value]) => `${name}: ${value.correct}/${value.total}`).join(', ');
    return [student.nisn, student.studentName, student.npsn, ...(includeSchool ? [student.school] : []), student.score ?? 'Belum tersedia', elapsed !== null && Number.isFinite(elapsed) ? elapsed : '', student.status, notes];
  })]);
}

export function downloadCsv(csv: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
