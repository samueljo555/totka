import toast from 'react-hot-toast';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Activity, 
  LogOut,
  Plus,
  Upload,
  Download,
  Printer
} from 'lucide-react';
import { FilterBar } from '../components/FilterBar';
import { apiFetch } from '../lib/api';

const OperatorDashboard = ({ user, onLogout }: { user?: any, onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState('students');
  const [isAddingSiswa, setIsAddingSiswa] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  // Temporary passwords exist only in this page's memory after creation.
  const [issuedPasswords, setIssuedPasswords] = useState<Record<string, string>>({});
  const downloadCredentials = (credentials: { username: string; tempPassword: string }[]) => {
    if (credentials.length === 0) return;
    const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = ['username,password', ...credentials.map(c => `${csvCell(c.username)},${csvCell(c.tempPassword)}`)].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kredensial-siswa-baru.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const rememberCredentials = (credentials: { username: string; tempPassword: string }[]) => {
    setIssuedPasswords(prev => ({ ...prev, ...Object.fromEntries(credentials.map(c => [c.username, c.tempPassword])) }));
    downloadCredentials(credentials);
  };
  const [sessions, setSessions] = useState<any[]>([]);
  const [allPackages, setAllPackages] = useState<any[]>([]);
  const [selectedHistoryPackage, setSelectedHistoryPackage] = useState<any | null>(null);

  // Search, Filter & Loading States (Tahap 4 & 5)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingMonitoring, setIsLoadingMonitoring] = useState(false);

  // State for new siswa form
  const [newNisn, setNewNisn] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Derived State: Daftar Kelas Unik (Tahap 4)
  const uniqueClasses = useMemo(() => {
    const classes = new Set<string>();
    students.forEach((s) => {
      if (s.className && typeof s.className === 'string' && s.className.trim()) {
        classes.add(s.className.trim());
      }
    });
    return Array.from(classes).sort();
  }, [students]);

  // Derived State: Hasil Filter Siswa (Tahap 4)
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (s.fullName && s.fullName.toLowerCase().includes(q)) ||
        (s.nisn && s.nisn.toLowerCase().includes(q)) ||
        (s.className && s.className.toLowerCase().includes(q)) ||
        (s.username && s.username.toLowerCase().includes(q));

      const matchClass = !filterClass || s.className === filterClass;

      return matchSearch && matchClass;
    });
  }, [students, searchQuery, filterClass]);

  const fetchStudents = () => {
    setIsLoadingStudents(true);
    apiFetch('/api/users')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const schoolStudents = data.filter((u: any) => u.role === 'siswa' && u.schoolNpsn === user?.school?.npsn);
          setStudents(schoolStudents);
        }
      })
      .catch(err => console.error(err))
      .finally(() => {
        setIsLoadingStudents(false);
      });
  };

  useEffect(() => {
    if (activeTab === 'students') {
      fetchStudents();
    } else if (activeTab === 'monitoring' || activeTab === 'history') {
      setIsLoadingMonitoring(true);
      const npsn = user?.school?.npsn || '';
      
      Promise.all([
        apiFetch('/api/users').then(r => r.json()),
        apiFetch(`/api/sessions?schoolNpsn=${npsn}`).then(r => r.json()),
        apiFetch('/api/packages').then(r => r.json())
      ])
        .then(([usersData, sessionsData, packagesData]) => {
          if (Array.isArray(usersData)) {
            setStudents(usersData.filter((u: any) => u.role === 'siswa' && u.schoolNpsn === user?.school?.npsn));
          }
          if (Array.isArray(sessionsData)) setSessions(sessionsData);
          if (Array.isArray(packagesData)) setAllPackages(packagesData);
        })
        .catch(err => console.error(err))
        .finally(() => {
          setIsLoadingMonitoring(false);
        });
    }
  }, [activeTab, user]);

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const hasHeader = lines[0].toLowerCase().includes('nisn');
      const dataLines = hasHeader ? lines.slice(1) : lines;
      
      const studentsData = dataLines.map(line => {
        const [nisn, fullName, className] = line.split(',');
        return { 
          nisn: nisn?.trim(), 
          fullName: fullName?.trim(), 
          className: className?.trim() || '' 
        };
      }).filter(s => s.nisn && s.fullName);

      if (studentsData.length === 0) {
        toast.error('Format CSV tidak valid atau kosong. Pastikan format: nisn,fullName,className');
        return;
      }

      try {
        const res = await apiFetch('/api/users/siswa/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            students: studentsData, 
            schoolNpsn: user?.school?.npsn 
          })
        });
        if (res.ok) {
          const result = await res.json();
          rememberCredentials(result.credentials || []);
          toast.success(`Berhasil mengimpor ${result.count} siswa. Simpan berkas kredensial yang diunduh.`);
          fetchStudents();
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

  const handlePrintKartuLogin = () => {
    if (students.length === 0) return toast("Belum ada data siswa untuk dicetak.");
    const printWindow = window.open('', '_blank');
    if (!printWindow) return toast.error("Pop-up diblokir. Harap izinkan pop-up untuk mencetak kartu.");
    
    const escapeHtml = (value: string) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    let html = `
      <html>
        <head>
          <title>Kartu Login Siswa - ${escapeHtml(user?.school?.name || 'Sekolah')}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            .card-container {
              display: flex;
              flex-wrap: wrap;
              gap: 20px;
              justify-content: flex-start;
            }
            .card {
              border: 2px dashed #ccc;
              border-radius: 8px;
              padding: 15px;
              width: 300px;
              box-sizing: border-box;
              page-break-inside: avoid;
              margin-bottom: 20px;
            }
            .header { text-align: center; font-weight: bold; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px; font-size: 16px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
            .label { color: #555; }
            .value { font-weight: bold; }
            .school-name { text-align: center; font-size: 12px; color: #777; margin-bottom: 10px; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 20px;">
            <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor: pointer; background: #0070f3; color: white; border: none; border-radius: 5px;">🖨️ Print Kartu</button>
          </div>
          <div class="card-container">
    `;

    students.forEach(siswa => {
      html += `
        <div class="card">
          <div class="header">KARTU UJIAN TRY OUT</div>
          <div class="school-name">${escapeHtml(user?.school?.name || '')}</div>
          <div class="row">
            <span class="label">Nama:</span>
            <span class="value">${escapeHtml(siswa.fullName)}</span>
          </div>
          <div class="row">
            <span class="label">Kelas:</span>
            <span class="value">${escapeHtml(siswa.className || '-')}</span>
          </div>
          <div class="row">
            <span class="label">Username (NISN):</span>
            <span class="value">${escapeHtml(siswa.nisn || siswa.username)}</span>
          </div>
          <div class="row">
            <span class="label">Password:</span>
            <span class="value">${escapeHtml(issuedPasswords[siswa.username] || 'Tidak ditampilkan')}</span>
          </div>
        </div>
      `;
    });

    html += `
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const tabs = [
    { id: 'students', name: 'Manajemen Siswa', icon: <Users size={20} /> },
    { id: 'monitoring', name: 'Pantau Ujian', icon: <Activity size={20} /> },
    { id: 'history', name: 'Riwayat Ujian', icon: <Download size={20} /> },
  ];

  return (
    <div className="flex" style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="glass-panel" style={{ width: '280px', margin: '1rem', display: 'flex', flexDirection: 'column' }}>
        <div className="p-6">
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Operator Sekolah</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>{user?.school?.name || 'Sekolah Pusat / Belum Terdaftar'}</p>
        </div>
        
        <nav style={{ flex: 1, padding: '0 1rem' }}>
          {tabs.map(tab => (
            <button 
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setIsAddingSiswa(false); }}
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
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1>{tabs.find(t => t.id === activeTab)?.name}</h1>
          <div className="flex items-center gap-4">
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--secondary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              OP
            </div>
          </div>
        </header>

        {activeTab === 'students' && !isAddingSiswa && (
          <div className="animate-fade-in glass-panel p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2>Daftar Siswa</h2>
                <p>Kelola data akun siswa di sekolah Anda (tambah satuan atau impor CSV).</p>
                <p style={{ fontSize: '0.85rem' }}>Simpan CSV kredensial setelah pendaftaran. Password tidak dapat dibaca kembali setelah halaman dimuat ulang.</p>
              </div>
              <div className="flex gap-2">
                {Object.keys(issuedPasswords).length > 0 && (
                  <button className="btn-secondary" onClick={() => downloadCredentials(Object.entries(issuedPasswords).map(([username, tempPassword]) => ({ username, tempPassword })))}>
                    <Download size={16} /> Unduh Kredensial Baru
                  </button>
                )}
                <button className="btn-secondary" onClick={handlePrintKartuLogin} style={{ margin: 0, background: '#f8fafc', color: '#0f172a', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                  <Printer size={16} /> Cetak Kartu Login
                </button>
                <input type="file" id="csv-upload" accept=".csv" style={{ display: 'none' }} onChange={handleImportCsv} />
                <label htmlFor="csv-upload" className="btn-secondary" style={{ margin: 0, padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                  <Upload size={16} /> Import CSV
                </label>
                <button className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => {
                  setNewNisn('');
                  setNewFullName('');
                  setNewClassName('');
                  setIsAddingSiswa(true);
                }}>
                  <Plus size={16} /> Tambah Siswa
                </button>
              </div>
            </div>

            {/* Reusable FilterBar (Tahap 4 & 6) */}
            <FilterBar
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Cari siswa (Nama / NISN / Kelas)..."
              filterValue={filterClass}
              onFilterChange={setFilterClass}
              filterOptions={uniqueClasses}
              filterPlaceholder="Semua Kelas"
              onReset={() => {
                setSearchQuery('');
                setFilterClass('');
              }}
            />

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                  <th className="p-4">NISN</th>
                  <th className="p-4">Nama Lengkap</th>
                  <th className="p-4">Kelas</th>
                  <th className="p-4">Password Sementara</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingStudents ? (
                  /* Loading Shimmer Skeletons (Tahap 5) */
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={`skeleton-${idx}`} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      <td className="p-4">
                        <div className="skeleton-shimmer" style={{ height: '18px', width: '110px' }} />
                      </td>
                      <td className="p-4">
                        <div className="skeleton-shimmer" style={{ height: '18px', width: `${150 + (idx % 3) * 35}px` }} />
                      </td>
                      <td className="p-4">
                        <div className="skeleton-shimmer" style={{ height: '18px', width: '60px', borderRadius: '12px' }} />
                      </td>
                      <td className="p-4">
                        <div className="skeleton-shimmer" style={{ height: '18px', width: '85px' }} />
                      </td>
                    </tr>
                  ))
                ) : filteredStudents.length > 0 ? (
                  filteredStudents.map((siswa) => (
                    <tr key={siswa.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      <td className="p-4 font-semibold">{siswa.nisn || '-'}</td>
                      <td className="p-4 text-main">{siswa.fullName}</td>
                      <td className="p-4">
                        <span className="tag">{siswa.className || '-'}</span>
                      </td>
                      <td className="p-4 text-muted" style={{ fontFamily: 'monospace' }}>
                        {issuedPasswords[siswa.username] || 'Tidak ditampilkan'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted" style={{ padding: '3rem 1rem' }}>
                      {searchQuery || filterClass ? (
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                            Tidak ada siswa yang cocok dengan filter pencarian.
                          </p>
                          <p style={{ fontSize: '0.85rem' }}>
                            Silakan coba kata kunci lain atau klik tombol <strong>Reset Filter</strong>.
                          </p>
                        </div>
                      ) : (
                        'Belum ada siswa terdaftar (Silakan tambah siswa baru atau impor dari file CSV).'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'students' && isAddingSiswa && (
          <div className="animate-fade-in glass-panel p-8" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className="flex justify-between items-center mb-6">
              <h2>Formulir Pendaftaran Siswa</h2>
              <button className="btn-secondary" onClick={() => setIsAddingSiswa(false)}>Batal</button>
            </div>

            {errorMsg && (
              <div className="p-4 mb-4" style={{ background: 'rgba(255, 0, 0, 0.1)', color: 'red', borderRadius: '8px' }}>
                {errorMsg}
              </div>
            )}

            <div className="input-group">
              <label className="input-label">Nomor Induk Siswa Nasional (NISN) - Sbg Username</label>
              <input type="text" className="input-field" placeholder="Contoh: 0091234567" value={newNisn} onChange={e => setNewNisn(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Nama Lengkap</label>
              <input type="text" className="input-field" placeholder="Ketik nama lengkap siswa" value={newFullName} onChange={e => setNewFullName(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label">Kelas (Atribut Profil)</label>
              <input type="text" className="input-field" placeholder="Ketik nama kelas (mis. 6A, VII-B)" value={newClassName} onChange={e => setNewClassName(e.target.value)} />
            </div>
            
            <div className="p-4 mt-6" style={{ background: 'rgba(0, 82, 204, 0.05)', borderRadius: '8px' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Catatan: Password sementara diunduh setelah pendaftaran. Simpan berkas tersebut dengan aman; password tidak dapat dibaca kembali setelah halaman dimuat ulang.</p>
            </div>

            <button 
              className="btn mt-6" 
              style={{ width: '100%', opacity: isSaving ? 0.7 : 1 }} 
              disabled={isSaving}
              onClick={() => {
                if (!newNisn || !newFullName) {
                  setErrorMsg('NISN dan Nama Lengkap harus diisi.');
                  return;
                }
                setIsSaving(true);
                setErrorMsg('');
                apiFetch('/api/users/siswa', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    nisn: newNisn,
                    fullName: newFullName,
                    className: newClassName,
                    schoolNpsn: user?.school?.npsn
                  })
                })
                .then(async res => {
                  if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Terjadi kesalahan saat menyimpan');
                  }
                  return res.json();
                })
                .then(data => {
                  rememberCredentials([{ username: data.user.username, tempPassword: data.user.tempPassword }]);
                  toast.success('Siswa dibuat. Simpan berkas kredensial yang diunduh.');
                  setIsSaving(false);
                  setIsAddingSiswa(false);
                  setNewNisn('');
                  setNewFullName('');
                  setNewClassName('');
                  fetchStudents();
                })
                .catch(err => {
                  setErrorMsg(err.message);
                  setIsSaving(false);
                });
              }}
            >
              {isSaving ? 'Menyimpan...' : 'Simpan Data Siswa'}
            </button>
          </div>
        )}

        {activeTab === 'monitoring' && (() => {
          const activePackages = allPackages.filter(p => p.status === 'aktif');
          
          return (
            <div className="animate-fade-in glass-panel p-8">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2>Pantau Pengerjaan Ujian</h2>
                  <p>Monitor status try out siswa secara real-time untuk paket ujian yang sedang aktif.</p>
                </div>
              </div>

              {isLoadingMonitoring ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div className="skeleton-shimmer" style={{ height: '140px', borderRadius: '12px' }} />
                  <div className="skeleton-shimmer" style={{ height: '140px', borderRadius: '12px' }} />
                </div>
              ) : activePackages.length === 0 ? (
                <div className="p-8 text-center text-muted" style={{ border: '1px dashed #cbd5e1', borderRadius: '12px' }}>
                  Tidak ada paket ujian yang sedang aktif saat ini.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {activePackages.map(pkg => {
                    const pkgSessions = sessions.filter(s => s.packageId === pkg.id);
                    const finished = pkgSessions.filter(s => s.status === 'selesai').length;
                    const ongoing = pkgSessions.filter(s => s.status === 'sedang_mengerjakan').length;
                    const notStarted = Math.max(0, students.length - finished - ongoing);

                    return (
                      <div key={pkg.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{pkg.name}</h3>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>Token: <strong style={{ letterSpacing: '1px', color: 'var(--primary-color)' }}>{pkg.token}</strong></div>
                          </div>
                          <span className="tag" style={{ background: 'rgba(0,128,0,0.1)', color: 'green' }}>AKTIF</span>
                        </div>
                        
                        <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', padding: '1.5rem', margin: 0, gap: '1rem' }}>
                          <div className="card" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1rem' }}>
                            <h3 style={{ fontSize: '2rem', color: '#64748b', margin: 0 }}>{notStarted}</h3>
                            <p style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Belum Mengerjakan</p>
                          </div>
                          <div className="card" style={{ background: 'rgba(0, 184, 217, 0.1)', border: '1px solid rgba(0, 184, 217, 0.3)', borderRadius: '12px', padding: '1rem' }}>
                            <h3 style={{ fontSize: '2rem', color: '#00b8d9', margin: 0 }}>{ongoing}</h3>
                            <p style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sedang Mengerjakan</p>
                          </div>
                          <div className="card" style={{ background: 'rgba(0, 128, 0, 0.1)', border: '1px solid rgba(0, 128, 0, 0.3)', borderRadius: '12px', padding: '1rem' }}>
                            <h3 style={{ fontSize: '2rem', color: 'green', margin: 0 }}>{finished}</h3>
                            <p style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Selesai Ujian</p>
                          </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', borderTop: '1px solid #e2e8f0' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc' }}>
                              <th className="p-4" style={{ fontSize: '0.85rem', color: '#64748b' }}>Nama Siswa</th>
                              <th className="p-4" style={{ fontSize: '0.85rem', color: '#64748b' }}>Kelas</th>
                              <th className="p-4" style={{ fontSize: '0.85rem', color: '#64748b' }}>Status Pengerjaan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {students.length > 0 ? students.map((student) => {
                              const session = pkgSessions.find(s => s.studentId === student.id);
                              return (
                                <tr key={student.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                  <td className="p-4 font-semibold text-main">{student.fullName || '-'}</td>
                                  <td className="p-4">{student.className || '-'}</td>
                                  <td className="p-4">
                                    {!session ? (
                                      <span className="tag" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}>Belum Mengerjakan</span>
                                    ) : session.status === 'selesai' ? (
                                      <span className="tag" style={{ background: 'rgba(0, 128, 0, 0.1)', color: 'green', border: '1px solid green', fontSize: '0.75rem' }}>Selesai</span>
                                    ) : (
                                      <span className="tag" style={{ background: 'rgba(0, 184, 217, 0.1)', color: '#00b8d9', border: '1px solid #00b8d9', fontSize: '0.75rem' }}>Sedang Mengerjakan</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            }) : (
                              <tr>
                                <td colSpan={3} className="p-4 text-center text-muted" style={{ fontSize: '0.9rem' }}>Belum ada data siswa di sekolah ini.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === 'history' && (
          <div className="animate-fade-in glass-panel p-8">
            {selectedHistoryPackage ? (
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <button className="btn-secondary" onClick={() => setSelectedHistoryPackage(null)}>← Kembali</button>
                  <h2 style={{ margin: 0 }}>Riwayat Ujian: {selectedHistoryPackage.name}</h2>
                </div>
                
                {(() => {
                  const pkgSessions = sessions.filter(s => s.packageId === selectedHistoryPackage.id);
                  const finishedSessions = pkgSessions.filter(s => s.status === 'selesai');
                  const finished = finishedSessions.length;
                  const notStarted = Math.max(0, students.length - pkgSessions.length);

                  let highest = 0;
                  let lowest = 101;
                  let totalSum = 0;

                  students.forEach(student => {
                    const session = pkgSessions.find(s => s.studentId === student.id);
                    const score = (session && session.status === 'selesai') ? (Number(session.totalScore) || 0) : 0;
                    
                    if (score > highest) highest = score;
                    if (score < lowest) lowest = score;
                    totalSum += score;
                  });

                  if (students.length === 0) lowest = 0;
                  const average = students.length > 0 ? (totalSum / students.length).toFixed(2) : 0;

                  return (
                    <>
                      <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginTop: 0, marginBottom: '2rem', gap: '1rem' }}>
                        <div className="card" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1.5rem' }}>
                          <h3 style={{ fontSize: '2rem', color: '#64748b', margin: 0 }}>{notStarted}</h3>
                          <p style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tidak Ikut</p>
                        </div>
                        <div className="card" style={{ background: 'rgba(0, 128, 0, 0.1)', border: '1px solid rgba(0, 128, 0, 0.3)', borderRadius: '12px', padding: '1.5rem' }}>
                          <h3 style={{ fontSize: '2rem', color: 'green', margin: 0 }}>{finished}</h3>
                          <p style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Selesai</p>
                        </div>
                        <div className="card" style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '12px', padding: '1.5rem' }}>
                          <h3 style={{ fontSize: '2rem', color: '#ca8a04', margin: 0 }}>{highest}</h3>
                          <p style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tertinggi</p>
                        </div>
                        <div className="card" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '1.5rem' }}>
                          <h3 style={{ fontSize: '2rem', color: '#dc2626', margin: 0 }}>{lowest}</h3>
                          <p style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Terendah</p>
                        </div>
                        <div className="card" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', padding: '1.5rem' }}>
                          <h3 style={{ fontSize: '2rem', color: '#2563eb', margin: 0 }}>{average}</h3>
                          <p style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Rata-rata</p>
                        </div>
                      </div>

                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--glass-border)' }}>
                            <th className="p-4">Nama Siswa</th>
                            <th className="p-4">Kelas</th>
                            <th className="p-4">Nilai</th>
                            <th className="p-4">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.length > 0 ? students.map((student) => {
                            const session = pkgSessions.find(s => s.studentId === student.id);
                            return (
                              <tr key={student.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                <td className="p-4 font-semibold text-main">{student.fullName || '-'}</td>
                                <td className="p-4">{student.className || '-'}</td>
                                <td className="p-4 font-bold">{session?.totalScore !== undefined && session?.totalScore !== null ? session.totalScore : '-'}</td>
                                <td className="p-4">
                                  {!session ? (
                                    <span className="tag" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', fontSize: '0.75rem' }}>Tidak Mengerjakan</span>
                                  ) : session.status === 'selesai' ? (
                                    <span className="tag" style={{ background: 'rgba(0, 128, 0, 0.1)', color: 'green', border: '1px solid green', fontSize: '0.75rem' }}>Selesai</span>
                                  ) : (
                                    <span className="tag" style={{ background: 'rgba(255, 165, 0, 0.1)', color: 'orange', border: '1px solid orange', fontSize: '0.75rem' }}>Tidak Selesai</span>
                                  )}
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr>
                              <td colSpan={4} className="p-4 text-center text-muted">Belum ada data siswa di sekolah ini.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2>Riwayat Semua Ujian</h2>
                    <p>Lihat daftar paket ujian yang pernah dikerjakan oleh sekolah Anda.</p>
                  </div>
                </div>

                <div className="dashboard-grid">
                  {allPackages.filter(pkg => pkg.status !== 'aktif').length > 0 ? allPackages.filter(pkg => pkg.status !== 'aktif').map(pkg => (
                    <div key={pkg.id} className="glass-panel card flex flex-col hover:shadow-lg transition-all" style={{ cursor: 'pointer' }} onClick={() => setSelectedHistoryPackage(pkg)}>
                      <div className="flex justify-between mb-4">
                        <span className="tag">{pkg.mapel}</span>
                      </div>
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{pkg.name}</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Token: {pkg.token}</p>
                    </div>
                  )) : (
                    <div className="p-8 text-center text-muted col-span-full">
                      Belum ada riwayat ujian yang telah selesai.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default OperatorDashboard;
