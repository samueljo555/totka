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
  Upload
} from 'lucide-react';

const AdminDashboard = ({ user, onLogout }: { user?: any, onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [isAddingPackage, setIsAddingPackage] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userPage, setUserPage] = useState(1);
  const usersPerPage = 10;
  
  const [packages, setPackages] = useState<any[]>([]);
  
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolPage, setSchoolPage] = useState(1);
  const schoolsPerPage = 10;

  const [questions, setQuestions] = useState<any[]>([]);
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
      fetch('/api/packages')
        .then(res => res.json())
        .then(data => setPackages(data))
        .catch(err => console.error("Error fetching packages:", err));

      fetch('/api/questions')
        .then(res => res.json())
        .then(data => setQuestions(data))
        .catch(err => console.error("Error fetching questions:", err));
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
              <button className="btn" onClick={() => setIsAddingPackage(true)}>
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
                    <button className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.9rem' }}>Edit Paket</button>
                    {pkg.status === 'draft' && (
                      <button className="btn" style={{ flex: 1, padding: '8px', fontSize: '0.9rem' }}>Buka Ujian</button>
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
              <h2>Peracikan Paket Baru</h2>
              <button className="btn-secondary" onClick={() => setIsAddingPackage(false)}>Batal</button>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 0, gap: '2rem' }}>
              <div>
                <h3 className="mb-4" style={{ fontSize: '1.1rem' }}>1. Informasi & Konfigurasi</h3>
                <div className="input-group">
                  <label className="input-label">Nama Paket</label>
                  <input type="text" className="input-field" placeholder="Contoh: Try Out Nasional MTK 1" />
                </div>
                <div className="input-group">
                  <label className="input-label">Mata Pelajaran</label>
                  <select className="input-field">
                    <option>Matematika (Numerasi)</option>
                    <option>Bahasa Indonesia (Literasi Membaca)</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Durasi Waktu (Menit)</label>
                  <input type="number" className="input-field" placeholder="90" defaultValue={90} />
                </div>
                <div className="input-group">
                  <label className="input-label">Mode Navigasi</label>
                  <select className="input-field">
                    <option>Bebas (Bisa mundur ke soal sebelumnya)</option>
                    <option>Maju Terus (Tidak bisa mundur)</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Opsi Perilisan Nilai</label>
                  <select className="input-field">
                    <option>Langsung tampil setelah ujian selesai</option>
                    <option>Sembunyikan (Dirilis manual nanti)</option>
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
                        <input type="checkbox" style={{ marginTop: '5px', width: '18px', height: '18px' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '4px' }}>ID: {q.id.substring(0, 8)}</div>
                          <div style={{ fontSize: '0.95rem', lineHeight: '1.5', color: '#334155' }}>{q.content?.length > 120 ? q.content.substring(0, 120) + '...' : q.content}</div>
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
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)' }}>0 / 40</div>
                  </div>
                  <button className="btn" onClick={() => setIsAddingPackage(false)}>Simpan Paket Try Out</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="animate-fade-in glass-panel p-8 text-center text-muted">
            <LineChart size={48} style={{ color: 'var(--primary-light)', margin: '0 auto 1rem auto' }} />
            <h2>Analitik Skala Nasional</h2>
            <p>Belum ada data analitik hasil yang masuk. (Atau sedang memuat dari API)</p>
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
