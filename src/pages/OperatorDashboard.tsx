import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Activity, 
  LogOut,
  Plus,
  Upload,
  Download,
  Printer
} from 'lucide-react';
import { Pagination } from '../components/Pagination';
import { OperatorExams } from '../components/OperatorExams';
import { usePagedList, useDebounced, readAllPages, readJson } from '../lib/paging';
import { FilterBar } from '../components/FilterBar';
import { apiFetch } from '../lib/api';

const OperatorDashboard = ({ user, onLogout }: { user?: any, onLogout: () => void }) => {
  const confirmModal = useConfirm();
  const [resettingStudentId, setResettingStudentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('students');
  const [isAddingSiswa, setIsAddingSiswa] = useState(false);





  // Search, Filter & Loading States (Tahap 4 & 5)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('');



  // State for new siswa form
  const [newNisn, setNewNisn] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [page, setPage] = useState(1);
  const [uniqueClasses, setUniqueClasses] = useState<string[]>([]);
  const query = useDebounced(searchQuery);
  const studentList = usePagedList<any>('/api/users/login-cards', page, 50, { search: query, className: filterClass }, activeTab === 'students');
  const students = studentList.items;
  const filteredStudents = students;
  const isLoadingStudents = studentList.loading;
  const fetchStudents = () => { void studentList.reload(); void readJson<string[]>('/api/users/classes').then(setUniqueClasses).catch(() => {}); };
  useEffect(() => { readJson<string[]>('/api/users/classes').then(setUniqueClasses).catch(() => {}); }, []);

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
          toast.success(`Berhasil mengimpor ${result.count} siswa. Password tersedia pada kartu login.`);
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

  const handleResetStudentPassword = async (student: any) => {
    if (!await confirmModal({ title: 'Atur ulang password siswa', message: `Buat password 6 karakter baru untuk ${student.fullName}? Password lama tidak berlaku dan siswa perlu login kembali.` })) return;
    setResettingStudentId(student.id);
    try {
      const response = await apiFetch(`/api/users/${student.id}/login-card/reset`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Gagal mengatur ulang password.');
      void studentList.reload();
      toast.success('Password baru tersimpan dan siap dicetak.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal mengatur ulang password.');
    } finally { setResettingStudentId(null); }
  };

  const handlePrintKartuLogin = async () => {
    if (studentList.total === 0) return toast('Belum ada data siswa untuk dicetak.');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return toast.error('Pop-up diblokir. Harap izinkan pop-up untuk mencetak kartu.');
    let cards: any[];
    try {
      cards = await readAllPages<any>('/api/users/login-cards');
      const missing = cards.filter(student => !student.loginPassword).length;
      if (missing) throw new Error(`${missing} siswa belum memiliki password kartu. Gunakan Atur ulang pada siswa tersebut sebelum mencetak.`);
    } catch (error) {
      printWindow.close();
      toast.error(error instanceof Error ? error.message : 'Gagal memuat kartu login.');
      return;
    }

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

    cards.forEach(siswa => {
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
            <span class="value">${escapeHtml(siswa.loginPassword || 'Belum tersedia')}</span>
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
        {studentList.error && <p role="alert">{studentList.error}</p>}

        {activeTab === 'students' && !isAddingSiswa && (
          <div className="animate-fade-in glass-panel p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2>Daftar Siswa</h2>
                <p>Kelola data akun siswa di sekolah Anda (tambah satuan atau impor CSV).</p>
                <p style={{ fontSize: '0.85rem' }}>Password siswa dapat dicetak pada kartu login. Untuk akun lama yang passwordnya belum tersedia, gunakan Atur ulang.</p>
              </div>
              <div className="flex gap-2">
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
              onSearchChange={value => { setSearchQuery(value); setPage(1); }}
              searchPlaceholder="Cari siswa (Nama / NISN / Kelas)..."
              filterValue={filterClass}
              onFilterChange={value => { setFilterClass(value); setPage(1); }}
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
                        {siswa.loginPassword || 'Belum tersedia'}
                        <button className="btn-secondary" style={{ marginLeft: '0.5rem', padding: '4px 8px', fontSize: '0.75rem' }} disabled={resettingStudentId !== null} onClick={() => handleResetStudentPassword(siswa)}>
                          {resettingStudentId === siswa.id ? 'Memproses...' : 'Atur ulang'}
                        </button>
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
            <Pagination page={page} total={studentList.total} pageSize={50} onChange={setPage} loading={studentList.loading} />
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
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Catatan: Password siswa dibuat otomatis sebanyak 6 karakter dan dapat dicetak ulang pada kartu login.</p>
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
                  toast.success(`Siswa dibuat. Password: ${data.user.tempPassword}. Kartu login siap dicetak.`);
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

        {(activeTab === 'monitoring' || activeTab === 'history') && <OperatorExams key={activeTab} history={activeTab === 'history'} />}

      </main>
    </div>
  );
};

export default OperatorDashboard;
