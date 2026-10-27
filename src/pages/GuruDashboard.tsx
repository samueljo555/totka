import { TableFrame, SortableHeading, TableState } from '../components/TableFrame';
import { Pagination } from '../components/Pagination';
import { usePagedList, useDebounced } from '../lib/paging';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { 
  FileText, 
  Library, 
  LogOut,
  Plus,
  Search,
  Image as ImageIcon,
  Edit,
  Trash2,
  Eye
} from 'lucide-react';
import { lazy, Suspense } from 'react';
import { ExamQuestion } from '../components/ExamQuestion';
import { ExamDialog } from '../components/ExamDialog';
import { RichImageDialog } from '../components/RichImageDialog';
import { contentText } from '../../backend/rich-content';
const QuestionEditor = lazy(() => import('../components/QuestionEditor').then(module => ({ default: module.QuestionEditor })));
import 'katex/dist/katex.min.css';

const GuruDashboard = ({ user, onLogout }: { user?: any, onLogout: () => void }) => {
  const confirmModal = useConfirm();
  const [activeTab, setActiveTab] = useState('bank');
  const [isAdding, setIsAdding] = useState(false);


  const [isAddingReading, setIsAddingReading] = useState(false);
  const [editingReadingId, setEditingReadingId] = useState<string | null>(null);
  const [readingTitle, setReadingTitle] = useState('');
  const [readingContent, setReadingContent] = useState('');

  const [questionSort, setQuestionSort] = useState('name_asc');
  const [readingSort, setReadingSort] = useState('name_asc');
  const [questionPageSize, setQuestionPageSize] = useState(10);
  const [readingPageSize, setReadingPageSize] = useState(10);
  const [questionPage, setQuestionPage] = useState(1);
  const [readingPage, setReadingPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterType, setFilterType] = useState('');
  const query = useDebounced(search);
  const questionList = usePagedList<any>('/api/questions', questionPage, questionPageSize, { search: query, mapel: filterSubject, type: filterType, sort: questionSort }, activeTab === 'bank');
  const readingList = usePagedList<any>('/api/readings', readingPage, readingPageSize, { search: query, sort: readingSort }, activeTab === 'bacaan');
  const questions = questionList.items, readings = readingList.items;

  const handleSaveReading = async () => {
    try {
      const url = editingReadingId ? `/api/readings/${editingReadingId}` : '/api/readings';
      const method = editingReadingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: readingTitle, content: readingContent, authorId: user?.id })
      });
      if (res.ok) {
        setIsAddingReading(false);
        setEditingReadingId(null);
        setReadingTitle('');
        setReadingContent('');
        await readingList.reload();
      } else {
        const error = await res.json();
        toast.error(error.message || 'Gagal menyimpan bacaan');
      }
    } catch(err) {
      toast.error('Gagal menyimpan bacaan');
    }
  };

  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [previewQuestion, setPreviewQuestion] = useState<any>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const tabs = [
    { id: 'bank', name: 'Bank Soal', icon: <Library size={20} /> },
    { id: 'bacaan', name: 'Manajemen Bacaan', icon: <FileText size={20} /> },
  ];

  return (
    <div className="flex dashboard-app" style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="glass-panel" style={{ width: '280px', margin: '1rem', display: 'flex', flexDirection: 'column' }}>
        <div className="p-6">
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Guru Penulis</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>{user?.school?.name || 'Sekolah Pusat / Belum Terdaftar'}</p>
        </div>
        
        <nav style={{ flex: 1, padding: '0 1rem' }}>
          {tabs.map(tab => (
            <button 
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setIsAdding(false); }}
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
            <div className="input-group" style={{ marginBottom: 0, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="text" className="input-field" placeholder="Cari soal/bacaan..." value={search} onChange={event => { setSearch(event.target.value); setQuestionPage(1); setReadingPage(1); }} style={{ paddingLeft: '40px', width: '250px' }} />
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#00b8d9', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              GP
            </div>
          </div>
        </header>
        {(questionList.loading || readingList.loading) && <p role="status">Memuat data...</p>}
        {(questionList.error || readingList.error) && <p role="alert">{questionList.error || readingList.error}</p>}

        {activeTab === 'bank' && !isAdding && (
          <div className="animate-fade-in glass-panel p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2>Daftar Soal</h2>
                <p>Kelola bank soal untuk materi Matematika dan Bahasa Indonesia.</p>
              </div>
              <button className="btn" onClick={() => {
                setEditingQuestion(null);
                setIsAdding(true);
              }}>
                <Plus size={18} /> Tambah Soal
              </button>
            </div>

            <div className="flex gap-4 mb-6">
              <select className="input-field" style={{ width: '200px' }} value={filterSubject} onChange={event => { setFilterSubject(event.target.value); setQuestionPage(1); }}>
                <option value="">Semua Mata Pelajaran</option>
                <option>Matematika</option>
                <option>Bahasa Indonesia</option>
              </select>
              <select className="input-field" style={{ width: '200px' }} value={filterType} onChange={event => { setFilterType(event.target.value); setQuestionPage(1); }}>
                <option value="">Semua Tipe Soal</option>
                <option value="Pilihan Ganda Sederhana">PG Sederhana</option>
                <option value="Pilihan Ganda Kompleks">PG Kompleks</option>
                <option value="Pilihan Ganda Kompleks Kategori">PG Kategori</option>
              </select>
            </div>

            <TableFrame exportOptions={{ url: '/api/questions', params: { search: query, mapel: filterSubject, type: filterType, sort: questionSort }, filename: 'bank_soal.csv', disabled: questionList.loading || !!questionList.error || search !== query, columns: [{ title: 'Mata Pelajaran', value: r => r.mapel }, { title: 'Elemen', value: r => r.element }, { title: 'Tipe Soal', value: r => r.type }, { title: 'Soal', value: r => contentText(r.content) }] }} sortLabel="Soal" sort={questionSort} onSort={value => { setQuestionSort(value); setQuestionPage(1); }} total={questionList.total} pageSize={questionPageSize} onPageSize={value => { setQuestionPageSize(value); setQuestionPage(1); }} label="Bank soal">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                  <th scope="col" className="p-4">Mapel / Elemen</th>
                  <th scope="col" className="p-4">Tipe Soal</th>
                  <SortableHeading title="Cuplikan Soal" sort={questionSort} onSort={value => { setQuestionSort(value); setQuestionPage(1); }} />
                  <th scope="col" className="p-4">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {questionList.error || questionList.loading ? <TableState loading={questionList.loading} error={questionList.error} columns={4} retry={() => void questionList.reload()} /> : questions.length > 0 ? questions.map((soal) => (
                  <tr key={soal.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td className="p-4">
                      <span className="tag">{soal.mapel || 'Mapel'}</span><small className="table-secondary">{soal.element || '—'}</small>
                    </td>
                    <td className="p-4 font-semibold text-main">{soal.type || 'Pilihan Ganda'}</td>
                    <td className="p-4" style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <div className="flex items-center gap-2">
                        {soal.imageUrl && <ImageIcon size={14} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{contentText(soal.content)}</span>
                      </div>
                    </td>
                    <td className="p-4 flex gap-2">
                      <button className="btn-secondary" style={{ padding: '6px', borderRadius: '6px', color: 'var(--primary-color)' }} title="Lihat Pratinjau" onClick={() => {
                        setPreviewQuestion(soal);
                      }}>
                        <Eye size={16}/>
                      </button>
                      <button className="btn-secondary" style={{ padding: '6px', borderRadius: '6px' }} title="Edit" onClick={() => {
                        setIsAdding(true);
                        setEditingQuestion(soal);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}>
                        <Edit size={16}/>
                      </button>
                      <button className="btn-secondary" style={{ padding: '6px', borderRadius: '6px', color: '#d32f2f' }} title="Hapus" onClick={async () => {
                        if (await confirmModal({ title: 'Konfirmasi', message: 'Yakin ingin menghapus soal ini?' })) {
                          const response = await fetch(`/api/questions/${soal.id}`, { method: 'DELETE' });
                          if (!response.ok) {
                            const error = await response.json();
                            toast.error(error.message || 'Gagal menghapus soal');
                            return;
                          }
                          await questionList.reload();
                        }
                      }}>
                        <Trash2 size={16}/>
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted">Belum ada soal sesuai filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </TableFrame>
            <Pagination page={questionPage} total={questionList.total} pageSize={questionPageSize} onChange={setQuestionPage} loading={questionList.loading} />
          </div>
        )}

        {activeTab === 'bank' && isAdding && <Suspense fallback={<p role="status">Memuat editor soal...</p>}><QuestionEditor key={editingQuestion?.id || 'new'} initial={editingQuestion} onCancel={() => setIsAdding(false)} onSaved={async () => { setIsAdding(false); setEditingQuestion(null); await questionList.reload(); }} /></Suspense>}

        {activeTab === 'bacaan' && !isAddingReading && (
          <div className="animate-fade-in glass-panel p-8" style={{ minHeight: '400px' }}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2>Manajemen Teks Bacaan Bersama</h2>
                <p>Kelola bacaan yang dapat ditautkan ke lebih dari satu soal sekaligus.</p>
              </div>
              <button className="btn" onClick={() => { setIsAddingReading(true); setEditingReadingId(null); setReadingTitle(''); setReadingContent(''); }}>
                <Plus size={18} /> Tambah Bacaan
              </button>
            </div>
            
            <TableFrame exportOptions={{ url: '/api/readings', params: { search: query, sort: readingSort }, filename: 'teks_bacaan.csv', disabled: readingList.loading || !!readingList.error || search !== query, columns: [{ title: 'Judul', value: r => r.title }, { title: 'Teks Bacaan', value: r => contentText(r.content) }, { title: 'Soal Ditautkan', value: r => r._count?.questions || 0 }] }} sortLabel="Judul" sort={readingSort} onSort={value => { setReadingSort(value); setReadingPage(1); }} total={readingList.total} pageSize={readingPageSize} onPageSize={value => { setReadingPageSize(value); setReadingPage(1); }} label="Teks bacaan">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                  <SortableHeading title="Judul Bacaan" sort={readingSort} onSort={value => { setReadingSort(value); setReadingPage(1); }} />
                  <th scope="col" className="p-4">Potongan Teks</th>
                  <th scope="col" className="numeric">Soal Ditautkan</th>
                  <th scope="col" className="p-4">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {readingList.error || readingList.loading ? <TableState loading={readingList.loading} error={readingList.error} columns={4} retry={() => void readingList.reload()} /> : readings.length > 0 ? readings.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td className="p-4 font-semibold text-main">{r.title}</td>
                    <td className="p-4 text-muted">{r.content.substring(0, 50)}...</td>
                    <td className="numeric">{r._count?.questions || 0}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => {
                          setEditingReadingId(r.id);
                          setReadingTitle(r.title);
                          setReadingContent(r.content);
                          setIsAddingReading(true);
                        }}>Edit</button>
                        <button className="btn-secondary" style={{ padding: '4px 8px', color: '#d32f2f', background: 'rgba(255,0,0,0.1)' }} onClick={async () => {
                          if (await confirmModal({ title: 'Konfirmasi', message: 'Hapus bacaan ini?' })) {
                            const response = await fetch(`/api/readings/${r.id}`, { method: 'DELETE' });
                            if (!response.ok) {
                              const error = await response.json();
                              toast.error(error.message || 'Gagal menghapus bacaan');
                              return;
                            }
                            await readingList.reload();
                          }
                        }}>Hapus</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="p-4 text-center text-muted">Belum ada bacaan bersama.</td></tr>
                )}
              </tbody>
            </table>
            </TableFrame>
            <Pagination page={readingPage} total={readingList.total} pageSize={readingPageSize} onChange={setReadingPage} loading={readingList.loading} />
          </div>
        )}

        {activeTab === 'bacaan' && isAddingReading && (
          <div className="animate-fade-in glass-panel p-8" style={{ minHeight: '400px' }}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2>{editingReadingId ? 'Edit Teks Bacaan Bersama' : 'Tambah Teks Bacaan Bersama'}</h2>
                <p>Tulis atau tempel teks panjang yang akan digunakan pada beberapa soal.</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="input-group">
                <label className="input-label">Judul Wacana / Teks</label>
                <input type="text" className="input-field" value={readingTitle} onChange={e => setReadingTitle(e.target.value)} placeholder="Contoh: Peristiwa Rengasdengklok" />
              </div>
              <div className="input-group">
                <label className="input-label">Isi Teks Bacaan</label>
                <textarea className="input-field" rows={10} value={readingContent} onChange={e => setReadingContent(e.target.value)} placeholder="Masukkan teks cerita/wacana lengkap di sini..."></textarea>
              </div>
              
              <div className="flex justify-end gap-4 mt-4">
              <button className="btn-secondary" onClick={() => { setIsAddingReading(false); setEditingReadingId(null); setReadingTitle(''); setReadingContent(''); }}>Batal</button>
              <button className="btn" onClick={handleSaveReading}>{editingReadingId ? 'Perbarui Teks' : 'Simpan Teks Bacaan'}</button>
              </div></div>
          </div>
        )}

        {/* Preview Modal */}
        <ExamDialog open={!!previewQuestion} title="Pratinjau Tampilan Siswa" className="question-preview-dialog" onClose={() => setPreviewQuestion(null)}>
          {previewQuestion && <div className="exam-workspace"><div className="exam-question-body"><ExamQuestion question={previewQuestion} number={1} answer={null} disabled onAnswer={() => {}} onImage={setPreviewImage} /></div></div>}
        </ExamDialog>
        <RichImageDialog src={previewImage} onClose={() => setPreviewImage(null)} />

      </main>
    </div>
  );
};

export default GuruDashboard;
