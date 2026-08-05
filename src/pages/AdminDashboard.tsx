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
  Download
} from 'lucide-react';

const AdminDashboard = ({ onLogout }: { onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [isAddingPackage, setIsAddingPackage] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === 'accounts') {
      fetch('http://localhost:3001/api/users')
        .then(res => res.json())
        .then(data => setUsers(data))
        .catch(err => console.error("Error fetching users:", err));
    } else if (activeTab === 'packages') {
      fetch('http://localhost:3001/api/packages')
        .then(res => res.json())
        .then(data => setPackages(data))
        .catch(err => console.error("Error fetching packages:", err));
    }
  }, [activeTab]);

  const tabs = [
    { id: 'overview', name: 'Ringkasan', icon: <BarChart3 size={20} /> },
    { id: 'accounts', name: 'Manajemen Akun', icon: <Users size={20} /> },
    { id: 'packages', name: 'Paket Try Out', icon: <BookOpen size={20} /> },
    { id: 'results', name: 'Analitik Hasil', icon: <LineChart size={20} /> },
    { id: 'settings', name: 'Pengaturan Ujian', icon: <Settings size={20} /> },
  ];

  return (
    <div className="flex" style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="glass-panel" style={{ width: '280px', margin: '1rem', display: 'flex', flexDirection: 'column' }}>
        <div className="p-6">
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Super Admin</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>TKA SD Platform</p>
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

        {activeTab === 'accounts' && (
          <div className="animate-fade-in glass-panel p-8">
            <div className="flex justify-between items-center mb-6">
              <h2>Daftar Pengguna Sistem</h2>
              <button className="btn">
                <Plus size={18} /> Tambah Akun
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                  <th className="p-4">Nama / Institusi</th>
                  <th className="p-4">Peran</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.length > 0 ? users.map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td className="p-4 font-semibold text-main">
                      {u.fullName} <br/>
                      <span className="text-muted" style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>{u.school?.name || 'Pusat'}</span>
                    </td>
                    <td className="p-4">
                      <span className="tag">
                        {u.role === 'super_admin' ? 'Super Admin' : u.role === 'guru' ? 'Guru (Author)' : u.role === 'operator' ? 'Operator' : 'Siswa'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span style={{ 
                        color: 'green',
                        background: 'rgba(0,128,0,0.1)',
                        padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600
                      }}>
                        Aktif
                      </span>
                    </td>
                    <td className="p-4">
                      <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Edit</button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted">Memuat data dari API...</td>
                  </tr>
                )}
              </tbody>
            </table>
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
                
                <div style={{ height: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <label key={num} className="flex items-start gap-3 p-3" style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', background: num % 2 === 0 ? '#f8fafc' : 'white' }}>
                      <input type="checkbox" style={{ marginTop: '4px' }} />
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-color)' }}>ID: Q-{1000 + num}</div>
                        <div style={{ fontSize: '0.9rem', marginTop: '2px' }}>Cuplikan soal nomor {num} dari bank soal akan tampil di sini.</div>
                        <div className="flex gap-2 mt-2">
                          <span className="tag" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>PG Sederhana</span>
                          <span className="tag" style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#f1f5f9', color: '#64748b' }}>Bilangan</span>
                        </div>
                      </div>
                    </label>
                  ))}
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
