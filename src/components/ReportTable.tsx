import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownUp, Download, RotateCcw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { FormattedContent } from './FormattedContent';
import { contentText } from '../../backend/rich-content';
import { readAllPages, readJson, useDebounced, usePagedList } from '../lib/paging';
import { analyticsCsv, downloadCsv, serializeCsv } from '../lib/analytics-csv';
import { TableFrame, StatusBadge } from './TableFrame';
import { Pagination } from './Pagination';
import { PackageFilter } from './PackageFilter';
import { RemoteSelect } from './RemoteSelect';
import { useRemoteData } from '../lib/useRemoteData';

type Kind = 'students' | 'items' | 'schools' | 'history';
type Row = Record<string, any>;
const validSummary = (data: any) => !!data?.summary && Array.isArray(data.schools);
const number = (value: unknown, decimals = 0) => value == null ? 'Belum tersedia' : Number(value).toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const labels = { students: 'Hasil siswa', items: 'Analisis butir soal', schools: 'Hasil per sekolah', history: 'Riwayat ujian' };

export function AnalyticsReports() {
  const [kind, setKind] = useState<Kind>('students');
  const [scope, setScope] = useState({ packageId: '', school: '', packageName: '' });
  return <div className="analytics-reports"><nav className="report-tabs" aria-label="Jenis analitik">{(['students', 'items', 'schools'] as const).map(key => <button key={key} aria-current={kind === key ? 'page' : undefined} onClick={() => { setScope({ packageId: '', school: '', packageName: '' }); setKind(key); }}>{labels[key]}</button>)}</nav><ReportTable key={`${kind}:${scope.packageId}:${scope.school}`} kind={kind} initialPackage={scope.packageId} initialSchool={scope.school} initialPackageName={scope.packageName} onSchoolStudents={kind === 'schools' ? row => { setScope({ packageId: row.packageId, school: row.npsn, packageName: row.packageName }); setKind('students'); } : undefined} /></div>;
}

export function ReportTable({ kind, initialPackage = '', initialSchool = '', initialPackageName = '', onSchoolStudents }: { kind: Kind; initialPackage?: string; initialSchool?: string; initialPackageName?: string; onSchoolStudents?: (row: Row) => void }) {
  const [packageId, setPackageId] = useState(initialPackage), [schoolNpsn, setSchool] = useState(initialSchool);
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [className, setClass] = useState(''), [category, setCategory] = useState('');
  const [sort, setSort] = useState('name_asc'), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const [classes, setClasses] = useState<string[]>([]), [classesError, setClassesError] = useState(''), [classRetry, setClassRetry] = useState(0);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const query = useDebounced(search), isStudent = kind === 'students' || kind === 'history';
  const url = kind === 'history' ? '/api/monitoring/history' : `/api/analytics/reports/${kind}`;
  const params = { packageId, schoolNpsn, search: query, status, className, category, sort };
  const list = usePagedList<Row>(url, page, pageSize, params);
  const summary = useRemoteData<any>(kind === 'students' && packageId ? `/api/analytics/packages/${encodeURIComponent(packageId)}` : null, validSummary);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!isStudent) return;
    const abort = new AbortController(); let active = true;
    setClasses([]); setClassesError('');
    readJson<string[]>('/api/users/classes' + (schoolNpsn ? `?schoolNpsn=${encodeURIComponent(schoolNpsn)}` : ''), abort.signal)
      .then(data => { if (!Array.isArray(data)) throw new Error('Format daftar kelas tidak sesuai.'); if (active) setClasses(data); })
      .catch(error => { if (active) setClassesError(error instanceof Error ? error.message : 'Gagal memuat kelas.'); });
    return () => { active = false; abort.abort(); };
  }, [isStudent, schoolNpsn, classRetry]);
  const reset = () => { setPackageId(''); setSchool(''); setSearch(''); setStatus(''); setClass(''); setCategory(''); setSort('name_asc'); setPage(1); };
  const exportCsv = async () => {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort; setProgress({ loaded: 0, total: 0 });
    try {
      const rows = await readAllPages<Row>(url, params, { signal: abort.signal, onProgress: (loaded, total) => { if (!abort.signal.aborted) setProgress({ loaded, total }); } });
      abort.signal.throwIfAborted();
      let csv: string;
      if (isStudent) csv = analyticsCsv(rows as any, true, true);
      else if (kind === 'schools') csv = serializeCsv([['Paket Try Out', 'Mata Pelajaran', 'NPSN', 'Sekolah', 'Total Akun Siswa', 'Sudah Mulai', 'Sedang Mengerjakan', 'Selesai', 'Belum Mulai', 'Status Lain', 'Rata-rata'], ...rows.map(r => [r.packageName, r.mapel, r.npsn === 'UNKNOWN' ? '' : r.npsn, r.name, r.totalStudents, r.startedCount, r.ongoingCount, r.finishedCount, r.notStartedCount, r.otherCount, r.score ?? 'Belum tersedia'])]);
      else csv = serializeCsv([['Paket Try Out', 'Mata Pelajaran', 'Nomor', 'Soal', 'Peserta Selesai', 'Benar', 'Salah', 'Kosong', 'Indeks Kesulitan', 'Kategori'], ...rows.map(r => [r.packageName, r.mapel, r.questionNumber, contentText(r.name), r.totalAttempts, r.correctCount, r.wrongCount, r.emptyCount, r.score ?? 'Belum tersedia', r.category])]);
      downloadCsv(csv, `analitik_${kind}_${packageId || 'semua_paket'}_terfilter.csv`); toast.success('CSV berhasil diunduh.');
    } catch (error) { if (!abort.signal.aborted) toast.error(error instanceof Error ? error.message : 'Gagal mengunduh CSV.'); }
    finally { if (!abort.signal.aborted) setProgress(null); controller.current = null; }
  };
  const packageCell = (r: Row) => <><strong className="table-primary">{r.packageName}</strong><small className="table-secondary">{r.mapel}</small></>;
  const studentCell = (r: Row) => <div className="table-person"><span className="table-avatar">{r.studentName.split(' ').slice(0, 2).map((word: string) => word[0]).join('')}</span><div><strong className="table-primary">{r.studentName}</strong><small className="table-secondary">{r.school} · {r.className || 'Tanpa kelas'}</small></div></div>;
  const columns: { key: string; title: string; numeric?: boolean; content: (r: Row) => ReactNode }[] = [
    { key: 'packageName', title: 'Paket Try Out', content: packageCell },
    ...(isStudent ? [
      { key: 'nisn', title: 'NISN', content: (r: Row) => <span className="table-mono">{r.nisn || '—'}</span> },
      { key: 'studentName', title: 'Peserta Didik', content: studentCell },
      { key: 'className', title: 'Kelas', content: (r: Row) => r.className || '—' },
      { key: 'status', title: 'Status Pengerjaan', content: (r: Row) => <StatusBadge value={r.status} /> },
      ...(kind === 'history' ? [{ key: 'endTime', title: 'Selesai Pada', content: (r: Row) => r.endTime ? new Date(r.endTime).toLocaleString('id-ID') : '—' }] : []),
      { key: 'score', title: 'Skor Akhir', numeric: true, content: (r: Row) => <span className={r.score == null ? 'table-unavailable' : 'table-score'}>{number(r.score, 1)}</span> },
    ] : kind === 'schools' ? [
      { key: 'npsn', title: 'NPSN', content: (r: Row) => <span className="table-mono">{r.npsn === 'UNKNOWN' ? '—' : r.npsn}</span> },
      { key: 'name', title: 'Sekolah', content: (r: Row) => <strong className="table-primary">{r.name}</strong> },
      ...[['totalStudents', 'Akun Siswa'], ['startedCount', 'Sudah Mulai'], ['ongoingCount', 'Berlangsung'], ['finishedCount', 'Selesai'], ['notStartedCount', 'Belum Mulai'], ['otherCount', 'Status Lain']].map(([key, title]) => ({ key, title, numeric: true, content: (r: Row) => number(r[key]) })),
      { key: 'score', title: 'Rata-rata', numeric: true, content: (r: Row) => <span className={r.score == null ? 'table-unavailable' : 'table-score'}>{number(r.score, 1)}</span> },
    ] : [
      { key: 'questionNumber', title: 'No.', numeric: true, content: (r: Row) => r.questionNumber },
      { key: 'name', title: 'Soal', content: (r: Row) => <div className="table-question katex-container"><FormattedContent value={r.content ?? r.name} /></div> },
      ...[['totalAttempts', 'Peserta Selesai'], ['correctCount', 'Benar'], ['wrongCount', 'Salah'], ['emptyCount', 'Kosong']].map(([key, title]) => ({ key, title, numeric: true, content: (r: Row) => number(r[key]) })),
      { key: 'score', title: 'Indeks Kesulitan', numeric: true, content: (r: Row) => number(r.score, 2) },
      { key: 'category', title: 'Kategori', content: (r: Row) => <StatusBadge value={r.category} /> },
    ]),
    ...(onSchoolStudents ? [{ key: 'actions', title: 'Aksi', content: (r: Row) => <button className="btn-secondary" onClick={() => onSchoolStudents(r)}>Lihat siswa</button> }] : []),
  ];
  return <section className="glass-panel report-panel">
    <div className="report-heading"><div><h2>{labels[kind]}</h2><p>{packageId ? 'Paket terpilih' : 'Seluruh paket'} · Setiap hasil tetap dipisahkan berdasarkan paket.</p></div><button className="btn-secondary" disabled={!!progress || list.loading || !!list.error || search !== query || !list.total} onClick={() => void exportCsv()}><Download size={15} />{progress ? 'Mengunduh CSV...' : 'Unduh CSV Hasil'}</button></div>
    {progress && <p role="status" className="export-progress">Mengunduh CSV: {progress.loaded} baris dimuat{progress.total ? ` dari ${progress.total}` : ''}.</p>}
    {kind === 'students' && packageId && <div className="report-summary">
      {summary.error ? <div role="alert"><p>{summary.error}</p><button className="btn-secondary" onClick={summary.retry}>Coba Lagi Ringkasan</button></div> : !summary.data ? <p role="status">Memuat ringkasan paket...</p> : <>
        <p className="table-caption">Ringkasan seluruh sekolah pada paket ini. Filter di bawah berlaku untuk tabel dan CSV.</p><div className="report-stats">{[['Total Akun Siswa', 'totalStudents'], ['Sudah Mulai', 'startedCount'], ['Sedang Mengerjakan', 'ongoingCount'], ['Selesai', 'finishedCount'], ['Belum Mulai', 'notStartedCount'], ...(summary.data.summary.otherCount ? [['Status Lain', 'otherCount']] : [])].map(([label, field]) => <div className="report-stat" key={field}><small>{label}</small><strong>{number(summary.data.summary[field])}</strong></div>)}</div>
        <p className="table-caption">Nilai peserta selesai: rata-rata {summary.data.summary.finishedCount ? number(summary.data.summary.average, 1) : 'Belum tersedia'} · tertinggi {summary.data.summary.finishedCount ? number(summary.data.summary.highest, 1) : 'Belum tersedia'} · terendah {summary.data.summary.finishedCount ? number(summary.data.summary.lowest, 1) : 'Belum tersedia'}.</p>
      </>}
    </div>}
    <div className="report-filters">
      <label className="table-search"><Search size={15} /><input className="input-field" aria-label="Cari data laporan" placeholder={isStudent ? 'Cari nama, NISN, kelas, atau paket...' : kind === 'items' ? 'Cari soal atau paket...' : 'Cari sekolah, NPSN, atau paket...'} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <PackageFilter value={packageId} label={packageId === initialPackage ? initialPackageName : undefined} onChange={value => { setPackageId(value); setPage(1); }} />
      {kind !== 'history' && kind !== 'items' && <RemoteSelect url="/api/schools" value={schoolNpsn} valueField="npsn" labelField="name" placeholder="Semua Sekolah" onChange={value => { setSchool(value); setClass(''); setPage(1); }} includeUnknown />}
      {isStudent && <><select className="input-field" aria-label="Kelas" value={className} onChange={event => { setClass(event.target.value); setPage(1); }}><option value="">Semua Kelas</option>{classes.map(value => <option key={value}>{value}</option>)}</select>
        {kind !== 'history' && <select className="input-field" aria-label="Status pengerjaan" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Semua Status</option><option value="selesai">Selesai</option><option value="sedang_mengerjakan">Sedang Mengerjakan</option><option value="belum_mulai">Belum Mulai</option><option value="lainnya">Status Lain</option></select>}</>}
      {kind === 'items' && <select className="input-field" aria-label="Kategori soal" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">Semua Kategori</option>{['Mudah', 'Sedang', 'Sulit', 'Belum ada data'].map(value => <option key={value}>{value}</option>)}</select>}
      <select className="input-field" aria-label="Urutkan hasil" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="name_asc">{kind === 'items' ? 'Soal A–Z' : 'Nama A–Z'}</option><option value="name_desc">{kind === 'items' ? 'Soal Z–A' : 'Nama Z–A'}</option><option value="score_desc">{kind === 'items' ? 'Indeks Tertinggi' : 'Nilai Tertinggi'}</option><option value="score_asc">{kind === 'items' ? 'Indeks Terendah' : 'Nilai Terendah'}</option></select>
      <button className="table-reset" onClick={reset}><RotateCcw size={13} />Reset Filter</button>
    </div>
    {classesError && <div role="alert" className="table-caption">{classesError} <button className="table-reset" onClick={() => setClassRetry(value => value + 1)}>Coba Lagi Kelas</button></div>}
    <TableFrame total={list.total} pageSize={pageSize} onPageSize={value => { setPageSize(value); setPage(1); }} label={labels[kind]}>
      <table><thead><tr>{columns.map(col => <th key={col.key} scope="col" className={col.numeric ? 'numeric' : undefined} aria-sort={(col.key === 'score' && sort.startsWith('score')) || ((col.key === 'name' || col.key === 'studentName') && sort.startsWith('name')) ? sort.endsWith('asc') ? 'ascending' : 'descending' : undefined}>{col.key === 'score' || col.key === 'name' || col.key === 'studentName' ? <button className="table-sort" onClick={() => { const key = col.key === 'score' ? 'score' : 'name'; setSort(sort === `${key}_asc` ? `${key}_desc` : `${key}_asc`); setPage(1); }}>{col.title}<ArrowDownUp size={12} /></button> : col.title}</th>)}</tr></thead><tbody>
        {list.error ? <tr><td colSpan={columns.length}><div className="table-empty" role="alert"><strong>Data belum berhasil dimuat</strong><p>{list.error}</p><button className="btn-secondary" onClick={() => void list.reload()}>Coba Lagi</button></div></td></tr> : list.loading ? <tr><td colSpan={columns.length}><div className="table-empty" role="status">Memuat data laporan...</div></td></tr> : !list.items.length ? <tr><td colSpan={columns.length}><div className="table-empty"><Search size={25} /><strong>Belum ada data yang sesuai</strong><p>Coba pilih paket lain atau ubah filter pencarian.</p><button className="btn-secondary" onClick={reset}>Reset Tampilan</button></div></td></tr> : list.items.map(row => <tr key={row.id}>{columns.map(col => <td key={col.key} className={col.numeric ? 'numeric' : undefined}>{col.content(row)}</td>)}</tr>)}
      </tbody></table>
    </TableFrame>
    <Pagination page={page} total={list.total} pageSize={pageSize} onChange={setPage} loading={list.loading} />
    <p className="table-caption">{kind === 'items' ? 'Indeks = jawaban benar ÷ seluruh peserta selesai pada paket yang sama, termasuk jawaban kosong.' : kind === 'history' ? 'Menampilkan sesi selesai di sekolah Anda, termasuk paket yang masih aktif. Setiap baris mewakili satu sesi pada satu paket.' : 'Total akun mencakup akun siswa saat ini, bukan daftar peserta yang ditugaskan ke paket. Siswa/sekolah dapat muncul pada beberapa paket.'} CSV mengikuti seluruh halaman, filter, dan urutan yang dipilih.</p>
  </section>;
}
