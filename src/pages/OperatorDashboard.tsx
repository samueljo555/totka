import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Activity, 
  LogOut,
  Plus,
  Search,
  Upload,
  Download
} from 'lucide-react';

const OperatorDashboard = ({ user, onLogout }: { user?: any, onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState('students');
  const [isAddingSiswa, setIsAddingSiswa] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  // State for new siswa form
  const [newNisn, setNewNisn] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newClassName, setNewClassName] = useState('6A');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchStudents = () => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setStudents(data.filter((u: any) => u.role === 'siswa')))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    if (activeTab === 'students') {
      fetchStudents();
    } else if (activeTab === 'monitoring') {
      fetch('/api/sessions')
        .then(res => res.json())
        .then(data => setSessions(data))
        .catch(err => console.error(err));
    }
  }, [activeTab]);

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
        alert('Format CSV tidak valid atau kosong. Pastikan format: nisn,fullName,className');
        return;
      }

      try {
        const res = await fetch('/api/users/siswa/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            students: studentsData, 
            schoolNpsn: user?.school?.npsn 
          })
        });
        if (res.ok) {
          alert(`Berhasil mengimpor ${studentsData.length} data siswa!`);
          fetchStudents();
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
    { id: 'students', name: 'Manajemen Siswa', icon: <Users size={20} /> },
    { id: 'monitoring', name: 'Pantau Ujian', icon: <Activity size={20} /> },
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
        <header className="flex justify-between items-center mb-8">
          <h1>{tabs.find(t => t.id === activeTab)?.name}</h1>
          <div className="flex items-center gap-4">
            <div className="input-group" style={{ marginBottom: 0, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="text" className="input-field" placeholder="Cari siswa/kelas..." style={{ paddingLeft: '40px', width: '250px' }} />
            </div>
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
                <p>Kelola data akun siswa di sekolah Anda (tambah satuan atau impor Excel).</p>
              </div>
              <div className="flex gap-2">
                <input type="file" id="csv-upload" accept=".csv" style={{ display: 'none' }} onChange={handleImportCsv} />
                <label htmlFor="csv-upload" className="btn-secondary" style={{ margin: 0 }}>
                  <Upload size={18} /> Import CSV
                </label>
                <button className="btn" onClick={() => setIsAddingSiswa(true)}>
                  <Plus size={18} /> Tambah Siswa
                </button>
              </div>
            </div>

            <div className="flex gap-4 mb-6">
              <select className="input-field" style={{ width: '200px' }}>
                <option>Semua Kelas</option>
                <option>Kelas 6A</option>
                <option>Kelas 6B</option>
                <option>Kelas 6C</option>
              </select>
            </div>

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
                {students.length > 0 ? students.map((siswa, i) => (
                  <tr key={siswa.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td className="p-4 font-semibold">{siswa.nisn || '-'}</td>
                    <td className="p-4 text-main">{siswa.fullName}</td>
                    <td className="p-4">
                      <span className="tag">{siswa.className || '-'}</span>
                    </td>
                    <td className="p-4 text-muted" style={{ fontFamily: 'monospace' }}>
                      {siswa.password || '******'}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted">Belum ada siswa terdaftar (Atau sedang memuat dari API).</td>
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
              <select className="input-field" value={newClassName} onChange={e => setNewClassName(e.target.value)}>
                <option value="6A">6A</option>
                <option value="6B">6B</option>
                <option value="6C">6C</option>
              </select>
            </div>
            
            <div className="p-4 mt-6" style={{ background: 'rgba(0, 82, 204, 0.05)', borderRadius: '8px' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Catatan: Password sementara akan digenerate otomatis oleh sistem dan dapat diunduh (download) oleh operator setelah siswa didaftarkan.</p>
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
                fetch('/api/users/siswa', {
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
                .then(() => {
                  setIsSaving(false);
                  setIsAddingSiswa(false);
                  setNewNisn('');
                  setNewFullName('');
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

        {activeTab === 'monitoring' && (
          <div className="animate-fade-in glass-panel p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2>Pantau Pengerjaan Ujian</h2>
                <p>Monitor status try out siswa secara real-time.</p>
              </div>
              <div className="flex gap-4">
                <div style={{ padding: '8px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Token Aktif Saat Ini</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', letterSpacing: '2px', color: 'var(--primary-dark)' }}>AX99B2</div>
                </div>
              </div>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 0, marginBottom: '2rem' }}>
              <div className="card" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '2.5rem', color: '#64748b', margin: 0 }}>45</h3>
                <p style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Belum Mengerjakan</p>
              </div>
              <div className="card" style={{ background: 'rgba(0, 184, 217, 0.1)', border: '1px solid rgba(0, 184, 217, 0.3)', borderRadius: '12px', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '2.5rem', color: '#00b8d9', margin: 0 }}>82</h3>
                <p style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Sedang Mengerjakan</p>
              </div>
              <div className="card" style={{ background: 'rgba(0, 128, 0, 0.1)', border: '1px solid rgba(0, 128, 0, 0.3)', borderRadius: '12px', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '2.5rem', color: 'green', margin: 0 }}>23</h3>
                <p style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Selesai Ujian</p>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                  <th className="p-4">Nama Siswa</th>
                  <th className="p-4">Kelas</th>
                  <th className="p-4">Sesi Try Out Aktif</th>
                  <th className="p-4">Status Pengerjaan</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length > 0 ? sessions.map((session, i) => (
                  <tr key={session.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td className="p-4 font-semibold text-main">{session.student?.fullName || '-'}</td>
                    <td className="p-4">{session.student?.className || '-'}</td>
                    <td className="p-4 text-muted">{session.package?.name || '-'}</td>
                    <td className="p-4">
                      <span style={{ 
                        color: session.status === 'completed' ? 'green' : (session.status === 'in_progress' ? '#00b8d9' : '#64748b'),
                        background: session.status === 'completed' ? 'rgba(0,128,0,0.1)' : (session.status === 'in_progress' ? 'rgba(0,184,217,0.1)' : '#f1f5f9'),
                        padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600
                      }}>
                        {session.status}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted">Belum ada sesi ujian (Atau sedang memuat dari API).</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default OperatorDashboard;
