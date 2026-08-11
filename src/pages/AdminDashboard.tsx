import React, { useState, useEffect } from 'react';
import { 
  Users, 
  BookOpen, 
  Settings, 
  BarChart3, 
  LogOut,
  Plus,
  Search,
  LineChart,
  Download,
  Upload,
  Image as ImageIcon,
  FileText,
  BarChart2,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Eye
} from 'lucide-react';
import AnalysisDetailModal from '../components/AnalysisDetailModal';

const AdminDashboard = ({ user, onLogout }: { user?: any, onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [isAddingPackage, setIsAddingPackage] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userPage, setUserPage] = useState(1);
  const usersPerPage = 10;
  
  const [packages, setPackages] = useState<any[]>([]);
  
  // Package Form State
  const [newPackageName, setNewPackageName] = useState('');
  const [newPackageMapel, setNewPackageMapel] = useState('Matematika (Numerasi)');
  const [newPackageDuration, setNewPackageDuration] = useState(90);
  const [newPackageNavMode, setNewPackageNavMode] = useState('bebas');
  const [newPackageReleaseMode, setNewPackageReleaseMode] = useState('langsung');
  const [newPackageToken, setNewPackageToken] = useState('');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [isSavingPackage, setIsSavingPackage] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolPage, setSchoolPage] = useState(1);
  const schoolsPerPage = 10;

  const [questions, setQuestions] = useState<any[]>([]);
  const [questionPage, setQuestionPage] = useState(1);
  const questionsPerPage = 5;
  
  // Analytics State
  const [analyticsPackages, setAnalyticsPackages] = useState<any[]>([]);
  const [selectedAnalyticsPackage, setSelectedAnalyticsPackage] = useState<any>(null);
  const [packageAnalyticsData, setPackageAnalyticsData] = useState<any>(null);
  const [selectedAnalyticsSchool, setSelectedAnalyticsSchool] = useState<any>(null);
  const [schoolStudentsData, setSchoolStudentsData] = useState<any[]>([]);

  // School State
  const [isAddingSchool, setIsAddingSchool] = useState(false);
  const [editingSchool, setEditingSchool] = useState<any>(null);
  const [schoolNameInput, setSchoolNameInput] = useState('');
  const [schoolRegionInput, setSchoolRegionInput] = useState('');
  const [schoolNpsnInput, setSchoolNpsnInput] = useState('');
  const [isSavingSchool, setIsSavingSchool] = useState(false);
  
  // Analysis Detail State
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Add User State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [newSchoolNpsn, setNewSchoolNpsn] = useState('');
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userErrorMsg, setUserErrorMsg] = useState('');

  const fetchUsers = () => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(err => console.error("Error fetching users:", err));
  };

  const fetchSchools = () => {
    fetch('/api/schools')
      .then(res => res.json())
      .then(data => setSchools(data))
      .catch(err => console.error("Error fetching schools:", err));
  };

  useEffect(() => {
    if (activeTab === 'accounts') {
      fetchUsers();
      fetchSchools();
    } else if (activeTab === 'schools') {
      fetchSchools();
    } else if (activeTab === 'packages') {
      const fetchPackages = () => {
        fetch('/api/packages')
          .then(res => res.json())
          .then(data => setPackages(data))
          .catch(err => console.error("Error fetching packages:", err));
      };
      fetchPackages();

      fetch('/api/questions')
        .then(res => res.json())
        .then(data => setQuestions(data))
        .catch(err => console.error("Error fetching questions:", err));
    } else if (activeTab === 'results') {
      fetch('/api/analytics/packages')
        .then(res => res.json())
        .then(data => setAnalyticsPackages(data))
        .catch(err => console.error("Error fetching analytics packages:", err));
    }
  }, [activeTab]);

  const handleSelectAnalyticsPackage = (pkg: any) => {
    setSelectedAnalyticsPackage(pkg);
    setSelectedAnalyticsSchool(null);
    setPackageAnalyticsData(null);
    fetch(`/api/analytics/packages/${pkg.id}`)
      .then(res => res.json())
      .then(data => setPackageAnalyticsData(data))
      .catch(err => console.error(err));
  };

  const handleSelectAnalyticsSchool = (school: any) => {
    setSelectedAnalyticsSchool(school);
    setSchoolStudentsData([]);
    fetch(`/api/analytics/packages/${selectedAnalyticsPackage.id}/schools/${school.npsn}`)
      .then(res => res.json())
      .then(data => setSchoolStudentsData(data))
      .catch(err => console.error(err));
  };

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
        alert('Format CSV tidak valid atau kosong. Pastikan format: npsn,name,region');
        return;
      }
  
      try {
        const res = await fetch('/api/schools/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schools: schoolsData })
        });
        if (res.ok) {
          alert(`Berhasil mengimpor ${schoolsData.length} data sekolah!`);
          fetchSchools();
        } else {
          alert('Terjadi kesalahan saat impor data.');
        }
      } catch(err) {
        alert('Gagal menghubungi server.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSavePackage = async () => {
    if (!newPackageName || !newPackageToken) {
      alert("Nama Paket dan Token Ujian wajib diisi!");
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
        const pkgs = await fetch('/api/packages').then(r => r.json());
        setPackages(pkgs);
      } else {
        const err = await res.json();
        alert(`Gagal: ${err.error || 'Terjadi kesalahan'}`);
      }
    } catch (err) {
      alert("Terjadi kesalahan jaringan");
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
    <div className="flex" style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="glass-panel" style={{ width: '280px', margin: '1rem', display: 'flex', flexDirection: 'column' }}>
        <div className="p-6">
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Super Admin</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>{user?.school?.name || 'Pusat TKA'}</p>
        </div>
        
        <nav style={{ flex: 1, padding: '0 1rem' }}>
          {tabs.map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-4"
              style={{
                width: '100%',
                padding: '12px 16px',
                marginBottom: '8px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === tab.id ? 'var(--primary-color)' : 'transparent',
                color: activeTab === tab.id ? 'white' : 'var(--text-main)',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 600 : 500,
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              {tab.icon}
              {tab.name}
            </button>
          ))}
        </nav>

        <div className="p-6 mt-auto">
          <button 
            onClick={onLogout}
            className="flex items-center gap-4"
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'rgba(255, 0, 0, 0.1)',
              color: '#d32f2f',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            <LogOut size={20} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '2rem', height: '100vh', overflowY: 'auto' }}>
        <header className="flex justify-between items-center mb-8">
          <h1>{tabs.find(t => t.id === activeTab)?.name}</h1>
          <div className="flex items-center gap-4">
            <div className="input-group" style={{ marginBottom: 0, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="text" className="input-field" placeholder="Cari..." style={{ paddingLeft: '40px', width: '250px' }} />
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary-light)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              SA
            </div>
          </div>
        </header>

        {activeTab === 'overview' && (
          <div className="animate-fade-in">
            <div className="dashboard-grid" style={{ marginTop: 0 }}>
              <div className="glass-panel card flex flex-col justify-center">
                <p>Total Pengguna Sistem</p>
                <h2 style={{ fontSize: '3rem', margin: '0.5rem 0 0 0', color: 'var(--primary-color)' }}>{users.length}</h2>
              </div>
              <div className="glass-panel card flex flex-col justify-center">
                <p>Total Siswa Aktif</p>
                <h2 style={{ fontSize: '3rem', margin: '0.5rem 0 0 0', color: 'var(--primary-color)' }}>
                  {users.filter(u => u.role === 'siswa').length}
                </h2>
              </div>
              <div className="glass-panel card flex flex-col justify-center">
                <p>Guru Penulis Soal</p>
                <h2 style={{ fontSize: '3rem', margin: '0.5rem 0 0 0', color: 'var(--primary-color)' }}>
                  {users.filter(u => u.role === 'guru').length}
                </h2>
              </div>
              <div className="glass-panel card flex flex-col justify-center">
                <p>Paket Try Out Aktif</p>
                <h2 style={{ fontSize: '3rem', margin: '0.5rem 0 0 0', color: 'var(--primary-color)' }}>{packages.length}</h2>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(0,0,0,0.02)' }}>
                  <th className="p-5" style={{ fontWeight: 600 }}>Nama / Institusi</th>
                  <th className="p-5" style={{ fontWeight: 600 }}>Peran</th>
                  <th className="p-5" style={{ fontWeight: 600 }}>Status</th>
                  <th className="p-5" style={{ fontWeight: 600 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.length > 0 ? users.slice((userPage - 1) * usersPerPage, userPage * usersPerPage).map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="p-5 font-semibold text-main">
                      {u.fullName} <br/>
                      <span className="text-muted" style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>{u.school?.name || 'Pusat'}</span>
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
                          onClick={() => {
                            setEditingUser(u);
                            setNewUsername(u.username);
                            setNewPassword(u.password);
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
                          onClick={() => {
                            if (window.confirm(`Yakin ingin menghapus pengguna ${u.fullName}?`)) {
                              fetch(`/api/users/${u.id}`, { method: 'DELETE' })
                                .then(res => {
                                  if (res.ok) fetchUsers();
                                  else alert('Gagal menghapus pengguna');
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
            
            {/* Pagination for Users */}
            {users.length > usersPerPage && (
              <div className="flex justify-between items-center mt-6 p-4" style={{ background: '#f8fafc', borderRadius: '8px' }}>
                <button className="btn-secondary" disabled={userPage === 1} onClick={() => setUserPage(p => Math.max(1, p - 1))} style={{ opacity: userPage === 1 ? 0.5 : 1 }}>Sebelumnya</button>
                <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Halaman {userPage} dari {Math.ceil(users.length / usersPerPage)}</span>
                <button className="btn-secondary" disabled={userPage >= Math.ceil(users.length / usersPerPage)} onClick={() => setUserPage(p => Math.min(Math.ceil(users.length / usersPerPage), p + 1))} style={{ opacity: userPage >= Math.ceil(users.length / usersPerPage) ? 0.5 : 1 }}>Selanjutnya</button>
              </div>
            )}
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
                <select className="input-field" value={newSchoolNpsn} onChange={e => setNewSchoolNpsn(e.target.value)}>
                  <option value="">Pilih Sekolah...</option>
                  {schools.map(s => (
                    <option key={s.npsn} value={s.npsn}>{s.name} (NPSN: {s.npsn})</option>
                  ))}
                </select>
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
              <input type="text" className="input-field" placeholder="Ketik password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
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
                <select className="input-field" value={newSchoolNpsn} onChange={e => setNewSchoolNpsn(e.target.value)}>
                  <option value="">Pilih Sekolah...</option>
                  {schools.map(s => (
                    <option key={s.npsn} value={s.npsn}>{s.name} (NPSN: {s.npsn})</option>
                  ))}
                </select>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(0,0,0,0.02)' }}>
                  <th className="p-5" style={{ fontWeight: 600 }}>NPSN</th>
                  <th className="p-5" style={{ fontWeight: 600 }}>Nama Sekolah</th>
                  <th className="p-5" style={{ fontWeight: 600 }}>Wilayah</th>
                  <th className="p-5" style={{ fontWeight: 600 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {schools.length > 0 ? schools.slice((schoolPage - 1) * schoolsPerPage, schoolPage * schoolsPerPage).map((s, i) => (
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
                          onClick={() => {
                            if (window.confirm('Hapus sekolah ini?')) {
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
            
            {/* Pagination for Schools */}
            {schools.length > schoolsPerPage && (
              <div className="flex justify-between items-center mt-6 p-4" style={{ background: '#f8fafc', borderRadius: '8px' }}>
                <button className="btn-secondary" disabled={schoolPage === 1} onClick={() => setSchoolPage(p => Math.max(1, p - 1))} style={{ opacity: schoolPage === 1 ? 0.5 : 1 }}>Sebelumnya</button>
                <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Halaman {schoolPage} dari {Math.ceil(schools.length / schoolsPerPage)}</span>
                <button className="btn-secondary" disabled={schoolPage >= Math.ceil(schools.length / schoolsPerPage)} onClick={() => setSchoolPage(p => Math.min(Math.ceil(schools.length / schoolsPerPage), p + 1))} style={{ opacity: schoolPage >= Math.ceil(schools.length / schoolsPerPage) ? 0.5 : 1 }}>Selanjutnya</button>
              </div>
            )}
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
                setSelectedQuestionIds([]);
                setIsAddingPackage(true);
              }}>
                <Plus size={18} /> Buat Paket Baru
              </button>
            </div>
            
            <div className="dashboard-grid" style={{ marginTop: 0 }}>
              {packages.length > 0 ? packages.map((pkg, i) => (
                <div key={pkg.id} className="glass-panel card flex flex-col">
                  <div className="flex justify-between mb-4">
                    <span className="tag">{pkg.mapel}</span>
                    <span style={{ 
                      color: pkg.status === 'aktif' ? 'green' : 'orange',
                      background: pkg.status === 'aktif' ? 'rgba(0,128,0,0.1)' : 'rgba(255,165,0,0.1)',
                      padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600
                    }}>
                      {pkg.status.toUpperCase()}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{pkg.name}</h3>
                  <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem', flexGrow: 1 }}>Terdiri dari {pkg._count?.questions || 0} soal terpilih.</p>
                  <div className="flex gap-2">
                    <button className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.9rem' }} onClick={() => {
                      setEditingPackageId(pkg.id);
                      setNewPackageName(pkg.name);
                      setNewPackageMapel(pkg.mapel);
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
                        if (confirm('Ubah status paket menjadi AKTIF? Paket yang aktif dapat diakses siswa.')) {
                          await fetch(`/api/packages/${pkg.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'aktif' })
                          });
                          const pkgs = await fetch('/api/packages').then(r => r.json());
                          setPackages(pkgs);
                        }
                      }}>Buka Ujian</button>
                    ) : (
                      <button className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.9rem', color: '#d32f2f', border: '1px solid #d32f2f' }} onClick={async () => {
                        if (confirm('Nonaktifkan paket ujian ini? Siswa tidak akan bisa masuk menggunakan token ini lagi.')) {
                          await fetch(`/api/packages/${pkg.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'draft' })
                          });
                          const pkgs = await fetch('/api/packages').then(r => r.json());
                          setPackages(pkgs);
                        }
                      }}>Tutup Ujian</button>
                    )}
                  </div>
                </div>
              )) : (
                <div className="glass-panel card p-8 text-center" style={{ gridColumn: '1 / -1' }}>
                  <p className="text-muted">Belum ada paket soal (atau sedang memuat API).</p>
                </div>
              )}
            </div>
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
                  <select className="input-field" value={newPackageMapel} onChange={e => setNewPackageMapel(e.target.value)}>
                    <option value="Matematika (Numerasi)">Matematika (Numerasi)</option>
                    <option value="Bahasa Indonesia (Literasi Membaca)">Bahasa Indonesia (Literasi Membaca)</option>
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
                <h3 className="mb-4" style={{ fontSize: '1.1rem' }}>2. Pilih Soal dari Bank</h3>
                <div className="input-group" style={{ marginBottom: '1rem', position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input type="text" className="input-field" placeholder="Cari ID soal atau teks..." style={{ paddingLeft: '36px' }} />
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white' }}>
                  <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Menampilkan soal (Total: {questions.length})</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {questions.slice((questionPage - 1) * questionsPerPage, questionPage * questionsPerPage).map((q, idx) => ( 
                      <label key={q.id} className="flex items-start gap-4 p-5" style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', background: idx % 2 === 0 ? '#f8fafc' : 'white', transition: 'all 0.2s ease' }}>
                        <input type="checkbox" style={{ marginTop: '5px', width: '18px', height: '18px' }} checked={selectedQuestionIds.includes(q.id)} onChange={(e) => {
                          if (e.target.checked) setSelectedQuestionIds([...selectedQuestionIds, q.id]);
                          else setSelectedQuestionIds(selectedQuestionIds.filter(id => id !== q.id));
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '4px' }}>ID: {q.id.substring(0, 8)}</div>
                          <div style={{ fontSize: '0.95rem', lineHeight: '1.5', color: '#334155', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            {q.imageUrl && <ImageIcon size={16} style={{ color: 'var(--primary-color)', flexShrink: 0, marginTop: '2px' }} />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {q.content?.length > 120 ? q.content.substring(0, 120) + '...' : q.content}
                            </span>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <span className="tag" style={{ fontSize: '0.75rem', padding: '4px 10px', background: 'var(--primary-light)', color: 'white', border: 'none' }}>{q.type}</span>
                            <span className="tag" style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#e2e8f0', color: '#475569', border: 'none' }}>{q.element}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                    {questions.length === 0 && (
                      <div className="p-8 text-center text-muted">Belum ada soal di bank soal.</div>
                    )}
                  </div>
                  {questions.length > questionsPerPage && (
                    <div className="flex justify-between items-center p-4" style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                      <button className="btn-secondary" disabled={questionPage === 1} onClick={() => setQuestionPage(p => Math.max(1, p - 1))} style={{ padding: '6px 12px', fontSize: '0.85rem', opacity: questionPage === 1 ? 0.5 : 1 }}>Sebelumnya</button>
                      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Halaman {questionPage} dari {Math.ceil(questions.length / questionsPerPage)}</span>
                      <button className="btn-secondary" disabled={questionPage >= Math.ceil(questions.length / questionsPerPage)} onClick={() => setQuestionPage(p => Math.min(Math.ceil(questions.length / questionsPerPage), p + 1))} style={{ padding: '6px 12px', fontSize: '0.85rem', opacity: questionPage >= Math.ceil(questions.length / questionsPerPage) ? 0.5 : 1 }}>Selanjutnya</button>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-between items-center mt-4 p-4" style={{ background: 'rgba(0, 82, 204, 0.05)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Soal Terpilih</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)' }}>{selectedQuestionIds.length} / {questions.length}</div>
                  </div>
                  <button className="btn" disabled={isSavingPackage} style={{ opacity: isSavingPackage ? 0.7 : 1 }} onClick={handleSavePackage}>
                    {isSavingPackage ? 'Menyimpan...' : 'Simpan Paket Try Out'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2>Analitik Hasil Try Out</h2>
                <p className="text-muted">Data performa berdasarkan hirarki Paket &rarr; Sekolah &rarr; Siswa.</p>
              </div>
            </div>
            
            {!selectedAnalyticsPackage ? (
              // Step 1: List Packages
              <div className="glass-panel">
                <h3 className="mb-4 text-lg font-semibold border-b pb-2">Pilih Paket Ujian</h3>
                {analyticsPackages.length === 0 ? (
                  <div className="p-8 text-center text-muted">Belum ada paket dengan sesi selesai.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analyticsPackages.map(pkg => (
                      <div key={pkg.id} className="p-4 border border-slate-200 rounded-lg hover:border-blue-500 cursor-pointer transition-colors" onClick={() => handleSelectAnalyticsPackage(pkg)}>
                        <div className="font-semibold text-lg text-slate-800">{pkg.name}</div>
                        <div className="text-sm text-slate-500 mt-1">Mata Pelajaran: {pkg.mapel}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : !selectedAnalyticsSchool ? (
              // Step 2: List Schools for the selected package
              <div className="animate-fade-in">
                <div className="mb-6 flex items-center gap-3">
                  <button className="btn btn-outline" onClick={() => setSelectedAnalyticsPackage(null)}>
                    &larr; Kembali ke Daftar Paket
                  </button>
                  <h3 className="text-lg font-bold m-0">Paket: {selectedAnalyticsPackage.name}</h3>
                </div>

                {!packageAnalyticsData ? (
                  <div className="glass-panel p-8 text-center animate-pulse">Memuat data sekolah...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                      <div className="glass-panel p-4 text-center">
                        <div className="text-sm text-slate-500">Total Peserta</div>
                        <div className="text-2xl font-bold text-blue-600">{packageAnalyticsData.summary?.totalParticipants || 0}</div>
                      </div>
                      <div className="glass-panel p-4 text-center">
                        <div className="text-sm text-slate-500">Rata-rata Nilai</div>
                        <div className="text-2xl font-bold text-slate-700">{packageAnalyticsData.summary?.average?.toFixed(1) || 0}</div>
                      </div>
                      <div className="glass-panel p-4 text-center">
                        <div className="text-sm text-slate-500">Nilai Tertinggi</div>
                        <div className="text-2xl font-bold text-green-600">{packageAnalyticsData.summary?.highest?.toFixed(1) || 0}</div>
                      </div>
                      <div className="glass-panel p-4 text-center">
                        <div className="text-sm text-slate-500">Nilai Terendah</div>
                        <div className="text-2xl font-bold text-red-600">{packageAnalyticsData.summary?.lowest?.toFixed(1) || 0}</div>
                      </div>
                    </div>

                    <div className="glass-panel">
                      <h3 className="mb-4 text-lg font-semibold border-b pb-2">Daftar Sekolah Peserta</h3>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>NPSN</th>
                            <th>Nama Sekolah</th>
                            <th>Jumlah Peserta</th>
                            <th>Rata-rata Sekolah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {packageAnalyticsData.schools.map((sch: any) => (
                            <tr key={sch.npsn} onClick={() => handleSelectAnalyticsSchool(sch)} style={{ cursor: 'pointer' }} className="hover:bg-slate-50">
                              <td>{sch.npsn}</td>
                              <td className="font-semibold">{sch.name}</td>
                              <td>{sch.participantCount} Siswa</td>
                              <td>
                                <span className="tag" style={{ background: 'var(--primary-color)', color: 'white' }}>
                                  {sch.averageScore?.toFixed(1)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ) : (
              // Step 3: List Students for the selected school
              <div className="animate-fade-in">
                <div className="mb-6 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <button className="btn btn-outline" onClick={() => setSelectedAnalyticsSchool(null)}>
                      &larr; Kembali ke Daftar Sekolah
                    </button>
                    <div>
                      <h3 className="text-lg font-bold m-0">{selectedAnalyticsSchool.name}</h3>
                      <div className="text-sm text-slate-500">Paket: {selectedAnalyticsPackage.name}</div>
                    </div>
                  </div>
                  <button className="btn flex items-center gap-2" onClick={() => {
                    const header = "NISN,Nama Siswa,Skor Total,Waktu Selesai\n";
                    const csv = schoolStudentsData.map((a: any) => `${a.nisn},"${a.studentName}",${a.score},${a.endTime}`).join('\n');
                    const blob = new Blob([header + csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `analitik_${selectedAnalyticsSchool.npsn}.csv`;
                    a.click();
                  }}>
                    <Download size={18} /> Ekspor CSV Sekolah
                  </button>
                </div>

                <div className="glass-panel" style={{ overflowX: 'auto' }}>
                  {schoolStudentsData.length === 0 ? (
                    <div className="p-8 text-center animate-pulse">Memuat data siswa...</div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Nama Siswa / NISN</th>
                          <th>Total Skor</th>
                          <th>Analisis per Elemen</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schoolStudentsData.map((item: any, idx: number) => (
                          <tr key={idx}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{item.studentName}</div>
                              <div className="text-muted" style={{ fontSize: '0.85rem' }}>{item.nisn}</div>
                            </td>
                            <td>
                              <span className="tag" style={{ background: 'var(--primary-color)', color: 'white' }}>
                                {Math.round(item.score || 0)}
                              </span>
                            </td>
                            <td>
                              <div className="flex flex-col gap-1">
                                {Object.keys(item.elementBreakdown || {}).map(el => (
                                  <div key={el} style={{ fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', maxWidth: '300px', borderBottom: '1px solid #f1f5f9', paddingBottom: '2px' }}>
                                    <span>{el}:</span>
                                    <strong>{item.elementBreakdown[el].correct} / {item.elementBreakdown[el].total}</strong>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td>
                              <button 
                                className="btn btn-outline" 
                                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                onClick={() => setSelectedSessionId(item.sessionId)}
                              >
                                <Eye size={16} /> Lihat Detail
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
            
            {/* Modal Detail Analisis */}
            {selectedSessionId && (
              <AnalysisDetailModal 
                sessionId={selectedSessionId} 
                onClose={() => setSelectedSessionId(null)} 
              />
            )}
          </div>
        )}

        {/* Placeholder for other tabs */}
        {activeTab === 'settings' && (
          <div className="animate-fade-in glass-panel p-8 flex flex-col items-center justify-center text-center" style={{ minHeight: '400px' }}>
            <Settings size={48} style={{ color: 'var(--primary-light)', marginBottom: '1rem' }} />
            <h2>Modul {tabs.find(t => t.id === activeTab)?.name}</h2>
            <p style={{ maxWidth: '400px' }}>Pengaturan sistem global.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
