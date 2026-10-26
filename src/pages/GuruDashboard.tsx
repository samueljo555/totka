import { TableFrame, SortableHeading, TableState } from '../components/TableFrame';
import { Pagination } from '../components/Pagination';
import { RemoteSelect } from '../components/RemoteSelect';
import { usePagedList, useDebounced } from '../lib/paging';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
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
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
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

  const [questionType, setQuestionType] = useState('Pilihan Ganda Sederhana');
  
  const [subjectElements, setSubjectElements] = useState<{ [key: string]: string[] }>({
    'Matematika': ['Bilangan', 'Aljabar', 'Geometri & Pengukuran', 'Data & Ketidakpastian'],
    'Bahasa Indonesia': ['Menemukan Informasi', 'Memahami (Interpretasi & Integrasi)', 'Mengevaluasi & Merefleksi']
  });
  const [selectedMapel, setSelectedMapel] = useState('Matematika');
  const [selectedElement, setSelectedElement] = useState('');
  const [isAddingElement, setIsAddingElement] = useState(false);
  const [newElement, setNewElement] = useState('');
  
  const [options, setOptions] = useState([
    { id: 1, text: '' }, 
    { id: 2, text: '' }, 
    { id: 3, text: '' }, 
    { id: 4, text: '' }
  ]);
  const [correctAnswer, setCorrectAnswer] = useState<number[]>([]);
  const [questionText, setQuestionText] = useState('');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [selectedReadingId, setSelectedReadingId] = useState('');
  const [questionImage, setQuestionImage] = useState<File | null>(null);
  const [questionImageUrl, setQuestionImageUrl] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const handleSaveQuestion = async () => {
    if (!questionText || options.length === 0) {
      toast.error("Pertanyaan dan opsi tidak boleh kosong!");
      return;
    }
    if (!selectedElement) {
      toast.error("Elemen/Kompetensi harus dipilih terlebih dahulu!");
      return;
    }

    try {
      let finalImageUrl = questionImageUrl;
      if (questionImage) {
        const formData = new FormData();
        formData.append('image', questionImage);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          finalImageUrl = uploadData.imageUrl;
        } else {
          toast.error('Gagal mengupload gambar.');
          return;
        }
      }

      const url = editingQuestionId ? `/api/questions/${editingQuestionId}` : '/api/questions';
      const method = editingQuestionId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: questionType,
          mapel: selectedMapel,
          element: selectedElement,
          content: questionText,
          imageUrl: finalImageUrl,
          options: options,
          correctAnswer: correctAnswer,
          authorId: user?.id,
          ...(selectedReadingId && { readingId: selectedReadingId })
        })
      });

      if (res.ok) {
        alert(editingQuestionId ? "Soal berhasil diperbarui!" : "Soal berhasil disimpan!");
        setQuestionText('');
        setQuestionImage(null);
        setQuestionImageUrl('');
        setCorrectAnswer([]);
        setEditingQuestionId(null);
        setIsAdding(false);
        setOptions([{ id: 1, text: '' }, { id: 2, text: '' }, { id: 3, text: '' }, { id: 4, text: '' }]);
        await questionList.reload();
      } else {
        const error = await res.json();
        toast.error(error.message || 'Gagal menyimpan soal');
      }
    } catch(err) {
      toast.error("Error saving question");
    }
  };

  const handleAddOption = () => {
    setOptions([...options, { id: Date.now(), text: '' }]);
  };

  const handleOptionChange = (id: number, text: string) => {
    setOptions(options.map(o => o.id === id ? { ...o, text } : o));
  };

  const handleDeleteOption = (id: number) => {
    if (options.length > 2) {
      setOptions(options.filter(o => o.id !== id));
    } else {
      toast.error("Harus ada minimal 2 pilihan jawaban/pernyataan.");
    }
  };

  useEffect(() => {
    const currentElements = subjectElements[selectedMapel] || [];
    if (selectedElement && !currentElements.includes(selectedElement)) {
      setSelectedElement('');
    }
  }, [selectedMapel, subjectElements]);

  const handleAddElement = () => {
    const elements = subjectElements[selectedMapel] || [];
    if (newElement.trim() && !elements.includes(newElement.trim())) {
      setSubjectElements(prev => ({
        ...prev,
        [selectedMapel]: [...elements, newElement.trim()]
      }));
      setSelectedElement(newElement.trim());
    }
    setNewElement('');
    setIsAddingElement(false);
  };

  const handleDeleteElement = () => {
    const elements = subjectElements[selectedMapel] || [];
    if (elements.length > 1) {
      const newElements = elements.filter(el => el !== selectedElement);
      setSubjectElements(prev => ({
        ...prev,
        [selectedMapel]: newElements
      }));
      setSelectedElement(newElements[0]);
    } else {
      toast.error("Harus menyisakan minimal 1 elemen.");
    }
  };

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
                setEditingQuestionId(null);
                setQuestionText('');
                setQuestionImageUrl('');
                setQuestionImage(null);
                setOptions([{ id: 1, text: '' }, { id: 2, text: '' }, { id: 3, text: '' }, { id: 4, text: '' }]);
                setCorrectAnswer([]);
                setQuestionType('Pilihan Ganda Sederhana');
                setSelectedMapel('Matematika');
                setSelectedElement('');
                setSelectedReadingId('');
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

            <TableFrame exportOptions={{ url: '/api/questions', params: { search: query, mapel: filterSubject, type: filterType, sort: questionSort }, filename: 'bank_soal.csv', disabled: questionList.loading || !!questionList.error || search !== query, columns: [{ title: 'Mata Pelajaran', value: r => r.mapel }, { title: 'Elemen', value: r => r.element }, { title: 'Tipe Soal', value: r => r.type }, { title: 'Soal', value: r => r.content }] }} sortLabel="Soal" sort={questionSort} onSort={value => { setQuestionSort(value); setQuestionPage(1); }} total={questionList.total} pageSize={questionPageSize} onPageSize={value => { setQuestionPageSize(value); setQuestionPage(1); }} label="Bank soal">
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
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{soal.content}</span>
                      </div>
                    </td>
                    <td className="p-4 flex gap-2">
                      <button className="btn-secondary" style={{ padding: '6px', borderRadius: '6px', color: 'var(--primary-color)' }} title="Lihat Pratinjau" onClick={() => {
                        setQuestionText(soal.content);
                        setQuestionType(soal.type || 'Pilihan Ganda Sederhana');
                        setQuestionImageUrl(soal.imageUrl || '');
                        setOptions(soal.options && soal.options.length ? soal.options : [{ id: 1, text: 'Contoh A' }, { id: 2, text: 'Contoh B' }]);
                        setShowPreview(true);
                      }}>
                        <Eye size={16}/>
                      </button>
                      <button className="btn-secondary" style={{ padding: '6px', borderRadius: '6px' }} title="Edit" onClick={() => {
                        setIsAdding(true);
                        setEditingQuestionId(soal.id);
                        setQuestionType(soal.type);
                        setSelectedMapel(soal.mapel || 'Matematika');
                        const mapelElements = subjectElements[soal.mapel || 'Matematika'] || [];
                        setSelectedElement(soal.element || mapelElements[0]);
                        setQuestionText(soal.content);
                        setQuestionImageUrl(soal.imageUrl || '');
                        setOptions(soal.options && soal.options.length ? soal.options : [{ id: 1, text: '' }, { id: 2, text: '' }]);
                        setCorrectAnswer(soal.correctAnswer || []);
                        setSelectedReadingId(soal.readingId || '');
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

        {activeTab === 'bank' && isAdding && (
          <div className="animate-fade-in glass-panel p-8">
            <div className="flex justify-between items-center mb-6">
              <h2>Formulir Pembuatan Soal Baru</h2>
              <button className="btn-secondary" onClick={() => setIsAdding(false)}>Batal</button>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 0, gap: '2rem' }}>
              <div>
                <div className="input-group">
                  <label className="input-label">Mata Pelajaran</label>
                  <select className="input-field" value={selectedMapel} onChange={e => setSelectedMapel(e.target.value)}>
                    <option value="Matematika">Matematika</option>
                    <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Elemen / Kompetensi</label>
                  {!isAddingElement ? (
                    <div className="flex gap-2">
                      <select 
                        className="input-field" 
                        value={selectedElement}
                        onChange={(e) => setSelectedElement(e.target.value)}
                      >
                        <option value="" disabled>Pilih Elemen...</option>
                        {(subjectElements[selectedMapel] || []).map(el => (
                          <option key={el} value={el}>{el}</option>
                        ))}
                      </select>
                      <button className="btn-secondary" onClick={() => setIsAddingElement(true)} style={{ padding: '0 12px', display: 'flex', alignItems: 'center' }} title="Tambah Elemen Baru">
                        <Plus size={18} />
                      </button>
                      <button className="btn-secondary" onClick={handleDeleteElement} style={{ padding: '0 12px', display: 'flex', alignItems: 'center', color: '#d32f2f' }} title="Hapus Elemen Terpilih">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="Nama elemen baru..." 
                        value={newElement}
                        onChange={(e) => setNewElement(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddElement()}
                      />
                      <button className="btn" onClick={handleAddElement} style={{ padding: '0 16px' }}>Simpan</button>
                      <button className="btn-secondary" onClick={() => { setIsAddingElement(false); setNewElement(''); }} style={{ padding: '0 12px' }}>Batal</button>
                    </div>
                  )}
                </div>
                <div className="input-group">
                  <label className="input-label">Bentuk Soal</label>
                  <select className="input-field" value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
                    <option value="Pilihan Ganda Sederhana">Pilihan Ganda Sederhana</option>
                    <option value="Pilihan Ganda Kompleks">Pilihan Ganda Kompleks</option>
                    <option value="Pilihan Ganda Kompleks Kategori">Pilihan Ganda Kompleks Kategori</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Tautan Bacaan (Opsional)</label>
                  <RemoteSelect url="/api/readings" value={selectedReadingId} onChange={setSelectedReadingId} labelField="title" placeholder="Pilih bacaan" />
                </div>
              </div>

              <div>
                <div className="input-group">
                  <label className="input-label">Pertanyaan Soal</label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>*Gunakan format Markdown untuk tulisan tebal/miring. Untuk rumus matematika (pecahan, akar, pangkat, dll), apit dengan tanda dolar (contoh: <code>$x^2 + \frac{1}{2}$</code>).</p>
                  <textarea className="input-field" rows={5} placeholder="Ketik pertanyaan di sini..." value={questionText} onChange={(e) => setQuestionText(e.target.value)}></textarea>
                  <div className="mt-4">
                    <input type="file" id="upload-image" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setQuestionImage(e.target.files[0]);
                        setQuestionImageUrl(URL.createObjectURL(e.target.files[0]));
                      }
                    }} />
                    <label htmlFor="upload-image" className="btn-secondary" style={{ padding: '8px 12px', fontSize: '0.85rem', display: 'inline-flex', gap: '8px', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                      <ImageIcon size={16}/> Sisipkan Gambar
                    </label>
                    {questionImageUrl && (
                      <div className="mt-4" style={{ position: 'relative', display: 'inline-block' }}>
                        <img src={questionImageUrl} alt="Preview Soal" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                        <button className="btn-secondary" style={{ position: 'absolute', top: '-10px', right: '-10px', padding: '4px', borderRadius: '50%', color: 'red', background: 'white', border: '1px solid #e2e8f0' }} onClick={() => { setQuestionImage(null); setQuestionImageUrl(''); }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="input-group mt-4">
                  {questionType === 'Pilihan Ganda Sederhana' && (
                    <>
                      <label className="input-label">Pilihan Jawaban (Beri centang pada kunci yang benar)</label>
                      {options.map((opt, index) => (
                        <div key={opt.id} className="flex items-center gap-4 mb-2">
                          <input type="radio" name="correct_answer" checked={correctAnswer.includes(index)} onChange={() => setCorrectAnswer([index])} style={{ width: '20px', height: '20px' }} />
                          <input type="text" className="input-field" placeholder={`Pilihan ${index + 1}`} value={opt.text} onChange={(e) => handleOptionChange(opt.id, e.target.value)} />
                          <button className="btn-secondary" onClick={() => handleDeleteOption(opt.id)} style={{ padding: '8px', color: '#d32f2f' }} title="Hapus Opsi"><Trash2 size={16}/></button>
                        </div>
                      ))}
                    </>
                  )}

                  {questionType === 'Pilihan Ganda Kompleks' && (
                    <>
                      <label className="input-label">Pilihan Jawaban (Bisa pilih lebih dari satu jawaban benar)</label>
                      {options.map((opt, index) => (
                        <div key={opt.id} className="flex items-center gap-4 mb-2">
                          <input type="checkbox" name={`correct_answer_${opt.id}`} checked={correctAnswer.includes(index)} onChange={(e) => {
                            if (e.target.checked) setCorrectAnswer([...correctAnswer, index]);
                            else setCorrectAnswer(correctAnswer.filter(i => i !== index));
                          }} style={{ width: '20px', height: '20px' }} />
                          <input type="text" className="input-field" placeholder={`Pernyataan ${index + 1}`} value={opt.text} onChange={(e) => handleOptionChange(opt.id, e.target.value)} />
                          <button className="btn-secondary" onClick={() => handleDeleteOption(opt.id)} style={{ padding: '8px', color: '#d32f2f' }} title="Hapus Opsi"><Trash2 size={16}/></button>
                        </div>
                      ))}
                    </>
                  )}

                  {questionType === 'Pilihan Ganda Kompleks Kategori' && (
                    <>
                      <label className="input-label">Kategori / Pernyataan (Tentukan pasangan kategori yang benar)</label>
                      <div className="flex gap-4 mb-2">
                        <div style={{ flex: 2, fontWeight: 600, fontSize: '0.85rem' }}>Pernyataan</div>
                        <div style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', textAlign: 'center' }}>Benar</div>
                        <div style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', textAlign: 'center' }}>Salah</div>
                        <div style={{ width: '36px' }}></div> {/* Spacer for delete button */}
                      </div>
                      {options.map((opt, index) => (
                        <div key={opt.id} className="flex items-center gap-4 mb-2">
                          <input type="text" className="input-field" style={{ flex: 2 }} placeholder={`Pernyataan ${index + 1}`} value={opt.text} onChange={(e) => handleOptionChange(opt.id, e.target.value)} />
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                            <input type="radio" name={`cat_stmt_${opt.id}`} checked={correctAnswer[index] === 0} onChange={() => { const newArr = [...correctAnswer]; newArr[index] = 0; setCorrectAnswer(newArr); }} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                          </div>
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                            <input type="radio" name={`cat_stmt_${opt.id}`} checked={correctAnswer[index] === 1} onChange={() => { const newArr = [...correctAnswer]; newArr[index] = 1; setCorrectAnswer(newArr); }} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                          </div>
                          <button className="btn-secondary" onClick={() => handleDeleteOption(opt.id)} style={{ padding: '8px', color: '#d32f2f' }} title="Hapus Pernyataan"><Trash2 size={16}/></button>
                        </div>
                      ))}
                    </>
                  )}
                  
                  <button className="btn-secondary mt-2" onClick={handleAddOption} style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
                    <Plus size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                    Tambah Opsi
                  </button>
                </div>

                <div className="flex justify-end gap-4 mt-8">
                  <button className="btn-secondary" onClick={() => setShowPreview(true)}>Pratinjau (Preview)</button>
                  <button className="btn" onClick={handleSaveQuestion}>Simpan ke Bank Soal</button>
                </div>
              </div>
            </div>
          </div>
        )}

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
            
            <TableFrame exportOptions={{ url: '/api/readings', params: { search: query, sort: readingSort }, filename: 'teks_bacaan.csv', disabled: readingList.loading || !!readingList.error || search !== query, columns: [{ title: 'Judul', value: r => r.title }, { title: 'Teks Bacaan', value: r => r.content }, { title: 'Soal Ditautkan', value: r => r._count?.questions || 0 }] }} sortLabel="Judul" sort={readingSort} onSort={value => { setReadingSort(value); setReadingPage(1); }} total={readingList.total} pageSize={readingPageSize} onPageSize={value => { setReadingPageSize(value); setReadingPage(1); }} label="Teks bacaan">
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
        {showPreview && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-panel p-8 animate-fade-in" style={{ width: '600px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', background: 'white' }}>
              <div className="flex justify-between items-center mb-6">
                <h2 style={{ margin: 0 }}>Pratinjau Tampilan Siswa</h2>
                <button className="btn-secondary" onClick={() => setShowPreview(false)}>Tutup</button>
              </div>
              
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem', background: '#f8fafc' }}>
                <div style={{ marginBottom: '1.5rem', fontSize: '1.1rem', whiteSpace: 'pre-wrap' }}>
                  {questionText ? (
                    <div className="katex-container">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {questionText}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>[Pertanyaan kosong...]</span>
                  )}
                  {questionImageUrl && (
                    <div className="mt-4">
                      <img src={questionImageUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }} />
                    </div>
                  )}
                </div>
                
                {questionType === 'Pilihan Ganda Sederhana' && (
                  <div className="flex flex-col gap-3">
                    {options.map((opt, i) => (
                      <label key={opt.id} className="flex items-center gap-3 p-3" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>
                        <input type="radio" disabled /> 
                        <span style={{ fontSize: '0.95rem' }} className="katex-container">
                          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{opt.text || `Pilihan ${i + 1}`}</ReactMarkdown>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {questionType === 'Pilihan Ganda Kompleks' && (
                  <div className="flex flex-col gap-3">
                    {options.map((opt, i) => (
                      <label key={opt.id} className="flex items-center gap-3 p-3" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" disabled /> 
                        <span style={{ fontSize: '0.95rem' }} className="katex-container">
                          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{opt.text || `Pernyataan ${i + 1}`}</ReactMarkdown>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {questionType === 'Pilihan Ganda Kompleks Kategori' && (
                  <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                    <div className="flex p-3" style={{ background: '#f1f5f9', fontWeight: 600, borderBottom: '1px solid #cbd5e1' }}>
                      <div style={{ flex: 2 }}>Pernyataan</div>
                      <div style={{ flex: 1, textAlign: 'center' }}>Kategori 1</div>
                      <div style={{ flex: 1, textAlign: 'center' }}>Kategori 2</div>
                    </div>
                    {options.map((opt, i) => (
                      <div key={opt.id} className="flex items-center p-3" style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ flex: 2, fontSize: '0.95rem' }} className="katex-container">
                          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{opt.text || `Pernyataan ${i + 1}`}</ReactMarkdown>
                        </div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                          <input type="radio" name={`prev_cat_${opt.id}`} disabled style={{ width: '18px', height: '18px' }} />
                        </div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                          <input type="radio" name={`prev_cat_${opt.id}`} disabled style={{ width: '18px', height: '18px' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default GuruDashboard;
