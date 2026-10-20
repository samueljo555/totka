import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { Clock, ChevronRight, ChevronLeft, CheckCircle2, ZoomIn } from 'lucide-react';
import { ImageModal } from '../components/ImageModal';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

const SiswaDashboard = ({ user, onLogout }: { user?: any, onLogout: () => void }) => {
  const confirmModal = useConfirm();
  const [hasEnteredToken, setHasEnteredToken] = useState(false);
  const [token, setToken] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Engine State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [questions, setQuestions] = useState<any[]>([]);
  const totalQuestions = questions.length;
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [timeLeft, setTimeLeft] = useState(90 * 60); // 90 minutes
  const [isFinished, setIsFinished] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [releaseScoreMode, setReleaseScoreMode] = useState<string>('langsung');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Timer effect
  useEffect(() => {
    if (hasEnteredToken && !isFinished && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && !isFinished) {
      handleFinishExam(); // Auto-submit
    }
  }, [hasEnteredToken, timeLeft, isFinished]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAnswer = async (qNumber: number, answer: any) => {
    setAnswers(prev => ({ ...prev, [qNumber]: answer }));
    if (sessionId && questions[qNumber - 1]) {
      try {
        await fetch(`/api/sessions/${sessionId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId: questions[qNumber - 1].id, answerData: answer })
        });
      } catch (err) {
        console.error("Failed to auto-save answer:", err);
      }
    }
  };

  const startExamWithToken = async (examToken: string) => {
    if (examToken.length < 3) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user.id, token: examToken })
      });
      const data = await res.json();
      if (!res.ok) {
        sessionStorage.removeItem('activeExamToken');
        throw new Error(data.error || 'Gagal memulai ujian');
      }

      sessionStorage.setItem('activeExamToken', examToken);

      setSessionId(data.session.id);
      setQuestions(data.questions || []);
      setReleaseScoreMode(data.package?.releaseScoreMode || 'langsung');
      
      // Map existing answers to our qNumber format
      const loadedAnswers: Record<number, any> = {};
      if (data.questions && data.existingAnswers) {
        data.questions.forEach((q: any, idx: number) => {
          const ans = data.existingAnswers.find((a: any) => a.questionId === q.id);
          if (ans) loadedAnswers[idx + 1] = ans.answerData;
        });
      }
      setAnswers(loadedAnswers);
      
      // Calculate remaining time
      const startTime = new Date(data.session.startTime).getTime();
      const elapsedSecs = Math.floor((Date.now() - startTime) / 1000);
      const durationSecs = (data.package?.durationMinutes || 90) * 60;
      setTimeLeft(Math.max(0, durationSecs - elapsedSecs));

      setHasEnteredToken(true);
      if (data.session.status === 'selesai') {
        sessionStorage.removeItem('activeExamToken');
        setFinalScore(data.session.totalScore ? parseFloat(data.session.totalScore) : 0);
        setIsFinished(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartExam = () => startExamWithToken(token);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('activeExamToken');
    if (savedToken && !hasEnteredToken) {
      setToken(savedToken);
      startExamWithToken(savedToken);
    }
  }, []);

  const handleFinishExam = async () => {
    if (!sessionId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/finish`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        sessionStorage.removeItem('activeExamToken');
        setFinalScore(data.totalScore ? parseFloat(data.totalScore) : 0);
        setIsFinished(true);
      } else {
        toast.error("Gagal mengakhiri sesi ujian.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasEnteredToken) {
    return (
      <div className="app-container flex justify-center items-center">
        <div className="glass-panel p-8 animate-fade-in text-center" style={{ maxWidth: '500px', width: '100%' }}>
          <h2 className="mb-2">Mulai Ujian</h2>
          <p className="mb-6">Silakan masukkan Token Ujian yang diberikan oleh Operator Sekolah Anda.</p>
          
          {errorMsg && <div className="p-3 mb-4 text-sm text-red-600 bg-red-100 rounded-lg">{errorMsg}</div>}
          
          <div className="input-group text-left">
            <label className="input-label">Token Ujian</label>
            <input 
              type="text" 
              className="input-field" 
              style={{ fontSize: '1.5rem', textAlign: 'center', letterSpacing: '4px', textTransform: 'uppercase' }}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Masukkan Token"
            />
          </div>
          
          <button 
            className="btn mt-4" 
            style={{ width: '100%', opacity: isLoading ? 0.7 : 1 }}
            disabled={isLoading}
            onClick={handleStartExam}
          >
            {isLoading ? 'Memproses...' : 'Mulai Kerjakan'}
          </button>
          
          <button className="btn-secondary mt-4" style={{ width: '100%' }} onClick={() => { sessionStorage.removeItem('activeExamToken'); onLogout(); }}>
            Kembali
          </button>
        </div>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="app-container flex justify-center items-center text-center">
        <div className="glass-panel p-8 animate-fade-in">
          <CheckCircle2 size={64} style={{ color: 'green', margin: '0 auto 1rem auto' }} />
          <h2>Ujian Selesai!</h2>
          <p className="mb-6">Terima kasih, jawaban Anda telah berhasil disimpan di sistem.</p>
          
          <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: '2rem' }}>
            {releaseScoreMode === 'langsung' ? (
              <>
                <h3 style={{ fontSize: '2.5rem', margin: 0, color: 'var(--primary-color)' }}>
                  {finalScore !== null ? Math.round(finalScore) : '---'} / 100
                </h3>
                <p>Skor Total (Sesi Ujian)</p>
                <small style={{ color: 'var(--text-muted)' }}>*Sistem diatur untuk menampilkan nilai secara langsung.</small>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-muted)', padding: '1rem 0' }}>
                  Menunggu Rilis
                </h3>
                <p>Skor Anda telah terekam di sistem.</p>
                <small style={{ color: 'var(--text-muted)' }}>*Nilai akan diumumkan kemudian oleh pihak penyelenggara.</small>
              </>
            )}
          </div>

          <button className="btn" onClick={() => { sessionStorage.removeItem('activeExamToken'); onLogout(); }}>Kembali ke Beranda</button>
        </div>
      </div>
    );
  }

  // Question Content from API
  const renderQuestion = () => {
    if (questions.length === 0) {
      return (
        <div className="animate-fade-in text-center p-8">
          <h2 className="text-muted">Soal ujian belum tersedia (Atau sedang memuat).</h2>
        </div>
      );
    }

    const questionIndex = currentQuestion - 1;
    const q = questions[questionIndex];
    if (!q) return null;

    const type = q.type || 'Pilihan Ganda Sederhana';

    return (
      <div className="animate-fade-in">
        <div className="flex justify-between items-center mb-6">
          <h2 style={{ margin: 0 }}>Soal No. {currentQuestion}</h2>
          <span className="tag">{type}</span>
        </div>

        {q.reading && (
          <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '2rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--primary-dark)' }}>Wacana: {q.reading.title}</h3>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: 'var(--text-main)' }}>{q.reading.content}</div>
          </div>
        )}

        <div style={{ fontSize: '1.2rem', marginBottom: '2rem', lineHeight: '1.8' }}>
          {q.content ? (
            <div className="katex-container">
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {q.content}
              </ReactMarkdown>
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>[Pertanyaan kosong...]</span>
          )}
          {q.imageUrl && (
            <div className="mt-4">
              <div 
                onClick={() => setPreviewImage(q.imageUrl)}
                style={{
                  display: 'inline-block',
                  position: 'relative',
                  cursor: 'zoom-in',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid #cbd5e1',
                  transition: 'all 0.2s ease',
                  backgroundColor: '#f8fafc'
                }}
                title="Klik untuk memperbesar gambar"
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 82, 204, 0.15)';
                  e.currentTarget.style.borderColor = 'var(--primary-color)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                }}
              >
                <img 
                  src={q.imageUrl} 
                  alt="Gambar Soal" 
                  style={{ maxWidth: '100%', maxHeight: '300px', display: 'block', borderRadius: '7px' }} 
                />
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(4px)',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  pointerEvents: 'none'
                }}>
                  <ZoomIn size={14} />
                  <span>Klik untuk perbesar</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {type.includes('Pilihan Ganda Sederhana') && q.options && (
          <div className="flex flex-col gap-4">
            {(Array.isArray(q.options) ? q.options : []).map((opt: any, i: number) => (
              <label 
                key={opt.id || i} 
                className="flex items-center gap-4 p-4" 
                style={{ 
                  background: answers[currentQuestion] === i ? 'rgba(0, 82, 204, 0.05)' : 'white', 
                  border: answers[currentQuestion] === i ? '2px solid var(--primary-color)' : '1px solid #cbd5e1', 
                  borderRadius: '8px', 
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <input 
                  type="radio" 
                  name={`q_${currentQuestion}`} 
                  checked={answers[currentQuestion] === i}
                  onChange={() => handleAnswer(currentQuestion, i)}
                  style={{ width: '20px', height: '20px' }} 
                />
                <span style={{ fontSize: '1.1rem' }} className="katex-container">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{opt.text || `Pilihan ${i + 1}`}</ReactMarkdown>
                </span>
              </label>
            ))}
          </div>
        )}

        {type === 'Pilihan Ganda Kompleks' && q.options && (
          <div className="flex flex-col gap-4">
            {(Array.isArray(q.options) ? q.options : []).map((opt: any, i: number) => {
              const currentAnswers = Array.isArray(answers[currentQuestion]) ? answers[currentQuestion] : [];
              const isChecked = currentAnswers.includes(i);
              return (
                <label 
                  key={opt.id || i} 
                  className="flex items-center gap-4 p-4" 
                  style={{ 
                    background: isChecked ? 'rgba(0, 82, 204, 0.05)' : 'white', 
                    border: isChecked ? '2px solid var(--primary-color)' : '1px solid #cbd5e1', 
                    borderRadius: '8px', 
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={isChecked}
                    onChange={(e) => {
                      let newAnswers = [...currentAnswers];
                      if (e.target.checked) newAnswers.push(i);
                      else newAnswers = newAnswers.filter((a: number) => a !== i);
                      handleAnswer(currentQuestion, newAnswers);
                    }}
                    style={{ width: '20px', height: '20px' }} 
                  />
                  <span style={{ fontSize: '1.1rem' }} className="katex-container">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{opt.text || `Pernyataan ${i + 1}`}</ReactMarkdown>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {type === 'Pilihan Ganda Kompleks Kategori' && q.options && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-4 p-4" style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
               <div style={{ flex: 2, fontWeight: 600 }}>Pernyataan</div>
               <div style={{ flex: 1, fontWeight: 600, textAlign: 'center' }}>Benar</div>
               <div style={{ flex: 1, fontWeight: 600, textAlign: 'center' }}>Salah</div>
            </div>
            {(Array.isArray(q.options) ? q.options : []).map((opt: any, i: number) => {
              const currentAnswers = Array.isArray(answers[currentQuestion]) ? answers[currentQuestion] : [];
              return (
                <div key={opt.id || i} className="flex items-center gap-4 p-4" style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                  <div style={{ flex: 2, fontSize: '1.1rem' }} className="katex-container">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{opt.text || `Pernyataan ${i + 1}`}</ReactMarkdown>
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                    <input 
                      type="radio" 
                      name={`cat_stmt_${currentQuestion}_${i}`} 
                      checked={currentAnswers[i] === 0}
                      onChange={() => {
                        const newAnswers = [...currentAnswers];
                        newAnswers[i] = 0;
                        handleAnswer(currentQuestion, newAnswers);
                      }}
                      style={{ width: '20px', height: '20px', cursor: 'pointer' }} 
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                    <input 
                      type="radio" 
                      name={`cat_stmt_${currentQuestion}_${i}`} 
                      checked={currentAnswers[i] === 1}
                      onChange={() => {
                        const newAnswers = [...currentAnswers];
                        newAnswers[i] = 1;
                        handleAnswer(currentQuestion, newAnswers);
                      }}
                      style={{ width: '20px', height: '20px', cursor: 'pointer' }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-color)', overflow: 'hidden' }}>
      
      {/* Main Exam Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header className="glass-panel" style={{ borderRadius: 0, padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
          <div className="flex items-center gap-4">
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>TKA Ujian</h2>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2" style={{ background: timeLeft < 300 ? 'rgba(255,0,0,0.1)' : 'rgba(0, 82, 204, 0.1)', color: timeLeft < 300 ? 'red' : 'var(--primary-dark)', padding: '8px 16px', borderRadius: '30px', fontWeight: 700, fontSize: '1.2rem' }}>
              <Clock size={20} />
              <span>{formatTime(timeLeft)}</span>
            </div>
            <button className="btn" style={{ background: '#d32f2f', opacity: isSubmitting ? 0.7 : 1 }} disabled={isSubmitting} onClick={async () => {
              if (await confirmModal({ title: 'Konfirmasi', message: "Apakah Anda yakin ingin menyelesaikan ujian? Jawaban tidak bisa diubah lagi." })) {
                handleFinishExam();
              }
            }}>
              {isSubmitting ? 'Menyimpan...' : 'Selesai Ujian'}
            </button>
          </div>
        </header>

        {/* Question Area */}
        <main style={{ flex: 1, padding: '3rem', overflowY: 'auto' }}>
          <div className="glass-panel p-8" style={{ maxWidth: '800px', margin: '0 auto', background: 'rgba(255,255,255,0.9)' }}>
            {renderQuestion()}

            <div className="flex justify-between mt-12 pt-6" style={{ borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <button 
                className="btn-secondary" 
                disabled={currentQuestion === 1}
                onClick={() => setCurrentQuestion(prev => Math.max(1, prev - 1))}
              >
                <ChevronLeft size={18} style={{ marginRight: '4px' }} /> Sebelumnya
              </button>
              {currentQuestion < totalQuestions ? (
                <button 
                  className="btn" 
                  onClick={() => setCurrentQuestion(prev => Math.min(totalQuestions, prev + 1))}
                >
                  Selanjutnya <ChevronRight size={18} style={{ marginLeft: '4px' }} />
                </button>
              ) : (
                <button 
                  className="btn" 
                  style={{ background: '#d32f2f' }}
                  disabled={isSubmitting}
                  onClick={async () => {
              if (await confirmModal({ title: 'Konfirmasi', message: "Apakah Anda yakin ingin menyelesaikan TO? Jawaban tidak bisa diubah lagi." })) {
                      handleFinishExam();
                    }
                  }}
                >
                  {isSubmitting ? 'Menyimpan...' : 'Selesai'}
                </button>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Navigation Sidebar */}
      <aside className="glass-panel" style={{ width: '320px', borderRadius: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(0,0,0,0.1)' }}>
        <div className="p-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Siswa TKA</h2>
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>{user?.school?.name || 'Sekolah Pusat / Belum Terdaftar'}</p>
        </div>
        
        <div className="p-6" style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
            {Array.from({ length: totalQuestions }).map((_, i) => {
              const qNum = i + 1;
              const isAnswered = answers[qNum] !== undefined && (typeof answers[qNum] !== 'object' || Object.keys(answers[qNum]).length > 0);
              const isCurrent = currentQuestion === qNum;
              
              return (
                <button
                  key={qNum}
                  onClick={() => setCurrentQuestion(qNum)}
                  style={{
                    aspectRatio: '1',
                    borderRadius: '8px',
                    border: isCurrent ? '2px solid var(--primary-color)' : isAnswered ? '1px solid var(--primary-color)' : '1px solid #cbd5e1',
                    background: isAnswered ? 'var(--primary-color)' : 'white',
                    color: isAnswered ? 'white' : 'var(--text-main)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: isCurrent ? '0 0 0 3px rgba(0,82,204,0.2)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  {qNum}
                </button>
              );
            })}
          </div>

          <div className="mt-8">
            <div className="flex items-center gap-2 mb-2" style={{ fontSize: '0.85rem' }}>
              <div style={{ width: '16px', height: '16px', background: 'var(--primary-color)', borderRadius: '4px' }}></div>
              <span>Sudah Dijawab ({Object.keys(answers).length})</span>
            </div>
            <div className="flex items-center gap-2" style={{ fontSize: '0.85rem' }}>
              <div style={{ width: '16px', height: '16px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px' }}></div>
              <span>Belum Dijawab ({totalQuestions - Object.keys(answers).length})</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Modal Lightbox untuk Perbesar Gambar Soal */}
      <ImageModal 
        isOpen={!!previewImage} 
        imageUrl={previewImage} 
        altText={`Gambar Soal No. ${currentQuestion}`}
        onClose={() => setPreviewImage(null)} 
      />
    </div>
  );
};

export default SiswaDashboard;
