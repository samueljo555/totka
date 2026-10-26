type Props = {
  search: string; onSearch: (value: string) => void;
  school: string; schools: { npsn: string; name: string }[]; onSchool: (value: string) => void;
  className: string; classes: string[]; onClass: (value: string) => void;
  status: string; onStatus: (value: string) => void;
  sort: string; onSort: (value: string) => void; onReset: () => void;
};
export function AnalyticsStudentFilters(props: Props) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', alignItems: 'end' }}>
    <label style={{ flex: '1 1 220px' }}>Cari siswa
      <input aria-label="Cari siswa" className="input-field" placeholder="Nama, NISN, username, atau kelas" value={props.search} onChange={e => props.onSearch(e.target.value)} />
    </label>
    <label>Sekolah
      <select aria-label="Sekolah" className="input-field" value={props.school} onChange={e => props.onSchool(e.target.value)}>
        <option value="">Semua Sekolah</option>
        {props.schools.map(school => <option key={school.npsn} value={school.npsn}>{school.name} ({school.npsn === 'UNKNOWN' ? 'Tanpa NPSN' : school.npsn})</option>)}
      </select>
    </label>
    <label>Kelas
      <select aria-label="Kelas" className="input-field" value={props.className} onChange={e => props.onClass(e.target.value)}>
        <option value="">Semua Kelas</option>
        {props.classes.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
    <label>Status pengerjaan
      <select aria-label="Status pengerjaan" className="input-field" value={props.status} onChange={e => props.onStatus(e.target.value)}>
        <option value="">Semua Status</option>
        <option value="selesai">Selesai</option>
        <option value="sedang_mengerjakan">Sedang Mengerjakan</option>
        <option value="belum_mulai">Belum Mulai</option>
        <option value="lainnya">Status Lain</option>
      </select>
    </label>
    <label>Urutkan hasil
      <select aria-label="Urutkan hasil" className="input-field" value={props.sort} onChange={e => props.onSort(e.target.value)}>
        <option value="name_asc">Nama A–Z</option><option value="name_desc">Nama Z–A</option>
        <option value="score_desc">Nilai Tertinggi</option><option value="score_asc">Nilai Terendah</option>
      </select>
    </label>
    <button className="btn-secondary" onClick={props.onReset}>Reset Filter</button>
  </div>;
}
