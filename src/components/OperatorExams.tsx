import { useEffect, useState } from 'react';
import { Pagination } from './Pagination';
import { FilterBar } from './FilterBar';
import { useDebounced, usePagedList, readJson } from '../lib/paging';

export function OperatorExams({ history }: { history: boolean }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [studentPage, setStudentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [className, setClassName] = useState('');
  const [status, setStatus] = useState('');
  const [classes, setClasses] = useState<string[]>([]);
  const query = useDebounced(search);
  const packages = usePagedList<any>('/api/monitoring/packages', page, 20, { status: history ? 'history' : 'aktif' });
  const students = usePagedList<any>(`/api/monitoring/packages/${selected?.id}/students`, studentPage, 50, { search: query, className, status }, !!selected);
  useEffect(() => { readJson<string[]>('/api/users/classes').then(setClasses).catch(() => {}); }, []);
  const reloadPackages = packages.reload, reloadStudents = students.reload;
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void reloadPackages();
      if (selected) void reloadStudents();
    }, 15000);
    return () => clearInterval(timer);
  }, [reloadPackages, reloadStudents, selected]);
  const current = packages.items.find(pkg => pkg.id === selected?.id) || selected;
  const counts = (pkg: any) => <div className="flex gap-4 mt-4" style={{ flexWrap: 'wrap' }}>
    <span>Belum mulai: <strong>{pkg.notStarted}</strong></span>
    <span>Mengerjakan: <strong>{pkg.ongoing}</strong></span>
    <span>Selesai: <strong>{pkg.finished}</strong></span>
    {history && <span>Rata-rata peserta selesai: <strong>{Number(pkg.averageScore).toFixed(2)}</strong> · Tertinggi: {Number(pkg.highestScore).toFixed(2)} · Terendah: {Number(pkg.lowestScore).toFixed(2)}</span>}
  </div>;
  return <div className="glass-panel p-8">
    <div className="flex justify-between items-center mb-6">
      <h2>{selected ? current.name : history ? 'Riwayat Ujian' : 'Pantau Ujian'}</h2>
      {selected && <button className="btn-secondary" onClick={() => setSelected(null)}>Kembali ke paket</button>}
      <button className="btn-secondary" onClick={() => { void packages.reload(); if (selected) void students.reload(); }}>Perbarui</button>
    </div>
    {(packages.loading || students.loading) && <p role="status">Memuat data...</p>}
    {(packages.error || students.error) && <p role="alert">{packages.error || students.error}</p>}
    {!selected ? <>
      {!packages.loading && packages.items.length === 0 && <p>Belum ada paket untuk ditampilkan.</p>}
      {packages.items.map(pkg => <div key={pkg.id} className="card mb-4" style={{ border: '1px solid #e2e8f0', padding: '1.5rem' }}>
        <h3>{pkg.name}</h3><p>{pkg.mapel} · {pkg.status}</p>
        {!history && <p>Token: <strong style={{ letterSpacing: '1px' }}>{pkg.token || '-'}</strong></p>}
        {counts(pkg)}
        <button className="btn-secondary mt-4" onClick={() => { setSelected(pkg); setStudentPage(1); setSearch(''); setClassName(''); setStatus(''); }}>Lihat peserta</button>
      </div>)}
      <Pagination page={page} pageSize={20} total={packages.total} onChange={setPage} loading={packages.loading} />
    </> : <>
      {counts(current)}
      <div className="mt-6"><FilterBar searchValue={search} onSearchChange={value => { setSearch(value); setStudentPage(1); }} filterValue={className} onFilterChange={value => { setClassName(value); setStudentPage(1); }} filterOptions={classes}>
        <select className="input-field" aria-label="Status ujian" value={status} onChange={event => { setStatus(event.target.value); setStudentPage(1); }}>
          <option value="">Semua status</option><option value="belum">Belum mulai</option><option value="sedang_mengerjakan">Mengerjakan</option><option value="selesai">Selesai</option>
        </select>
      </FilterBar></div>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead><tr><th className="p-4">NISN</th><th className="p-4">Nama siswa</th><th className="p-4">Kelas</th><th className="p-4">Status</th>{history && <th className="p-4">Nilai</th>}</tr></thead>
        <tbody>{students.items.map(student => <tr key={student.id} style={{ borderTop: '1px solid #e2e8f0' }}>
          <td className="p-4">{student.nisn || student.username}</td><td className="p-4">{student.fullName}</td><td className="p-4">{student.className || '-'}</td>
          <td className="p-4">{student.session?.status === 'selesai' ? 'Selesai' : student.session ? 'Mengerjakan' : 'Belum mulai'}</td>
          {history && <td className="p-4">{student.session?.status === 'selesai' ? student.session.totalScore : '-'}</td>}
        </tr>)}</tbody>
      </table>
      {!students.loading && students.items.length === 0 && <p>Tidak ada siswa yang sesuai dengan filter.</p>}
      <Pagination page={studentPage} total={students.total} pageSize={50} onChange={setStudentPage} loading={students.loading} />
    </>}
  </div>;
}
