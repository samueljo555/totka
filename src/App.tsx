import React, { useState } from 'react';
import './index.css';
import AdminDashboard from './pages/AdminDashboard';
import GuruDashboard from './pages/GuruDashboard';
import SiswaDashboard from './pages/SiswaDashboard';
import OperatorDashboard from './pages/OperatorDashboard';

function App() {
  const [role, setRole] = useState<string | null>(null); // This holds the authenticated role
  const [loginView, setLoginView] = useState<string | null>(null); // Shows the login form for a specific role
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const response = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      
      if (response.ok) {
        setRole(data.user.role); // e.g., 'super_admin'
        setLoginView(null);
      } else {
        setError(data.error || 'Login gagal');
      }
    } catch (err) {
      setError('Koneksi ke server gagal. Pastikan backend sudah menyala.');
    }
  };

  const roles = [
    { id: 'siswa', title: 'Siswa', description: 'Masuk dengan NISN dan Token untuk mulai ujian', icon: '🎓' },
    { id: 'operator', title: 'Operator Sekolah', description: 'Kelola data siswa dan pantau ujian', icon: '🏫' },
    { id: 'guru', title: 'Guru Penulis', description: 'Akses bank soal dan perumusan', icon: '✍️' },
    { id: 'super_admin', title: 'Super Admin', description: 'Kendali penuh sistem try out', icon: '⚙️' }
  ];

  if (role === 'super_admin' || role === 'admin') {
    return <AdminDashboard onLogout={() => setRole(null)} />;
  }
  
  if (role === 'guru') {
    return <GuruDashboard onLogout={() => setRole(null)} />;
  }

  if (role === 'siswa') {
    return <SiswaDashboard onLogout={() => setRole(null)} />;
  }

  if (role === 'operator') {
    return <OperatorDashboard onLogout={() => setRole(null)} />;
  }

  if (loginView) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="login-card glass-panel animate-fade-in" style={{ padding: '2.5rem', width: '100%', maxWidth: '400px' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>Login {roles.find(r => r.id === loginView)?.title}</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem' }}>Silakan masukkan kredensial Anda</p>
          
          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && <div style={{ color: 'red', background: 'rgba(255,0,0,0.1)', padding: '10px', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}>{error}</div>}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="username" style={{ fontWeight: 600, fontSize: '0.9rem' }}>Username / NISN</label>
              <input 
                id="username"
                type="text" 
                className="input-field" 
                placeholder="Masukkan username" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="password" style={{ fontWeight: 600, fontSize: '0.9rem' }}>Password</label>
              <input 
                id="password"
                type="password" 
                className="input-field" 
                placeholder="Masukkan password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn" style={{ marginTop: '1rem', width: '100%', padding: '0.8rem' }}>
              Masuk ke Sistem
            </button>
            <button type="button" className="btn-secondary" style={{ width: '100%', padding: '0.8rem' }} onClick={() => setLoginView(null)}>
              Kembali
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <header className="text-center animate-fade-in" style={{ marginBottom: '3rem' }}>
        <div className="tag mb-4">Sistem Try Out Terpadu</div>
        <h1>Try Out TKA - Jenjang SD</h1>
        <p style={{ maxWidth: '600px', margin: '0 auto', fontSize: '1.1rem' }}>
          Platform simulasi Tes Kemampuan Akademik (TKA) untuk Sekolah Dasar.
          Pilih peran Anda untuk masuk ke dalam sistem.
        </p>
      </header>

      <div className="dashboard-grid animate-fade-in">
        {roles.map((r) => (
          <div key={r.id} className="glass-panel card flex flex-col items-center text-center">
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>{r.icon}</div>
            <h3 style={{ fontSize: '1.4rem' }}>{r.title}</h3>
            <p style={{ marginBottom: '1.5rem', flexGrow: 1 }}>{r.description}</p>
            <button className="btn btn-secondary" onClick={() => { setLoginView(r.id); setError(''); setUsername(''); setPassword(''); }} style={{ width: '100%' }}>
              Masuk sebagai {r.title}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
