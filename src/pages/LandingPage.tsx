import { useNavigate } from 'react-router-dom';

const roles = [
  { id: 'siswa', title: 'Siswa', description: 'Masuk dengan NISN dan Token untuk mulai ujian', icon: '🎓' },
  { id: 'operator', title: 'Operator Sekolah', description: 'Kelola data siswa dan pantau ujian', icon: '🏫' },
  { id: 'guru', title: 'Guru Penulis', description: 'Akses bank soal dan perumusan', icon: '✍️' },
  { id: 'super_admin', title: 'Super Admin', description: 'Kendali penuh sistem try out', icon: '⚙️' }
];

const LandingPage = () => {
  const navigate = useNavigate();

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
            <button 
              className="btn btn-secondary" 
              onClick={() => navigate(`/login/${r.id}`)} 
              style={{ width: '100%' }}
            >
              Masuk sebagai {r.title}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LandingPage;
