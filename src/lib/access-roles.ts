import { BookOpen, Grid2X2, PenLine, School } from 'lucide-react';

export const accessRoles = [
  { id: 'siswa', title: 'Siswa', description: 'Kerjakan try out menggunakan akun dan token dari sekolah.', icon: BookOpen },
  { id: 'operator', title: 'Operator Sekolah', description: 'Kelola siswa, cetak kartu login, dan pantau ujian.', icon: School },
  { id: 'guru', title: 'Guru Penulis', description: 'Siapkan soal, bacaan, gambar, dan rumus matematika.', icon: PenLine },
  { id: 'super_admin', title: 'Super Admin', description: 'Kelola akun, sekolah, paket, serta analitik hasil.', icon: Grid2X2 },
] as const;

export function accountDestination(role: string): string | null {
  if (role === 'admin' || role === 'super_admin') return '/admin';
  if (role === 'siswa' || role === 'operator' || role === 'guru') return `/${role}`;
  return null;
}
