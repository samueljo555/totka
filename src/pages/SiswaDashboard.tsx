import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import { useState, useEffect, useRef } from 'react';
import { Clock, ChevronRight, ChevronLeft, CheckCircle2, ZoomIn, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { AnswerSync } from '../lib/answer-sync';
import type { SyncSnapshot } from '../lib/answer-sync';
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
  const hasAnswer = (value: any) => value !== undefined && value !== null && (Array.isArray(value) ? value.some(item => item !== null && item !== undefined) : typeof value === 'number');
  const answeredCount = Object.values(answers).filter(hasAnswer).length;
  const [timeLeft, setTimeLeft] = useState(90 * 60); // 90 minutes
  const [isFinished, setIsFinished] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [releaseScoreMode, setReleaseScoreMode] = useState<string>('langsung');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const sync = useRef<AnswerSync | null>(null);
  const finishResult = useRef<(session: any, rejected?: boolean) => void>(() => {});
  const startAttempt = useRef(0);
  const deadlineAt = useRef<number | null>(null);
  const finishHandler = useRef<(expired?: boolean) => Promise<void>>(async () => {});
  const finishedRef = useRef(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Offline & Auto-Sync State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncSnapshot | null>(null);
  const pendingSyncCount = syncStatus?.pendingCount || 0;

  // Single Device Policy State (Kicked)
  const [kickedData, setKickedData] = useState<{ show: boolean; message: string } | null>(null);

  // Server supplies the remaining budget. A monotonic clock avoids local wall-clock changes
  // and interval drift when the browser tab is throttled. The server enforces the deadline.
  useEffect(() => {
    if (!hasEnteredToken || isFinished) return;
    let lastAttempt = -Infinity;
    const tick = () => {
      if (deadlineAt.current === null) return;
      const remaining = Math.max(0, Math.ceil((deadlineAt.current - performance.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && navigator.onLine && performance.now() - lastAttempt >= 5000) {
        lastAttempt = performance.now();
        void finishHandler.current(true);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [hasEnteredToken, isFinished]);

  const acceptFinishedSession = (session: any, rejected = false) => {
    if (session?.status !== 'selesai') return;
    if (rejected || (sync.current?.snapshot().pendingCount || 0) > 0) {
      toast.error('Ujian telah ditutup. Jawaban yang belum diterima server sebelum batas waktu tidak dinilai.', { duration: 8000 });
    }
    finishedRef.current = true;
    setReleaseScoreMode(session.releaseScoreMode || 'ditunda');
    setFinalScore(session.totalScore === null ? null : Number(session.totalScore));
    setIsFinished(true);
    sessionStorage.removeItem('activeExamToken');
    sync.current?.complete();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Listeners call the current engine, so closures never retain an old queue.
  useEffect(() => {
    const online = () => { setIsOnline(true); sync.current?.wake(); };
    const offline = () => { setIsOnline(false); sync.current?.wake(); };
    const storage = () => sync.current?.refresh();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('storage', storage);
      startAttempt.current += 1;
      sync.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!hasEnteredToken || isFinished || !user?.id) return;
    const heartbeat = async () => {
      if (!navigator.onLine) return;
      try {
        const response = await fetch(`/api/auth/session-check?studentId=${user.id}`, { signal: AbortSignal.timeout(15000) });
        if (response.status === 401) {
          const data = await response.json();
          sync.current?.dispose();
          setKickedData({ show: true, message: data.message || 'Sesi login tidak aktif.' });
        }
      } catch { /* Heartbeat failure does not mean navigator is offline. */ }
    };
    const timer = setInterval(() => { void heartbeat(); }, 15000);
    return () => clearInterval(timer);
  }, [hasEnteredToken, isFinished, user?.id]);

  const handleAnswer = (qNumber: number, answer: any) => {
    if (submittingRef.current || finishedRef.current || (deadlineAt.current !== null && performance.now() >= deadlineAt.current)) return;
    const question = questions[qNumber - 1];
    if (!question || !sync.current) return;
    try { sync.current.enqueue(question.id, answer); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Jawaban belum dapat disimpan.'); }
  };

  const startExamWithToken = async (examToken: string) => {
    if (examToken.length < 3) return;
    const attempt = ++startAttempt.current;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
          signal: AbortSignal.timeout(15000),
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
      if (attempt !== startAttempt.current) return;

      if (res.status === 401 && data.error === 'SESSION_KICKED') {
        setKickedData({ show: true, message: data.message });
        return;
      }

      if (!res.ok) {
        sessionStorage.removeItem('activeExamToken');
        throw new Error(data.message || data.error || 'Gagal memulai ujian');
      }

      sessionStorage.setItem('activeExamToken', examToken);

      setSessionId(data.session.id);
      setQuestions(data.questions || []);
      setReleaseScoreMode(data.package?.releaseScoreMode || 'langsung');
      
      sync.current?.dispose();
      const engine = new AnswerSync({
        sessionId: data.session.id,
        questionIds: data.questions.map((q: any) => q.id),
        existingAnswers: data.existingAnswers || [],
        storage: {
          getItem: key => localStorage.getItem(key),
          setItem: (key, value) => localStorage.setItem(key, value),
          removeItem: key => localStorage.removeItem(key),
        },
        online: () => navigator.onLine,
        canSend: () => deadlineAt.current !== null && performance.now() < deadlineAt.current && !finishedRef.current,
        send: (answer, signal) => fetch(`/api/sessions/${data.session.id}/answer`, {
          method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId: answer.questionId, answerData: answer.answerData, version: answer.version, mutationId: answer.mutationId }),
        }),
        onChange: snapshot => {
          const loaded: Record<number, any> = {};
          data.questions.forEach((q: any, index: number) => {
            if (Object.hasOwn(snapshot.answers, q.id)) loaded[index + 1] = snapshot.answers[q.id];
          });
          setAnswers(loaded);
          setSyncStatus(snapshot);
        },
        onClosed: session => finishResult.current(session, true),
        onAuthError: message => setKickedData({ show: true, message }),
      });
      sync.current = engine;

      const remaining = Math.max(0, Number(data.remainingSeconds) || 0);
      deadlineAt.current = performance.now() + remaining * 1000;
      setTimeLeft(remaining);

      setHasEnteredToken(true);
      if (data.session.status === 'selesai') {
        finishedRef.current = true;
        if (engine.snapshot().pendingCount) toast.error('Waktu ujian telah berakhir. Jawaban offline yang belum diterima server tidak dinilai.', { duration: 8000 });
        engine.complete();
        sessionStorage.removeItem('activeExamToken');
        setFinalScore(data.session.totalScore === null ? null : Number(data.session.totalScore));
        setIsFinished(true);
      } else engine.wake();
    } catch (err: any) {
      if (attempt === startAttempt.current) setErrorMsg(err.message);
    } finally {
      if (attempt === startAttempt.current) setIsLoading(false);
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

  const handleFinishExam = async (expired = false) => {
    if (!sessionId || submittingRef.current || finishedRef.current) return;
    if (!navigator.onLine) {
      if (!expired) toast.error('Koneksi terputus. Hubungkan kembali untuk memastikan hasil ujian.');
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (!expired) {
        const snapshot = await sync.current?.flush();
        if (finishedRef.current) return;
        expired = deadlineAt.current !== null && performance.now() >= deadlineAt.current;
        if (!expired && (!snapshot || snapshot.pendingCount > 0 || snapshot.recoveryError)) {
          toast.error('Masih ada jawaban yang belum dikonfirmasi. Periksa status penyimpanan dan coba kembali.');
          return;
        }
      }
      const res = await fetch(`/api/sessions/${sessionId}/finish`, { 
        method: 'POST',
          signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': user?.activeToken || '',
          'x-student-id': user?.id || ''
        },
        body: JSON.stringify({
          expectedAnswers: sync.current?.manifest() || []
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
        acceptFinishedSession(data, expired);
      } else {
        const data = await res.json();
        toast.error(data.message || 'Gagal mengakhiri sesi ujian.');
      }
    } catch (error) {
      console.error(error);
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  finishHandler.current = handleFinishExam;
  finishResult.current = acceptFinishedSession;

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
          <p className="mb-6">Hasil dihitung dari jawaban yang telah diterima server sebelum ujian ditutup.</p>
          
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
                  type="radio" disabled={isSubmitting || timeLeft === 0}
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
                    type="checkbox" disabled={isSubmitting || timeLeft === 0}
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
                      type="radio" disabled={isSubmitting || timeLeft === 0}
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
                      type="radio" disabled={isSubmitting || timeLeft === 0}
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

        <div role="status" aria-live="polite" style={{ padding: '10px 24px', background: pendingSyncCount ? '#fff7ed' : '#f0fdf4', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          {!isOnline ? <WifiOff size={18} /> : syncStatus?.sending ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          <span>{!isOnline ? 'Koneksi terputus. ' : ''}{pendingSyncCount ? `${pendingSyncCount} jawaban belum dikonfirmasi server.` : answeredCount ? 'Semua perubahan jawaban telah dikonfirmasi server.' : 'Belum ada jawaban yang perlu dikirim.'} Jawaban harus diterima sebelum waktu ujian habis.</span>
          {Object.values(syncStatus?.pending || {}).some(record => record.retryable) && <button className="btn-secondary" disabled={!isOnline || isSubmitting || timeLeft === 0} onClick={() => sync.current?.retry()}>Coba kirim ulang</button>}
        </div>
        {syncStatus?.storageWarning && <div role="alert" style={{ padding: '10px 24px', background: '#fee2e2', color: '#991b1b' }}>{syncStatus.storageWarning}</div>}

        {/* Question Area */}
        <main style={{ flex: 1, padding: '3rem', overflowY: 'auto' }}>
          <div className="glass-panel p-8" style={{ maxWidth: '800px', margin: '0 auto', background: 'rgba(255,255,255,0.9)' }}>
            {renderQuestion()}
            {(() => {
              const id = questions[currentQuestion - 1]?.id;
              const state = syncStatus?.states[id] || 'unanswered';
              const pending = syncStatus?.pending[id];
              const labels = { unanswered: 'Belum dijawab', saved: 'Tersimpan di server', pending: isOnline ? 'Menunggu pengiriman' : 'Menunggu koneksi', sending: 'Menyimpan...', retry: 'Menunggu kirim ulang', failed: 'Gagal disimpan — perlu tindakan', conflict: 'Ada perbedaan dengan jawaban server' };
              return <div role="status" style={{ marginTop: '1rem', padding: '0.75rem', background: ['failed', 'conflict'].includes(state) ? '#fee2e2' : '#f8fafc', borderRadius: '8px' }}>
                <strong>{labels[state]}</strong>
                {pending?.message && <p>{pending.message}</p>}
                {state === 'conflict' && <div className="flex gap-2 mt-2">
                  <button className="btn-secondary" disabled={isSubmitting || timeLeft === 0} onClick={() => sync.current?.resolve(id, 'server')}>Gunakan jawaban server</button>
                  <button className="btn-secondary" disabled={!isOnline || isSubmitting || timeLeft === 0} onClick={async () => {
                    if (await confirmModal({ title: 'Konfirmasi jawaban', message: 'Kirim pilihan yang tampil di halaman ini untuk menggantikan jawaban di server?' })) sync.current?.resolve(id, 'local');
                  }}>Kirim jawaban saya</button>
                </div>}
              </div>;
            })()}

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
              const isAnswered = hasAnswer(answers[qNum]);
              const saveState = syncStatus?.states[questions[i]?.id] || 'unanswered';
              const saveProblem = ['failed', 'conflict'].includes(saveState);
              const unsynced = !['saved', 'unanswered'].includes(saveState);
              const isCurrent = currentQuestion === qNum;
              
              return (
                <button
                  key={qNum}
                  title={`Soal ${qNum}: ${saveState === 'saved' ? 'tersimpan' : saveProblem ? 'perlu tindakan' : unsynced ? 'belum tersimpan' : 'belum dijawab'}`}
                  onClick={() => setCurrentQuestion(qNum)}
                  style={{
                    aspectRatio: '1',
                    borderRadius: '8px',
                    border: isCurrent ? '2px solid var(--primary-color)' : isAnswered ? '1px solid var(--primary-color)' : '1px solid #cbd5e1',
                    background: saveProblem ? '#b91c1c' : unsynced ? '#b45309' : isAnswered ? 'var(--primary-color)' : 'white',
                    color: isAnswered || unsynced ? 'white' : 'var(--text-main)',
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

          <p style={{ marginTop: '1rem', fontSize: '0.85rem' }}>Oranye: belum dikonfirmasi server. Merah: perlu tindakan.</p>
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-2" style={{ fontSize: '0.85rem' }}>
              <div style={{ width: '16px', height: '16px', background: 'var(--primary-color)', borderRadius: '4px' }}></div>
              <span>Sudah Dijawab ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2" style={{ fontSize: '0.85rem' }}>
              <div style={{ width: '16px', height: '16px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px' }}></div>
              <span>Belum Dijawab ({totalQuestions - answeredCount})</span>
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
