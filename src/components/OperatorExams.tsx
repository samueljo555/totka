import { useEffect, useState } from 'react';
import { TableFrame, StatusBadge, SortableHeading, TableState } from './TableFrame';
import { ReportTable } from './ReportTable';
import { Pagination } from './Pagination';
import { FilterBar } from './FilterBar';
import { useDebounced, usePagedList, readJson } from '../lib/paging';

export function OperatorExams({ history }: { history: boolean }) {
  return history ? <ReportTable kind="history" /> : <MonitoringExams />;
}
function MonitoringExams() {
  const [pageSize, setPageSize] = useState(10), [studentPageSize, setStudentPageSize] = useState(10);
  const [page, setPage] = useState(1), [studentPage, setStudentPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState(''), [packageSearch, setPackageSearch] = useState('');
  const [className, setClassName] = useState(''), [status, setStatus] = useState('');
  const [sort, setSort] = useState('name_asc'), [studentSort, setStudentSort] = useState('name_asc');
  const [classes, setClasses] = useState<string[]>([]);
  const query = useDebounced(search), packageQuery = useDebounced(packageSearch);
  const packages = usePagedList<any>('/api/monitoring/packages', page, pageSize, { status: 'aktif', search: packageQuery, sort });
  const students = usePagedList<any>(`/api/monitoring/packages/${selected?.id}/students`, studentPage, studentPageSize, { search: query, className, status, sort: studentSort }, !!selected);
  useEffect(() => {
    const controller = new AbortController();
    readJson<string[]>('/api/users/classes', controller.signal).then(setClasses).catch(() => {});
    return () => controller.abort();
  }, []);
  const reloadPackages = packages.reload, reloadStudents = students.reload;
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void reloadPackages(); if (selected) void reloadStudents();
    }, 15000);
    return () => clearInterval(timer);
  }, [reloadPackages, reloadStudents, selected]);
  const current = packages.items.find(pkg => pkg.id === selected?.id) || selected;
  return <section className="glass-panel p-8">
    <div className="report-heading"><div><h2>{selected ? current.name : 'Pantau Ujian'}</h2><p>{selected ? 'Status pengerjaan siswa pada paket terpilih.' : 'Paket aktif dan partisipasi siswa di sekolah Anda.'}</p></div><div className="table-row-actions">{selected && <button className="btn-secondary" onClick={() => setSelected(null)}>Kembali ke paket</button>}<button className="btn-secondary" onClick={() => { void packages.reload(); if (selected) void students.reload(); }}>Perbarui</button></div></div>
    {!selected ? <>
      <div className="report-filters"><FilterBar searchValue={packageSearch} onSearchChange={value => { setPackageSearch(value); setPage(1); }} searchPlaceholder="Cari nama paket aktif..." /></div>
      <TableFrame total={packages.total} pageSize={pageSize} onPageSize={value => { setPageSize(value); setPage(1); }} sort={sort} onSort={value => { setSort(value); setPage(1); }} label="Paket aktif">
        <table><thead><tr><SortableHeading title="Paket Ujian" sort={sort} onSort={value => { setSort(value); setPage(1); }} /><th scope="col">Mata Pelajaran</th><th scope="col">Token</th><th scope="col" className="numeric">Belum Mulai</th><th scope="col" className="numeric">Berlangsung</th><th scope="col" className="numeric">Selesai</th><th scope="col">Aksi</th></tr></thead><tbody>
          {packages.loading || packages.error ? <TableState columns={7} loading={packages.loading} error={packages.error} retry={() => void packages.reload()} /> : !packages.items.length ? <tr><td colSpan={7}><div className="table-empty">Belum ada paket aktif sesuai pencarian.</div></td></tr> : packages.items.map(pkg => <tr key={pkg.id}><td><strong className="table-primary">{pkg.name}</strong><small className="table-secondary">Paket aktif</small></td><td><span className="tag">{pkg.mapel}</span></td><td><strong className="table-mono">{pkg.token || '—'}</strong></td><td className="numeric">{pkg.notStarted}</td><td className="numeric">{pkg.ongoing}</td><td className="numeric">{pkg.finished}</td><td><button className="btn-secondary" onClick={() => { setSelected(pkg); setStudentPage(1); setSearch(''); setClassName(''); setStatus(''); }}>Lihat peserta</button></td></tr>)}
        </tbody></table>
      </TableFrame><Pagination page={page} pageSize={pageSize} total={packages.total} onChange={setPage} loading={packages.loading} />
    </> : <>
      <div className="report-stats">{[['Belum Mulai', current.notStarted], ['Sedang Mengerjakan', current.ongoing], ['Selesai', current.finished]].map(([label, value]) => <div className="report-stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
      <p className="table-caption">Token paket: <strong className="table-mono">{current.token || '—'}</strong></p>
      <div className="report-filters"><FilterBar searchValue={search} onSearchChange={value => { setSearch(value); setStudentPage(1); }} filterValue={className} onFilterChange={value => { setClassName(value); setStudentPage(1); }} filterOptions={classes} onReset={() => { setStatus(''); setStudentPage(1); }}>
        <select className="input-field" aria-label="Status ujian" value={status} onChange={event => { setStatus(event.target.value); setStudentPage(1); }}><option value="">Semua status</option><option value="belum">Belum Mulai</option><option value="sedang_mengerjakan">Sedang Mengerjakan</option><option value="selesai">Selesai</option></select>
      </FilterBar></div>
      <TableFrame total={students.total} pageSize={studentPageSize} onPageSize={value => { setStudentPageSize(value); setStudentPage(1); }} sort={studentSort} onSort={value => { setStudentSort(value); setStudentPage(1); }} label="Peserta ujian">
        <table><thead><tr><th scope="col">NISN</th><SortableHeading title="Nama Siswa" sort={studentSort} onSort={value => { setStudentSort(value); setStudentPage(1); }} /><th scope="col">Kelas</th><th scope="col">Status Pengerjaan</th></tr></thead><tbody>
          {students.loading || students.error ? <TableState columns={4} loading={students.loading} error={students.error} retry={() => void students.reload()} /> : !students.items.length ? <tr><td colSpan={4}><div className="table-empty">Tidak ada siswa yang sesuai filter.</div></td></tr> : students.items.map(student => <tr key={student.id}><td className="table-mono">{student.nisn || '—'}</td><td><strong className="table-primary">{student.fullName}</strong></td><td>{student.className || '—'}</td><td><StatusBadge value={student.session?.status === 'selesai' ? 'Selesai' : !student.session ? 'Belum Mulai' : student.session.status === 'sedang_mengerjakan' ? 'Sedang Mengerjakan' : 'Status Lain'} /></td></tr>)}
        </tbody></table>
      </TableFrame><Pagination page={studentPage} total={students.total} pageSize={studentPageSize} onChange={setStudentPage} loading={students.loading} />
    </>}
    <p className="table-caption">Data diperbarui otomatis setiap 15 detik ketika halaman terlihat.</p>
  </section>;
}
