import toast from 'react-hot-toast';
import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { AnswerSync } from '../lib/answer-sync';
import type { SyncSnapshot } from '../lib/answer-sync';
import { ImageModal } from '../components/ImageModal';
import { ExamWorkspace } from '../components/ExamWorkspace';
import 'katex/dist/katex.min.css';

const SiswaDashboard = ({ user, onLogout }: { user?: any, onLogout: () => void }) => {
  const [hasEnteredToken, setHasEnteredToken] = useState(false);
  const [token, setToken] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Engine State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [questions, setQuestions] = useState<any[]>([]);
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
  const [examInfo, setExamInfo] = useState<{ name?: string; mapel?: string; durationMinutes?: number }>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Offline & Auto-Sync State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncSnapshot | null>(null);

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
    try { if (sessionId) sessionStorage.removeItem(`tka_exam_review_v1_${sessionId}`); } catch { /* Optional review marks cannot block finalization. */ }
    sync.current?.complete();
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
      setExamInfo(data.package || {});
      setCurrentQuestion(1);
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
        try { sessionStorage.removeItem(`tka_exam_review_v1_${data.session.id}`); } catch { /* Optional review marks cannot block finalization. */ }
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

  return (
    <>
      {!kickedData && <ExamWorkspace key={sessionId} sessionId={sessionId!} user={user} exam={examInfo}
        questions={questions} current={currentQuestion} answers={answers} answeredCount={answeredCount}
        remaining={timeLeft} online={isOnline} submitting={isSubmitting} snapshot={syncStatus}
        onNavigate={setCurrentQuestion} onAnswer={handleAnswer} onRetry={() => sync.current?.retry()}
        onResolve={(id, choice) => sync.current?.resolve(id, choice)} onFinish={() => handleFinishExam()}
        onImage={setPreviewImage} />}

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
    </>
  );
};

export default SiswaDashboard;
