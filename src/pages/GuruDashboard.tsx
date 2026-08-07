import React, { useState, useEffect } from 'react';
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

const GuruDashboard = ({ user, onLogout }: { user?: any, onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState('bank');
  const [isAdding, setIsAdding] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === 'bank') {
      fetch('/api/questions')
        .then(res => res.json())
        .then(data => setQuestions(data))
        .catch(err => console.error("Error fetching questions:", err));
    }
  }, [activeTab]);
  const [questionType, setQuestionType] = useState('Pilihan Ganda Sederhana');
  
  const [elements, setElements] = useState(['Bilangan', 'Geometri & Pengukuran', 'Data']);
  const [selectedElement, setSelectedElement] = useState(elements[0]);
  const [isAddingElement, setIsAddingElement] = useState(false);
  const [newElement, setNewElement] = useState('');
  
  const [options, setOptions] = useState([
    { id: 1, text: '' }, 
    { id: 2, text: '' }, 
    { id: 3, text: '' }, 
    { id: 4, text: '' }
  ]);
  const [questionText, setQuestionText] = useState('');
  const [showPreview, setShowPreview] = useState(false);

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
      alert("Harus ada minimal 2 pilihan jawaban/pernyataan.");
    }
  };

  const handleAddElement = () => {
    if (newElement.trim() && !elements.includes(newElement.trim())) {
      setElements([...elements, newElement.trim()]);
      setSelectedElement(newElement.trim());
    }
    setNewElement('');
    setIsAddingElement(false);
  };

  const handleDeleteElement = () => {
    if (elements.length > 1) {
      const newElements = elements.filter(el => el !== selectedElement);
      setElements(newElements);
      setSelectedElement(newElements[0]);
    } else {
      alert("Harus menyisakan minimal 1 elemen.");
    }
  };

  const tabs = [
    { id: 'bank', name: 'Bank Soal', icon: <Library size={20} /> },
    { id: 'bacaan', name: 'Manajemen Bacaan', icon: <FileText size={20} /> },
  ];

  return (
    <div className="flex" style={{ minHeight: '100vh' }}>
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
        <header className="flex justify-between items-center mb-8">
          <h1>{tabs.find(t => t.id === activeTab)?.name}</h1>
          <div className="flex items-center gap-4">
            <div className="input-group" style={{ marginBottom: 0, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="text" className="input-field" placeholder="Cari soal/bacaan..." style={{ paddingLeft: '40px', width: '250px' }} />
            </div>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#00b8d9', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              GP
            </div>
          </div>
        </header>

        {activeTab === 'bank' && !isAdding && (
          <div className="animate-fade-in glass-panel p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2>Daftar Soal</h2>
                <p>Kelola bank soal untuk materi Matematika dan Bahasa Indonesia.</p>
              </div>
              <button className="btn" onClick={() => setIsAdding(true)}>
                <Plus size={18} /> Tambah Soal
              </button>
            </div>

            <div className="flex gap-4 mb-6">
              <select className="input-field" style={{ width: '200px' }}>
                <option>Semua Mata Pelajaran</option>
                <option>Matematika</option>
                <option>Bahasa Indonesia</option>
              </select>
              <select className="input-field" style={{ width: '200px' }}>
                <option>Semua Tipe Soal</option>
                <option>PG Sederhana</option>
                <option>PG Kompleks</option>
                <option>PG Kategori</option>
              </select>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                  <th className="p-4">Mapel / Elemen</th>
                  <th className="p-4">Tipe Soal</th>
                  <th className="p-4">Cuplikan Soal</th>
                  <th className="p-4">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {questions.length > 0 ? questions.map((soal, i) => (
                  <tr key={soal.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td className="p-4">
                      <span className="tag">{soal.subject || 'Mapel'}</span>
                    </td>
                    <td className="p-4 font-semibold text-main">{soal.type || 'Pilihan Ganda'}</td>
                    <td className="p-4" style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {soal.text}
                    </td>
                    <td className="p-4 flex gap-2">
                      <button className="btn-secondary" style={{ padding: '6px', borderRadius: '6px', color: 'var(--primary-color)' }} title="Lihat Pratinjau" onClick={() => {
                        setQuestionText(soal.text);
                        setQuestionType(soal.type || 'Pilihan Ganda Sederhana');
                        setOptions([{ id: 1, text: 'Contoh A' }, { id: 2, text: 'Contoh B' }]);
                        setShowPreview(true);
                      }}>
                        <Eye size={16}/>
                      </button>
                      <button className="btn-secondary" style={{ padding: '6px', borderRadius: '6px' }} title="Edit"><Edit size={16}/></button>
                      <button className="btn-secondary" style={{ padding: '6px', borderRadius: '6px', color: '#d32f2f' }} title="Hapus"><Trash2 size={16}/></button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted">Belum ada soal (Atau sedang memuat dari API).</td>
                  </tr>
                )}
              </tbody>
            </table>
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
                  <select className="input-field">
                    <option>Matematika (Numerasi)</option>
                    <option>Bahasa Indonesia (Literasi Membaca)</option>
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
                        {elements.map(el => (
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
                  <select className="input-field">
                    <option>-- Tidak Terpaut Bacaan --</option>
                    <option>Teks Fiksi: "Petualangan Kancil"</option>
                    <option>Teks Informasi: "Siklus Air"</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="input-group">
                  <label className="input-label">Pertanyaan Soal</label>
                  <textarea className="input-field" rows={5} placeholder="Ketik pertanyaan di sini..." value={questionText} onChange={(e) => setQuestionText(e.target.value)}></textarea>
                  <div className="mt-4">
                    <button className="btn-secondary" style={{ padding: '8px 12px', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <ImageIcon size={16}/> Sisipkan Gambar
                    </button>
                  </div>
                </div>

                <div className="input-group mt-4">
                  {questionType === 'Pilihan Ganda Sederhana' && (
                    <>
                      <label className="input-label">Pilihan Jawaban (Beri centang pada kunci yang benar)</label>
                      {options.map((opt, index) => (
                        <div key={opt.id} className="flex items-center gap-4 mb-2">
                          <input type="radio" name="correct_answer" style={{ width: '20px', height: '20px' }} />
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
                          <input type="checkbox" name={`correct_answer_${opt.id}`} style={{ width: '20px', height: '20px' }} />
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
                        <div style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', textAlign: 'center' }}>Kategori 1 (Mis: Benar)</div>
                        <div style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', textAlign: 'center' }}>Kategori 2 (Mis: Salah)</div>
                        <div style={{ width: '36px' }}></div> {/* Spacer for delete button */}
                      </div>
                      {options.map((opt, index) => (
                        <div key={opt.id} className="flex items-center gap-4 mb-2">
                          <input type="text" className="input-field" style={{ flex: 2 }} placeholder={`Pernyataan ${index + 1}`} value={opt.text} onChange={(e) => handleOptionChange(opt.id, e.target.value)} />
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                            <input type="radio" name={`cat_stmt_${opt.id}`} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                          </div>
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                            <input type="radio" name={`cat_stmt_${opt.id}`} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
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
                  <button className="btn" onClick={() => setIsAdding(false)}>Simpan ke Bank Soal</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'bacaan' && (
          <div className="animate-fade-in glass-panel p-8 flex flex-col items-center justify-center text-center" style={{ minHeight: '400px' }}>
            <FileText size={48} style={{ color: 'var(--primary-light)', marginBottom: '1rem' }} />
            <h2>Manajemen Teks Bacaan Bersama</h2>
            <p style={{ maxWidth: '400px' }}>Modul ini mengelola bacaan yang dapat ditautkan ke lebih dari satu soal sekaligus (khususnya untuk literasi).</p>
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
                  {questionText || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>[Pertanyaan kosong...]</span>}
                </div>
                
                {questionType === 'Pilihan Ganda Sederhana' && (
                  <div className="flex flex-col gap-3">
                    {options.map((opt, i) => (
                      <label key={opt.id} className="flex items-center gap-3 p-3" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>
                        <input type="radio" name="preview_answer" style={{ width: '18px', height: '18px' }} />
                        <span>{opt.text || `Pilihan ${i + 1}`}</span>
                      </label>
                    ))}
                  </div>
                )}

                {questionType === 'Pilihan Ganda Kompleks' && (
                  <div className="flex flex-col gap-3">
                    {options.map((opt, i) => (
                      <label key={opt.id} className="flex items-center gap-3 p-3" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: '18px', height: '18px' }} />
                        <span>{opt.text || `Pernyataan ${i + 1}`}</span>
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
                        <div style={{ flex: 2 }}>{opt.text || `Pernyataan ${i + 1}`}</div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                          <input type="radio" name={`prev_cat_${opt.id}`} style={{ width: '18px', height: '18px' }} />
                        </div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                          <input type="radio" name={`prev_cat_${opt.id}`} style={{ width: '18px', height: '18px' }} />
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
