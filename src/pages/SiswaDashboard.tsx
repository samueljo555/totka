import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import { useState, useEffect } from 'react';
import { Clock, ChevronRight, ChevronLeft, CheckCircle2, ZoomIn, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
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

  // Offline & Auto-Sync State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessNotice, setSyncSuccessNotice] = useState(false);

  // Single Device Policy State (Kicked)
  const [kickedData, setKickedData] = useState<{ show: boolean; message: string } | null>(null);

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

  // Helper Antrian Jawaban Lokal (Offline Queue)
  const getQueue = (sId: string): any[] => {
    try {
      const q = localStorage.getItem(`tka_queue_${sId}`);
      return q ? JSON.parse(q) : [];
    } catch {
      return [];
    }
  };

  const saveQueue = (sId: string, queue: any[]) => {
    try {
      localStorage.setItem(`tka_queue_${sId}`, JSON.stringify(queue));
      setPendingSyncCount(queue.length);
    } catch (e) {
      console.error("Failed to save local queue:", e);
    }
  };

  const addToQueue = (sId: string, item: { questionId: string; answerData: any; qNumber: number }) => {
    const queue = getQueue(sId);
    const filtered = queue.filter(q => q.questionId !== item.questionId);
    filtered.push(item);
    saveQueue(sId, filtered);
  };

  // Sinkronisasi Jawaban Tertunda ke Server secara Otomatis
  const syncPendingQueue = async () => {
    if (!sessionId || isSyncing || !navigator.onLine) return;
    const queue = getQueue(sessionId);
    if (queue.length === 0) {
      setPendingSyncCount(0);
      return;
    }

    setIsSyncing(true);
    let remaining = [...queue];

    for (const item of queue) {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/answer`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-session-token': user?.activeToken || '',
            'x-student-id': user?.id || ''
          },
          body: JSON.stringify({ 
            questionId: item.questionId, 
            answerData: item.answerData,
            studentId: user?.id,
            sessionToken: user?.activeToken
          })
        });

        if (res.status === 401) {
          const data = await res.json();
          if (data.error === 'SESSION_KICKED') {
            setKickedData({ show: true, message: data.message });
            setIsSyncing(false);
            return;
          }
        }

        if (res.ok) {
          remaining = remaining.filter(q => q.questionId !== item.questionId);
          saveQueue(sessionId, remaining);
        } else {
          break; // Berhenti sementara dan coba lagi nanti
        }
      } catch (err) {
        setIsOnline(false);
        break;
      }
    }

    setIsSyncing(false);
    if (remaining.length === 0) {
      setSyncSuccessNotice(true);
      setTimeout(() => setSyncSuccessNotice(false), 3500);
    }
  };

  // Deteksi Status Jaringan Online / Offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (sessionId) {
        syncPendingQueue();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sessionId]);

  // Heartbeat Single Device Check & Auto-Sync Rutin
  useEffect(() => {
    if (!hasEnteredToken || isFinished || !user?.id || !user?.activeToken) return;

    const interval = setInterval(async () => {
      if (navigator.onLine && sessionId) {
        const q = getQueue(sessionId);
        if (q.length > 0) {
          syncPendingQueue();
        }
      }

      if (navigator.onLine) {
        try {
          const res = await fetch(`/api/auth/session-check?studentId=${user.id}`, {
            headers: { 'x-session-token': user.activeToken }
          });
          if (res.status === 401) {
            const data = await res.json();
            if (data.error === 'SESSION_KICKED') {
              setKickedData({ show: true, message: data.message });
            }
          }
        } catch {
          // Abaikan glitch jaringan sementara
        }
      }
    }, 15000); // Cek setiap 15 detik

    return () => clearInterval(interval);
  }, [hasEnteredToken, isFinished, sessionId, user?.id, user?.activeToken]);

  const handleAnswer = async (qNumber: number, answer: any) => {
    setAnswers(prev => ({ ...prev, [qNumber]: answer }));

    if (!sessionId || !questions[qNumber - 1]) return;
    const questionId = questions[qNumber - 1].id;

    // Backup ke LocalStorage
    try {
      localStorage.setItem(`tka_answers_${sessionId}`, JSON.stringify({ ...answers, [qNumber]: answer }));
    } catch (e) {}

    // Jika sedang offline, masukkan langsung ke antrian offline
    if (!navigator.onLine) {
      setIsOnline(false);
      addToQueue(sessionId, { questionId, answerData: answer, qNumber });
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/answer`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-session-token': user?.activeToken || '',
          'x-student-id': user?.id || ''
        },
        body: JSON.stringify({ 
          questionId, 
          answerData: answer,
          studentId: user?.id,
          sessionToken: user?.activeToken
        })
      });

      if (res.status === 401) {
        const data = await res.json();
        if (data.error === 'SESSION_KICKED') {
          setKickedData({ show: true, message: data.message });
          return;
        }
      }

      if (!res.ok) {
        throw new Error('Gagal menyimpan jawaban');
      }

      // Jika berhasil dan sebelumnya ada di antrian, bersihkan
      const currentQueue = getQueue(sessionId);
      if (currentQueue.some(q => q.questionId === questionId)) {
        saveQueue(sessionId, currentQueue.filter(q => q.questionId !== questionId));
      }
    } catch (err) {
      setIsOnline(false);
      addToQueue(sessionId, { questionId, answerData: answer, qNumber });
    }
  };

  const startExamWithToken = async (examToken: string) => {
    if (examToken.length < 3) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-session-token': user?.activeToken || '',
          'x-student-id': user?.id || ''
        },
        body: JSON.stringify({ 
          studentId: user.id, 
          token: examToken,
          sessionToken: user?.activeToken
        })
      });
      const data = await res.json();

      if (res.status === 401 && data.error === 'SESSION_KICKED') {
        setKickedData({ show: true, message: data.message });
        return;
      }

      if (!res.ok) {
        sessionStorage.removeItem('activeExamToken');
        throw new Error(data.error || 'Gagal memulai ujian');
      }

      sessionStorage.setItem('activeExamToken', examToken);

      setSessionId(data.session.id);
      setQuestions(data.questions || []);
      setReleaseScoreMode(data.package?.releaseScoreMode || 'langsung');
      
      // Update pending queue count jika ada sisa antrian di perangkat ini
      const localQueue = getQueue(data.session.id);
      setPendingSyncCount(localQueue.length);

      // Map existing answers to our qNumber format
      const loadedAnswers: Record<number, any> = {};
      if (data.questions && data.existingAnswers) {
        data.questions.forEach((q: any, idx: number) => {
          const ans = data.existingAnswers.find((a: any) => a.questionId === q.id);
          if (ans) loadedAnswers[idx + 1] = ans.answerData;
        });
      }

      // Timpa dengan backup lokal jika ada jawaban offline yang belum sempat terkirim
      try {
        const localBackup = localStorage.getItem(`tka_answers_${data.session.id}`);
        if (localBackup) {
          const parsed = JSON.parse(localBackup);
          Object.assign(loadedAnswers, parsed);
        }
      } catch (e) {}

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

    // Proteksi: Cegah selesai ujian jika masih offline atau ada jawaban di antrian
    if (!navigator.onLine || pendingSyncCount > 0) {
      toast.error(
        `Koneksi internet Anda sedang terputus atau masih ada ${pendingSyncCount} jawaban yang belum tersinkronkan ke server. Harap tunggu hingga koneksi pulih sebelum mengakhiri ujian.`,
        { duration: 6000 }
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/finish`, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': user?.activeToken || '',
          'x-student-id': user?.id || ''
        },
        body: JSON.stringify({
          studentId: user?.id,
          sessionToken: user?.activeToken
        })
      });

      if (res.status === 401) {
        const data = await res.json();
        if (data.error === 'SESSION_KICKED') {
          setKickedData({ show: true, message: data.message });
          return;
        }
      }

      if (res.ok) {
        const data = await res.json();
        sessionStorage.removeItem('activeExamToken');
        // Bersihkan antrian lokal setelah sukses selesai
        localStorage.removeItem(`tka_queue_${sessionId}`);
        localStorage.removeItem(`tka_answers_${sessionId}`);
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

        {/* Offline & Auto-Sync Alert Banners */}
        {!isOnline && (
          <div style={{
            background: '#fee2e2',
            borderBottom: '1px solid #f87171',
            color: '#991b1b',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            fontSize: '0.9rem',
            fontWeight: 600,
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            zIndex: 9
          }}>
            <WifiOff size={18} style={{ color: '#dc2626' }} />
            <span>
              Koneksi Internet Terputus! Anda sedang mode offline. Jawaban Anda tetap tersimpan aman di perangkat ini
              {pendingSyncCount > 0 ? ` (${pendingSyncCount} jawaban menunggu sinkronisasi)` : ''}.
            </span>
          </div>
        )}

        {isOnline && isSyncing && (
          <div style={{
            background: '#fef3c7',
            borderBottom: '1px solid #fcd34d',
            color: '#92400e',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            fontSize: '0.9rem',
            fontWeight: 600,
            zIndex: 9
          }}>
            <RefreshCw size={16} className="animate-spin" />
            <span>Koneksi pulih! Sedang menyinkronkan {pendingSyncCount} jawaban tertunda ke server...</span>
          </div>
        )}

        {isOnline && syncSuccessNotice && (
          <div style={{
            background: '#dcfce7',
            borderBottom: '1px solid #86efac',
            color: '#166534',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            fontSize: '0.9rem',
            fontWeight: 600,
            zIndex: 9
          }}>
            <CheckCircle2 size={18} style={{ color: '#16a34a' }} />
            <span>Semua jawaban berhasil tersimpan aman di server!</span>
          </div>
        )}

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Siswa TKA</h2>
            {isOnline ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 600, background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '12px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }}></span>
                Online
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 600, background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '12px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }}></span>
                Offline
              </span>
            )}
          </div>
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

      {/* Modal Single Device Policy (Kicked by Another Device) */}
      {kickedData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(8px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div className="glass-panel p-8 text-center" style={{ maxWidth: '440px', width: '100%', background: 'white' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem auto'
            }}>
              <AlertCircle size={36} style={{ color: '#dc2626' }} />
            </div>
            <h2 style={{ fontSize: '1.4rem', color: '#991b1b', marginBottom: '0.75rem' }}>
              Sesi Ujian Dinonaktifkan
            </h2>
            <p style={{ color: '#4b5563', lineHeight: '1.6', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
              {kickedData.message || 'Akun Anda baru saja login di perangkat lain. Sistem try out hanya mengizinkan 1 perangkat aktif pada saat bersamaan.'}
            </p>
            <button 
              className="btn" 
              style={{ width: '100%', background: '#dc2626', color: 'white' }}
              onClick={() => {
                sessionStorage.removeItem('activeExamToken');
                onLogout();
              }}
            >
              Kembali ke Halaman Login
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SiswaDashboard;
