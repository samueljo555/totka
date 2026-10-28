import { WorkspaceShell } from '../components/WorkspaceShell';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { FormattedContent } from '../components/FormattedContent';
import 'katex/dist/katex.min.css';
import { 
  Users, 
  BookOpen, 
  Settings, 
  BarChart3, 
  Plus,
  Search,
  LineChart,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { AnalyticsReports } from '../components/ReportTable';
import { TableFrame, StatusBadge, SortableHeading, TableState } from '../components/TableFrame';
import { Pagination } from '../components/Pagination';
import { RemoteSelect } from '../components/RemoteSelect';
import { usePagedList, useDebounced, readJson } from '../lib/paging';



const AdminDashboard = ({ user, onLogout }: { user?: any, onLogout: () => void }) => {
  const confirmModal = useConfirm();
  const [activeTab, setActiveTab] = useState('overview');
  const [isAddingPackage, setIsAddingPackage] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  const [userSort, setUserSort] = useState('name_asc');
  const [schoolSort, setSchoolSort] = useState('name_asc');
  const [packageSort, setPackageSort] = useState('name_asc');
  const [userRole, setUserRole] = useState('');
  const [packageSubject, setPackageSubject] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [usersPerPage, setUsersPerPage] = useState(10);
  

  
  // Package Form State
  const [newPackageName, setNewPackageName] = useState('');
  const [newPackageMapel, setNewPackageMapel] = useState('Matematika');
  const [newPackageDuration, setNewPackageDuration] = useState(90);
  const [newPackageNavMode, setNewPackageNavMode] = useState('bebas');
  const [newPackageReleaseMode, setNewPackageReleaseMode] = useState('langsung');
  const [newPackageToken, setNewPackageToken] = useState('');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [isSavingPackage, setIsSavingPackage] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  

  const [schoolPage, setSchoolPage] = useState(1);
  const [schoolsPerPage, setSchoolsPerPage] = useState(10);


  const [questionPage, setQuestionPage] = useState(1);
  const questionsPerPage = 5;
  
  // School State
  const [isAddingSchool, setIsAddingSchool] = useState(false);
  const [editingSchool, setEditingSchool] = useState<any>(null);
  const [schoolNameInput, setSchoolNameInput] = useState('');
  const [schoolRegionInput, setSchoolRegionInput] = useState('');
  const [schoolNpsnInput, setSchoolNpsnInput] = useState('');
  const [isSavingSchool, setIsSavingSchool] = useState(false);
  
  // Add User State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [newSchoolNpsn, setNewSchoolNpsn] = useState('');
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userErrorMsg, setUserErrorMsg] = useState('');

  const [search, setSearch] = useState('');
  const query = useDebounced(search);
  const [packagePage, setPackagePage] = useState(1);
  const [packagesPerPage, setPackagesPerPage] = useState(10);
  const [overview, setOverview] = useState({ totalUsers: 0, students: 0, teachers: 0, packages: 0 });
  const userList = usePagedList<any>('/api/users', userPage, usersPerPage, { search: query, sort: userSort, role: userRole }, activeTab === 'accounts');
  const schoolList = usePagedList<any>('/api/schools', schoolPage, schoolsPerPage, { search: query, sort: schoolSort }, activeTab === 'schools');
  const packageList = usePagedList<any>('/api/packages', packagePage, packagesPerPage, { search: query, sort: packageSort, mapel: packageSubject }, activeTab === 'packages');
  const questionList = usePagedList<any>('/api/questions', questionPage, questionsPerPage, { search: query, mapel: newPackageMapel }, activeTab === 'packages' && isAddingPackage);
  const users = userList.items, schools = schoolList.items, packages = packageList.items, questions = questionList.items.filter(q => q.mapel === newPackageMapel);
  const fetchUsers = () => { void userList.reload(); };
  const fetchSchools = () => { void schoolList.reload(); };
  useEffect(() => {
    if (activeTab === 'overview') {
      const controller = new AbortController();
      readJson<typeof overview>('/api/overview', controller.signal).then(setOverview).catch(() => {});
      return () => controller.abort();
    }
  }, [activeTab]);

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
  
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const hasHeader = lines[0].toLowerCase().includes('npsn');
      const dataLines = hasHeader ? lines.slice(1) : lines;
      
      const schoolsData = dataLines.map(line => {
        const [npsn, name, region] = line.split(',');
        return { 
          npsn: npsn?.trim(), 
          name: name?.trim(), 
          region: region?.trim() || '' 
        };
      }).filter(s => s.npsn && s.name);
  
      if (schoolsData.length === 0) {
        toast.error('Format CSV tidak valid atau kosong. Pastikan format: npsn,name,region');
        return;
      }
  
      try {
        const res = await fetch('/api/schools/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schools: schoolsData })
        });
        if (res.ok) {
          toast.success(`Berhasil mengimpor ${schoolsData.length} data sekolah!`);
          fetchSchools();
        } else {
          toast.error('Terjadi kesalahan saat impor data.');
        }
      } catch(err) {
        toast.error('Gagal menghubungi server.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSavePackage = async () => {
    if (!newPackageName || !newPackageToken) {
      toast.error("Nama Paket dan Token Ujian wajib diisi!");
      return;
    }
    
    setIsSavingPackage(true);
    try {
      const url = editingPackageId ? `/api/packages/${editingPackageId}` : '/api/packages';
      const method = editingPackageId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPackageName,
          mapel: newPackageMapel,
          token: newPackageToken,
          durationMinutes: newPackageDuration,
          navigationMode: newPackageNavMode,
          releaseScoreMode: newPackageReleaseMode,
          status: 'draft',
          createdById: user?.id,
          questionIds: selectedQuestionIds
        })
      });

      if (res.ok) {
        alert(editingPackageId ? "Paket berhasil diperbarui!" : "Paket berhasil disimpan!");
        setIsAddingPackage(false);
        setEditingPackageId(null);
        setNewPackageName('');
        setNewPackageToken('');
        setSelectedQuestionIds([]);
        // Re-fetch packages
        await packageList.reload();
      } else {
        const err = await res.json();
        toast.error(`Gagal: ${err.message || err.error || 'Terjadi kesalahan'}`);
      }
    } catch (err) {
      toast.error("Terjadi kesalahan jaringan");
    } finally {
      setIsSavingPackage(false);
    }
  };

  const tabs = [
    { id: 'overview', name: 'Ringkasan', icon: <BarChart3 size={20} /> },
    { id: 'accounts', name: 'Manajemen Akun', icon: <Users size={20} /> },
    { id: 'schools', name: 'Data Sekolah', icon: <BookOpen size={20} /> },
    { id: 'packages', name: 'Paket Try Out', icon: <Settings size={20} /> },
    { id: 'results', name: 'Analitik Hasil', icon: <LineChart size={20} /> },
    { id: 'settings', name: 'Pengaturan Ujian', icon: <Settings size={20} /> },
  ];

  return (
    <WorkspaceShell user={user} roleLabel="Super Admin" items={tabs} activeId={activeTab}
      onNavigate={id => { setActiveTab(id); setSearch(''); setUserPage(1); setSchoolPage(1); setPackagePage(1); }} onLogout={onLogout}
      description={({overview:'Kelola persiapan dan pelaksanaan try out dari satu workspace.',accounts:'Kelola akses pengguna dengan identitas dan peran yang jelas.',schools:'Kelola sekolah peserta dan identitas operatornya.',packages:'Susun, periksa, dan aktifkan paket try out.',results:'Tinjau capaian siswa, kualitas soal, dan hasil per sekolah.',settings:'Pengaturan pelaksanaan try out.'} as Record<string, string>)[activeTab]}
      actions={<>{activeTab !== 'results' && <div className="input-group" style={{ marginBottom: 0, position: 'relative' }}>
          <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" className="input-field" aria-label="Cari data" placeholder="Cari..." value={search} onChange={event => { setSearch(event.target.value); setUserPage(1); setSchoolPage(1); setQuestionPage(1); setPackagePage(1); }} style={{ paddingLeft: '34px', width: '250px' }} />
        </div>}</>}>

        {[userList, schoolList, packageList, questionList].some(list => list.loading) && <p role="status">Memuat data...</p>}
        {[userList, schoolList, packageList, questionList].filter(list => list.error).map((list, index) => <p role="alert" key={index}>{list.error}</p>)}

        {activeTab === 'overview' && (
          <div className="animate-fade-in">
            <div className="dashboard-grid" style={{ marginTop: 0 }}>
              <div className="glass-panel card flex flex-col justify-center">
                <p>Total Pengguna Sistem</p>
                <h2 style={{ fontSize: '3rem', margin: '0.5rem 0 0 0', color: 'var(--primary-color)' }}>{overview.totalUsers}</h2>
              </div>
              <div className="glass-panel card flex flex-col justify-center">
                <p>Total Siswa</p>
                <h2 style={{ fontSize: '3rem', margin: '0.5rem 0 0 0', color: 'var(--primary-color)' }}>
                  {overview.students}
                </h2>
              </div>
              <div className="glass-panel card flex flex-col justify-center">
                <p>Guru Penulis Soal</p>
                <h2 style={{ fontSize: '3rem', margin: '0.5rem 0 0 0', color: 'var(--primary-color)' }}>
                  {overview.teachers}
                </h2>
              </div>
              <div className="glass-panel card flex flex-col justify-center">
                <p>Total Paket Try Out</p>
                <h2 style={{ fontSize: '3rem', margin: '0.5rem 0 0 0', color: 'var(--primary-color)' }}>{overview.packages}</h2>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'accounts' && !isAddingUser && !editingUser && (
          <div className="animate-fade-in glass-panel p-8">
            <div className="flex justify-between items-center mb-6">
              <h2>Daftar Pengguna Sistem</h2>
              <button className="btn" onClick={() => setIsAddingUser(true)}>
                <Plus size={18} /> Tambah Akun
              </button>
            </div>
            <select className="input-field table-filter-inline" aria-label="Peran pengguna" value={userRole} onChange={event => { setUserRole(event.target.value); setUserPage(1); }}><option value="">Semua Peran</option><option value="super_admin">Super Admin</option><option value="admin">Admin</option><option value="operator">Operator</option><option value="guru">Guru</option><option value="siswa">Siswa</option></select>
            <TableFrame exportOptions={{ url: '/api/users', params: { search: query, role: userRole, sort: userSort }, filename: 'daftar_akun.csv', disabled: userList.loading || !!userList.error || search !== query, columns: [{ title: 'Nama', value: r => r.fullName }, { title: 'Username', value: r => r.username }, { title: 'Peran', value: r => r.role }, { title: 'Sekolah', value: r => r.school?.name || '' }] }} sort={userSort} onSort={value => { setUserSort(value); setUserPage(1); }} total={userList.total} pageSize={usersPerPage} onPageSize={value => { setUsersPerPage(value); setUserPage(1); }} label="Daftar akun">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(0,0,0,0.02)' }}>
                  <SortableHeading title="Nama" sort={userSort} onSort={value => { setUserSort(value); setUserPage(1); }} />
                  <th scope="col" className="p-5" style={{ fontWeight: 600 }}>Peran</th>
                  <th scope="col" className="p-5" style={{ fontWeight: 600 }}>Status</th>
                  <th scope="col" className="p-5" style={{ fontWeight: 600 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {userList.error || userList.loading ? <TableState error={userList.error} loading={userList.loading} columns={4} retry={() => void userList.reload()} /> : users.length > 0 ? users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="p-5 font-semibold text-main">
                      <strong className="table-primary">{u.fullName}</strong><small className="table-secondary">{u.username}</small>
                    </td>
                    <td className="p-5">
                      <span className="tag" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                        {u.role === 'super_admin' ? 'Super Admin' : u.role === 'guru' ? 'Guru (Author)' : u.role === 'operator' ? 'Operator' : 'Siswa'}
                      </span>
                    </td>
                    <td className="p-5">
                      <span style={{ 
                        color: 'green',
                        background: 'rgba(0,128,0,0.1)',
                        padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600
                      }}>
                        Aktif
                      </span>
                    </td>
                    <td className="p-5">
                      <div className="flex gap-2">
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          onClick={async () => {
                            let loginPassword = '';
                            if (u.role === 'siswa') {
                              try {
                                const response = await fetch(`/api/users/${u.id}/login-card`);
                                if (!response.ok) throw new Error('Gagal memuat password kartu siswa');
                                loginPassword = (await response.json()).loginPassword || '';
                              } catch { toast.error('Password kartu belum dapat dimuat. Anda tetap dapat mengatur password baru.'); }
                            }
                            setEditingUser(u);
                            setNewUsername(u.username);
                            setNewPassword(loginPassword);
                            setNewFullName(u.fullName);
                            setNewRole(u.role);
                            setNewSchoolNpsn(u.schoolNpsn || '');
                          }}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.85rem', color: '#d32f2f', background: 'rgba(255,0,0,0.05)' }}
                          onClick={async () => {
                            if (await confirmModal({ title: 'Konfirmasi', message: `Yakin ingin menghapus pengguna ${u.fullName}?` })) {
                              fetch(`/api/users/${u.id}`, { method: 'DELETE' })
                                .then(res => {
                                  if (res.ok) fetchUsers();
                                  else toast.error('Gagal menghapus pengguna');
                                });
                            }
                          }}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="p-5 text-center text-muted">Belum ada pengguna.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </TableFrame>
            
            {/* Pagination for Users */}
            <Pagination page={userPage} total={userList.total} pageSize={usersPerPage} onChange={setUserPage} loading={userList.loading} />
          </div>
        )}

        {activeTab === 'accounts' && isAddingUser && (
          <div className="animate-fade-in glass-panel p-8" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className="flex justify-between items-center mb-6">
              <h2>Tambah Akun Pengguna</h2>
              <button className="btn-secondary" onClick={() => setIsAddingUser(false)}>Batal</button>
            </div>

            {userErrorMsg && (
              <div className="p-4 mb-4" style={{ background: 'rgba(255, 0, 0, 0.1)', color: 'red', borderRadius: '8px' }}>
                {userErrorMsg}
              </div>
            )}

            <div className="input-group">
              <label className="input-label">Username</label>
              <input type="text" className="input-field" placeholder="Ketik username" value={newUsername} onChange={e => setNewUsername(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input type="password" className="input-field" placeholder="Ketik password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Nama Lengkap / Nama Institusi</label>
              <input type="text" className="input-field" placeholder="Ketik nama pengguna" value={newFullName} onChange={e => setNewFullName(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Peran (Role)</label>
              <select className="input-field" value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="operator">Operator Sekolah</option>
                <option value="guru">Guru Penulis Soal</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            {(newRole === 'operator' || newRole === 'guru') && (
              <div className="input-group">
                <label className="input-label">Sekolah / Instansi (Opsional)</label>
                <RemoteSelect url="/api/schools" value={newSchoolNpsn} onChange={setNewSchoolNpsn} valueField="npsn" placeholder="Pilih sekolah" />
              </div>
            )}

            <button 
              className="btn mt-6" 
              style={{ width: '100%', opacity: isSavingUser ? 0.7 : 1 }} 
              disabled={isSavingUser}
              onClick={() => {
                if (!newUsername || !newPassword || !newFullName) {
                  setUserErrorMsg('Semua kolom wajib diisi.');
                  return;
                }
                setIsSavingUser(true);
                setUserErrorMsg('');
                fetch('/api/users', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    username: newUsername,
                    password: newPassword,
                    fullName: newFullName,
                    role: newRole,
                    schoolNpsn: newSchoolNpsn
                  })
                })
                .then(async res => {
                  if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Terjadi kesalahan saat menyimpan');
                  }
                  return res.json();
                })
                .then(() => {
                  setIsSavingUser(false);
                  setIsAddingUser(false);
                  setNewUsername('');
                  setNewPassword('');
                  setNewFullName('');
                  fetchUsers();
                })
                .catch(err => {
                  setUserErrorMsg(err.message);
                  setIsSavingUser(false);
                });
              }}
            >
              {isSavingUser ? 'Menyimpan...' : 'Simpan Data Pengguna'}
            </button>
          </div>
        )}

        {activeTab === 'accounts' && editingUser && (
          <div className="animate-fade-in glass-panel p-8" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className="flex justify-between items-center mb-6">
              <h2>Edit Akun Pengguna</h2>
              <button className="btn-secondary" onClick={() => setEditingUser(null)}>Batal</button>
            </div>

            {userErrorMsg && (
              <div className="p-4 mb-4" style={{ background: 'rgba(255, 0, 0, 0.1)', color: 'red', borderRadius: '8px' }}>
                {userErrorMsg}
              </div>
            )}

            <div className="input-group">
              <label className="input-label">Username</label>
              <input type="text" className="input-field" placeholder="Ketik username" value={newUsername} onChange={e => setNewUsername(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input type={editingUser.role === 'siswa' ? 'text' : 'password'} className="input-field" placeholder="Kosongkan untuk mempertahankan password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Nama Lengkap / Nama Institusi</label>
              <input type="text" className="input-field" placeholder="Ketik nama pengguna" value={newFullName} onChange={e => setNewFullName(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Peran (Role)</label>
              <select className="input-field" value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="operator">Operator Sekolah</option>
                <option value="guru">Guru Penulis Soal</option>
                <option value="super_admin">Super Admin</option>
                <option value="siswa">Siswa</option>
              </select>
            </div>
            {(newRole === 'operator' || newRole === 'guru' || newRole === 'siswa') && (
              <div className="input-group">
                <label className="input-label">Sekolah / Instansi (Opsional)</label>
                <RemoteSelect url="/api/schools" value={newSchoolNpsn} onChange={setNewSchoolNpsn} valueField="npsn" placeholder="Pilih sekolah" />
              </div>
            )}

            <button 
              className="btn mt-6" 
              style={{ width: '100%', opacity: isSavingUser ? 0.7 : 1 }} 
              disabled={isSavingUser}
              onClick={() => {
                if (!newUsername || !newFullName) {
                  setUserErrorMsg('Semua kolom wajib diisi.');
                  return;
                }
                setIsSavingUser(true);
                setUserErrorMsg('');
                fetch(`/api/users/${editingUser.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    username: newUsername,
                    password: newPassword,
                    fullName: newFullName,
                    role: newRole,
                    schoolNpsn: newSchoolNpsn
                  })
                })
                .then(async res => {
                  if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Terjadi kesalahan saat menyimpan');
                  }
                  return res.json();
                })
                .then(() => {
                  setIsSavingUser(false);
                  setEditingUser(null);
                  setNewUsername('');
                  setNewPassword('');
                  setNewFullName('');
                  setNewSchoolNpsn('');
                  fetchUsers();
                })
                .catch(err => {
                  setUserErrorMsg(err.message);
                  setIsSavingUser(false);
                });
              }}
            >
              {isSavingUser ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        )}

        {activeTab === 'schools' && !isAddingSchool && !editingSchool && (
          <div className="animate-fade-in glass-panel p-8">
            <div className="flex justify-between items-center mb-6">
              <h2>Data Sekolah & Instansi</h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input type="file" id="csv-upload" accept=".csv" style={{ display: 'none' }} onChange={handleImportCsv} />
                <label htmlFor="csv-upload" className="btn-secondary" style={{ margin: 0 }}>
                  <Upload size={18} /> Import CSV
                </label>
                <button className="btn" onClick={() => setIsAddingSchool(true)}>
                  <Plus size={18} /> Tambah Sekolah
                </button>
              </div>
            </div>
            <TableFrame exportOptions={{ url: '/api/schools', params: { search: query, sort: schoolSort }, filename: 'daftar_sekolah.csv', disabled: schoolList.loading || !!schoolList.error || search !== query, columns: [{ title: 'NPSN', value: r => r.npsn }, { title: 'Nama Sekolah', value: r => r.name }, { title: 'Wilayah', value: r => r.region || '' }] }} sort={schoolSort} onSort={value => { setSchoolSort(value); setSchoolPage(1); }} total={schoolList.total} pageSize={schoolsPerPage} onPageSize={value => { setSchoolsPerPage(value); setSchoolPage(1); }} label="Daftar sekolah">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(0,0,0,0.02)' }}>
                  <th scope="col" className="p-5" style={{ fontWeight: 600 }}>NPSN</th>
                  <SortableHeading title="Nama Sekolah" sort={schoolSort} onSort={value => { setSchoolSort(value); setSchoolPage(1); }} />
                  <th scope="col" className="p-5" style={{ fontWeight: 600 }}>Wilayah</th>
                  <th scope="col" className="p-5" style={{ fontWeight: 600 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {schoolList.error || schoolList.loading ? <TableState error={schoolList.error} loading={schoolList.loading} columns={4} retry={() => void schoolList.reload()} /> : schools.length > 0 ? schools.map((s) => (
                  <tr key={s.npsn} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="p-5 font-semibold text-muted">{s.npsn}</td>
                    <td className="p-5 font-semibold text-main">{s.name}</td>
                    <td className="p-5">{s.region || '-'}</td>
                    <td className="p-5">
                      <div className="flex gap-2">
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          onClick={() => {
                            setEditingSchool(s);
                            setSchoolNpsnInput(s.npsn);
                            setSchoolNameInput(s.name);
                            setSchoolRegionInput(s.region || '');
                          }}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.85rem', color: '#d32f2f', background: 'rgba(255,0,0,0.05)' }}
                          onClick={async () => {
                            if (await confirmModal({ title: 'Konfirmasi', message: 'Hapus sekolah ini?' })) {
                              fetch(`/api/schools/${s.npsn}`, { method: 'DELETE' })
                                .then(() => fetchSchools());
                            }
                          }}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="p-5 text-center text-muted">Belum ada data sekolah.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </TableFrame>
            
            {/* Pagination for Schools */}
            <Pagination page={schoolPage} total={schoolList.total} pageSize={schoolsPerPage} onChange={setSchoolPage} loading={schoolList.loading} />
          </div>
        )}

        {activeTab === 'schools' && (isAddingSchool || editingSchool) && (
          <div className="animate-fade-in glass-panel p-8" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className="flex justify-between items-center mb-6">
              <h2>{editingSchool ? 'Edit Sekolah' : 'Tambah Sekolah Baru'}</h2>
              <button className="btn-secondary" onClick={() => { setIsAddingSchool(false); setEditingSchool(null); }}>Batal</button>
            </div>
            <div className="input-group">
              <label className="input-label">NPSN (8 Digit)</label>
              <input type="text" className="input-field" placeholder="Contoh: 10101234" value={schoolNpsnInput} onChange={e => setSchoolNpsnInput(e.target.value)} disabled={!!editingSchool} />
            </div>
            <div className="input-group">
              <label className="input-label">Nama Sekolah / Instansi</label>
              <input type="text" className="input-field" placeholder="Contoh: SDN 01 Pagi Jakarta" value={schoolNameInput} onChange={e => setSchoolNameInput(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Wilayah (Opsional)</label>
              <input type="text" className="input-field" placeholder="Contoh: Jakarta Pusat" value={schoolRegionInput} onChange={e => setSchoolRegionInput(e.target.value)} />
            </div>
            <button 
              className="btn mt-6" 
              style={{ width: '100%', opacity: isSavingSchool ? 0.7 : 1 }} 
              disabled={isSavingSchool}
              onClick={() => {
                if (!schoolNameInput || !schoolNpsnInput) return;
                setIsSavingSchool(true);
                const url = editingSchool ? `/api/schools/${editingSchool.npsn}` : '/api/schools';
                const method = editingSchool ? 'PUT' : 'POST';
                fetch(url, {
                  method,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ npsn: schoolNpsnInput, name: schoolNameInput, region: schoolRegionInput })
                })
                .then(() => {
                  setIsSavingSchool(false);
                  setIsAddingSchool(false);
                  setEditingSchool(null);
                  setSchoolNpsnInput('');
                  setSchoolNameInput('');
                  setSchoolRegionInput('');
                  fetchSchools();
                });
              }}
            >
              {isSavingSchool ? 'Menyimpan...' : 'Simpan Data Sekolah'}
            </button>
          </div>
        )}

        {activeTab === 'packages' && !isAddingPackage && (
          <div className="animate-fade-in glass-panel p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2>Paket Try Out</h2>
                <p>Kelola dan racik paket soal untuk diujikan ke siswa.</p>
              </div>
              <button className="btn" onClick={() => {
                setEditingPackageId(null);
                setNewPackageName('');
                setNewPackageToken(Math.random().toString(36).substring(2, 12).toUpperCase());
                setNewPackageDuration(90);
                setNewPackageMapel('Matematika');
                setQuestionPage(1);
                setSelectedQuestionIds([]);
                setIsAddingPackage(true);
              }}>
                <Plus size={18} /> Buat Paket Baru
              </button>
            </div>
            
            <select className="input-field table-filter-inline" aria-label="Mata pelajaran paket" value={packageSubject} onChange={event => { setPackageSubject(event.target.value); setPackagePage(1); }}><option value="">Semua Mata Pelajaran</option><option>Matematika</option><option>Bahasa Indonesia</option></select>
            <TableFrame exportOptions={{ url: '/api/packages', params: { search: query, sort: packageSort, mapel: packageSubject }, filename: 'paket_ujian.csv', disabled: packageList.loading || !!packageList.error || search !== query, columns: [{ title: 'Nama Paket', value: r => r.name }, { title: 'Mata Pelajaran', value: r => r.mapel }, { title: 'Jumlah Soal', value: r => r._count?.questions || 0 }, { title: 'Durasi (Menit)', value: r => r.durationMinutes }, { title: 'Status', value: r => r.status }] }} sort={packageSort} onSort={value => { setPackageSort(value); setPackagePage(1); }} total={packageList.total} pageSize={packagesPerPage} onPageSize={value => { setPackagesPerPage(value); setPackagePage(1); }} label="Paket ujian">
              <table><thead><tr><SortableHeading title="Nama Paket" sort={packageSort} onSort={value => { setPackageSort(value); setPackagePage(1); }} /><th scope="col">Mata Pelajaran</th><th scope="col" className="numeric">Jumlah Soal</th><th scope="col" className="numeric">Durasi</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead><tbody>
                {packageList.error ? <tr><td colSpan={6}><div className="table-empty" role="alert">{packageList.error}<button className="btn-secondary" onClick={() => void packageList.reload()}>Coba Lagi</button></div></td></tr> : packageList.loading ? <tr><td colSpan={6}><div className="table-empty" role="status">Memuat paket...</div></td></tr> : packages.length ? packages.map(pkg => <tr key={pkg.id}>
                  <td><strong className="table-primary">{pkg.name}</strong><small className="table-secondary">{pkg.navigationMode === 'bebas' ? 'Navigasi bebas' : 'Navigasi berurutan'}</small></td>
                  <td><span className="tag">{pkg.mapel}</span></td><td className="numeric">{pkg._count?.questions || 0}</td><td className="numeric">{pkg.durationMinutes} menit</td><td><StatusBadge value={pkg.status === 'aktif' ? 'Aktif' : pkg.status} /></td>
                  <td><div className="table-row-actions">
                    <button className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.9rem' }} onClick={() => {
                      setEditingPackageId(pkg.id);
                      setNewPackageName(pkg.name);
                      setNewPackageMapel(pkg.mapel);
                      setQuestionPage(1);
                      setNewPackageDuration(pkg.durationMinutes);
                      setNewPackageNavMode(pkg.navigationMode || 'bebas');
                      setNewPackageReleaseMode(pkg.releaseScoreMode || 'langsung');
                      setNewPackageToken(pkg.token);
                      setSelectedQuestionIds(pkg.questions?.map((pq: any) => pq.questionId) || []);
                      setIsAddingPackage(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}>Edit Paket</button>
                    {pkg.status === 'draft' ? (
                      <button className="btn" style={{ flex: 1, padding: '8px', fontSize: '0.9rem' }} onClick={async () => {
                        if (await confirmModal({ title: 'Konfirmasi', message: 'Ubah status paket menjadi AKTIF? Paket yang aktif dapat diakses siswa.' })) {
                          await fetch(`/api/packages/${pkg.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'aktif' })
                          });
                          await packageList.reload();
                        }
                      }}>Buka Ujian</button>
                    ) : (
                      <button className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.9rem', color: '#d32f2f', border: '1px solid #d32f2f' }} onClick={async () => {
                        if (await confirmModal({ title: 'Konfirmasi', message: 'Nonaktifkan paket ujian ini? Siswa tidak akan bisa masuk menggunakan token ini lagi.' })) {
                          await fetch(`/api/packages/${pkg.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'draft' })
                          });
                          await packageList.reload();
                        }
                      }}>Tutup Ujian</button>
                    )}
                  </div></td></tr>) : <tr><td colSpan={6}><div className="table-empty">Belum ada paket sesuai pencarian.</div></td></tr>}
              </tbody></table>
            </TableFrame>
            <Pagination page={packagePage} total={packageList.total} pageSize={packagesPerPage} onChange={setPackagePage} loading={packageList.loading} />
          </div>
        )}

        {activeTab === 'packages' && isAddingPackage && (
          <div className="animate-fade-in glass-panel p-8">
            <div className="flex justify-between items-center mb-6">
              <h2>{editingPackageId ? 'Edit Paket Ujian' : 'Peracikan Paket Baru'}</h2>
              <button className="btn-secondary" onClick={() => { setIsAddingPackage(false); setEditingPackageId(null); }}>Batal</button>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 0, gap: '2rem' }}>
              <div>
                <h3 className="mb-4" style={{ fontSize: '1.1rem' }}>1. Informasi & Konfigurasi</h3>
                <div className="input-group">
                  <label className="input-label">Nama Paket</label>
                  <input type="text" className="input-field" placeholder="Contoh: Try Out Nasional MTK 1" value={newPackageName} onChange={e => setNewPackageName(e.target.value)} />
                </div>
                <div className="input-group">
                  <label className="input-label">Mata Pelajaran</label>
                  <select className="input-field" value={newPackageMapel} onChange={e => {
                    setNewPackageMapel(e.target.value);
                    setQuestionPage(1);
                    setSelectedQuestionIds([]);
                  }}>
                    <option value="Matematika">Matematika</option>
                    <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Token Ujian (Opsional/Bisa Diubah)</label>
                  <div className="flex gap-2">
                    <input type="text" className="input-field" placeholder="Contoh: BATCH1MTK" value={newPackageToken} onChange={e => setNewPackageToken(e.target.value)} style={{ textTransform: 'uppercase', flex: 1 }} />
                    <button className="btn-secondary" onClick={() => setNewPackageToken(Math.random().toString(36).substring(2, 12).toUpperCase())} title="Generate Token Baru">
                      ⟳
                    </button>
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Durasi Waktu (Menit)</label>
                  <input type="number" className="input-field" placeholder="90" value={newPackageDuration} onChange={e => setNewPackageDuration(Number(e.target.value))} />
                </div>
                <div className="input-group">
                  <label className="input-label">Mode Navigasi</label>
                  <select className="input-field" value={newPackageNavMode} onChange={e => setNewPackageNavMode(e.target.value)}>
                    <option value="bebas">Bebas (Bisa mundur ke soal sebelumnya)</option>
                    <option value="maju_terus">Maju Terus (Tidak bisa mundur)</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Opsi Perilisan Nilai</label>
                  <select className="input-field" value={newPackageReleaseMode} onChange={e => setNewPackageReleaseMode(e.target.value)}>
                    <option value="langsung">Langsung tampil setelah ujian selesai</option>
                    <option value="tertunda">Sembunyikan (Dirilis manual nanti)</option>
                  </select>
                </div>
              </div>

              <div>
                <h3 className="mb-4" style={{ fontSize: '1.1rem' }}>2. Pilih Soal {newPackageMapel}</h3>
                <div className="input-group" style={{ marginBottom: '1rem', position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input type="text" className="input-field" placeholder="Cari ID soal atau teks..." style={{ paddingLeft: '36px' }} />
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white' }}>
                  <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Menampilkan soal (Total: {questionList.total})</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {questions.map((q, idx) => (
                      <label key={q.id} className="flex items-start gap-4 p-5" style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', background: idx % 2 === 0 ? '#f8fafc' : 'white', transition: 'all 0.2s ease' }}>
                        <input type="checkbox" style={{ marginTop: '5px', width: '18px', height: '18px' }} checked={selectedQuestionIds.includes(q.id)} onChange={(e) => {
                          if (e.target.checked) setSelectedQuestionIds([...selectedQuestionIds, q.id]);
                          else setSelectedQuestionIds(selectedQuestionIds.filter(id => id !== q.id));
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '4px' }}>ID: {q.id.substring(0, 8)}</div>
                          <div style={{ fontSize: '0.95rem', lineHeight: '1.5', color: '#334155', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            {q.imageUrl && <ImageIcon size={16} style={{ color: 'var(--primary-color)', flexShrink: 0, marginTop: '2px' }} />}
                            <div className="katex-container" style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              <FormattedContent value={q.content || ''} />
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <span className="tag" style={{ fontSize: '0.75rem', padding: '4px 10px', background: 'var(--primary-light)', color: 'white', border: 'none' }}>{q.type}</span>
                            <span className="tag" style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#e2e8f0', color: '#475569', border: 'none' }}>{q.element}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                    {questionList.loading && <div className="p-8 text-center text-muted">Memuat soal {newPackageMapel}...</div>}
                    {!questionList.loading && questions.length === 0 && (
                      <div className="p-8 text-center text-muted">Belum ada soal {newPackageMapel} yang sesuai.</div>
                    )}
                  </div>
                  <Pagination page={questionPage} total={questionList.total} pageSize={questionsPerPage} onChange={setQuestionPage} loading={questionList.loading} />
                </div>
                
                <div className="flex justify-between items-center mt-4 p-4" style={{ background: 'rgba(0, 82, 204, 0.05)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Soal Terpilih</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)' }}>{selectedQuestionIds.length} soal dipilih</div>
                  </div>
                  <button className="btn" disabled={isSavingPackage} style={{ opacity: isSavingPackage ? 0.7 : 1 }} onClick={handleSavePackage}>
                    {isSavingPackage ? 'Menyimpan...' : 'Simpan Paket Try Out'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'results' && <AnalyticsReports />}

        {activeTab === 'settings' && (
          <div className="animate-fade-in glass-panel p-8 flex flex-col items-center justify-center text-center" style={{ minHeight: '400px' }}>
            <Settings size={48} style={{ color: 'var(--primary-light)', marginBottom: '1rem' }} />
            <h2>Modul {tabs.find(t => t.id === activeTab)?.name}</h2>
            <p style={{ maxWidth: '400px' }}>Pengaturan sistem global.</p>
          </div>
        )}
    </WorkspaceShell>
  );
};

export default AdminDashboard;
