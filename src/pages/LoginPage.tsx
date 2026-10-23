import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { setToken } from '../lib/api';

const roles = [
  { id: 'siswa', title: 'Siswa', description: 'Masuk dengan NISN dan Token untuk mulai ujian', icon: '🎓' },
  { id: 'operator', title: 'Operator Sekolah', description: 'Kelola data siswa dan pantau ujian', icon: '🏫' },
  { id: 'guru', title: 'Guru Penulis', description: 'Akses bank soal dan perumusan', icon: '✍️' },
  { id: 'super_admin', title: 'Super Admin', description: 'Kendali penuh sistem try out', icon: '⚙️' }
];

const LoginPage = ({ onLogin }: { onLogin: (user: any) => void }) => {
  const { roleId } = useParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const role = roles.find(r => r.id === roleId) || roles[0];

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      
      if (response.ok) {
        if (data.token) {
          setToken(data.token);
        }
        onLogin(data.user);
        
        // Redirect based on role
        if (data.user.role === 'super_admin' || data.user.role === 'admin') navigate('/admin');
        else if (data.user.role === 'guru') navigate('/guru');
        else if (data.user.role === 'siswa') navigate('/siswa');
        else if (data.user.role === 'operator') navigate('/operator');
      } else {
        setError(data.error || 'Login gagal');
      }
    } catch (err) {
      setError('Koneksi ke server gagal. Pastikan backend sudah menyala.');
    }
  };

  return (
    <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="login-card glass-panel animate-fade-in" style={{ padding: '2.5rem', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>Login {role.title}</h2>
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
          <button type="button" className="btn-secondary" style={{ width: '100%', padding: '0.8rem' }} onClick={() => navigate('/')}>
            Kembali
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
