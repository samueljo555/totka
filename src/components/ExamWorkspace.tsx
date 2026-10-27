import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Building2, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Flag, Grid2X2, Info, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { useConfirm } from '../contexts/ConfirmContext';
import type { SyncSnapshot } from '../lib/answer-sync';
import { ExamQuestion } from './ExamQuestion';
import { questionKind, questionTypeLabel } from '../lib/exam-display';
import type { ExamQuestionData } from '../lib/exam-display';
import { ExamDialog } from './ExamDialog';
import '../exam-design.css';

interface Props {
  sessionId: string; user: any; exam: { name?: string; mapel?: string; durationMinutes?: number };
  questions: ExamQuestionData[]; current: number; answers: Record<number, unknown>; answeredCount: number;
  remaining: number; online: boolean; submitting: boolean; snapshot: SyncSnapshot | null;
  onNavigate: (number: number) => void; onAnswer: (number: number, value: unknown) => void;
  onRetry: () => void; onResolve: (id: string, choice: 'server' | 'local') => void; onFinish: () => Promise<void>; onImage: (url: string) => void;
}
const hasAnswer = (value: unknown) => typeof value === 'number' || Array.isArray(value) && value.some(part => part !== null && part !== undefined);

export function ExamWorkspace(props: Props) {
  const { sessionId, user, exam, questions, current, answers, answeredCount, remaining, online, submitting, snapshot, onNavigate, onAnswer, onRetry, onResolve, onFinish, onImage } = props;
  const confirm = useConfirm();
  const reviewKey = `tka_exam_review_v1_${sessionId}`;
  const [review, setReview] = useState<Set<string>>(() => {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(reviewKey) || '[]');
      return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && questions.some(q => q.id === id)) : []);
    } catch { return new Set(); }
  });
  const [reviewWarning, setReviewWarning] = useState(false);
  const [fontSize, setFontSize] = useState(17), [drawer, setDrawer] = useState(false), [finish, setFinish] = useState(false);
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    try { sessionStorage.setItem(reviewKey, JSON.stringify([...review])); setReviewWarning(false); }
    catch { setReviewWarning(true); }
  }, [review, reviewKey]);
  const question = questions[current - 1], total = questions.length, pendingCount = snapshot?.pendingCount || 0;
  const state = question ? snapshot?.states[question.id] || 'unanswered' : 'unanswered';
  const pending = question ? snapshot?.pending[question.id] : undefined;
  const problem = state === 'failed' || state === 'conflict';
  const unsaved = !['saved', 'unanswered'].includes(state);
  const blocked = !online || !snapshot || pendingCount > 0 || !!snapshot.recoveryError || remaining === 0;
  const labels = { unanswered: 'Belum ada jawaban pada soal ini.', saved: 'Jawaban telah diterima server.', pending: online ? 'Menunggu pengiriman jawaban.' : 'Jawaban menunggu koneksi kembali.', sending: 'Mengirim jawaban...', retry: 'Menunggu pengiriman ulang.', failed: 'Jawaban gagal dikirim. Perlu tindakan.', conflict: 'Ada perbedaan dengan jawaban di server.' };
  const partial = questions.filter((q, i) => questionKind(q) === 'category' && hasAnswer(answers[i + 1]) && (Array.isArray(q.options) ? q.options : []).some((_, j) => ![0, 1].includes((answers[i + 1] as number[])[j]!))).length;
  const navigate = (number: number) => {
    if (number < 1 || number > total) return;
    onNavigate(number); setDrawer(false);
    requestAnimationFrame(() => { card.current?.focus({ preventScroll: true }); card.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); });
  };
  const openFinish = () => { setDrawer(false); setFinish(true); };
  const badge = (number: number) => {
    const q = questions[number - 1]!, save = snapshot?.states[q.id] || 'unanswered';
    const savedProblem = ['failed', 'conflict'].includes(save), unsent = !['saved', 'unanswered'].includes(save);
    const description = `Soal ${number}: ${number === current ? 'sedang dibuka, ' : ''}${hasAnswer(answers[number]) ? 'terjawab' : 'belum dijawab'}${review.has(q.id) ? ', ditandai' : ''}${savedProblem ? ', perlu tindakan' : unsent ? ', belum terkirim' : save === 'saved' ? ', diterima server' : ''}`;
    return <button type="button" key={q.id} title={description} aria-label={description} aria-current={number === current ? 'step' : undefined}
      className={`exam-number${hasAnswer(answers[number]) ? ' answered' : ''}${number === current ? ' current' : ''}${review.has(q.id) ? ' flagged' : ''}${unsent ? ' unsent' : ''}${savedProblem ? ' problem' : ''}`} onClick={() => navigate(number)}>{String(number).padStart(2, '0')}</button>;
  };
  const syncCard = <div className={`exam-sync-card${!online || pendingCount ? ' pending' : ''}${snapshot?.recoveryError ? ' error' : ''}`} role="status" aria-live="polite">
    {!online ? <WifiOff size={17} /> : snapshot?.sending ? <RefreshCw size={17} className="exam-spinning" /> : <ShieldCheck size={17} />}
    <div><strong>{snapshot?.recoveryError ? 'Penyimpanan perlu diperiksa' : pendingCount ? `${pendingCount} jawaban belum dikonfirmasi` : answeredCount ? 'Jawaban telah terkirim' : 'Belum ada jawaban untuk dikirim'}</strong>
      <p>{!online ? 'Koneksi terputus. Jangan tutup halaman. ' : ''}{pendingCount ? 'Periksa pengiriman sebelum menyelesaikan ujian. ' : answeredCount ? 'Semua perubahan jawaban telah dikonfirmasi server. ' : ''}Jawaban harus diterima sebelum waktu habis.</p>
      {Object.values(snapshot?.pending || {}).some(record => record.retryable) && <button type="button" disabled={!online || submitting || remaining === 0} onClick={onRetry}>Coba kirim ulang</button>}
    </div>
  </div>;
  const panel = <>
    <section className="exam-student-card" aria-label="Identitas peserta ujian"><div className="exam-student-identity"><span className="exam-avatar" aria-hidden="true">{(user?.fullName || 'Siswa').split(' ').filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('')}</span><div><h2>{user?.fullName || 'Nama belum tersedia'}</h2><p>NISN {user?.nisn || 'belum tersedia'} · Kelas {user?.className || '—'}</p></div></div><p className="exam-student-school"><Building2 size={14} />{user?.school?.name || 'Sekolah belum tersedia'}</p></section>
    <section className="exam-navigation-card"><div className="exam-nav-heading"><h2>Daftar soal</h2><span>{total} soal</span></div><div className="exam-nav-content"><nav className="exam-number-grid" aria-label="Nomor soal">{questions.map((_, i) => badge(i + 1))}</nav>
      <div className="exam-legend"><span><i className="current" />Sedang dibuka</span><span><i className="answered" />Terjawab</span><span><i />Belum dijawab</span><span><i className="flagged" />Ditandai</span><span><i className="unsent" />Belum terkirim</span><span><i className="problem" />Perlu tindakan</span></div>
      <div className="exam-answer-summary"><div><strong>{answeredCount}</strong><small>Terjawab</small></div><div><strong>{Math.max(0, total - answeredCount)}</strong><small>Belum dijawab</small></div><div><strong>{review.size}</strong><small>Ditandai</small></div></div>
    </div></section>
    {syncCard}<p className={`exam-network${online ? '' : ' offline'}`}><i />{online ? 'Terhubung' : 'Koneksi terputus'}</p>
    <button type="button" className="exam-btn" disabled={submitting || !total} onClick={openFinish}><Check size={15} />Periksa & selesaikan</button>
  </>;
  return <div className="exam-workspace" style={{ '--exam-font-size': `${fontSize}px`, '--exam-font-scale': fontSize / 17 } as CSSProperties}>
    <header className="exam-topbar"><div className="exam-top-inner"><div className="exam-brand-area"><div className="exam-brand"><b>t</b><span>TOTKA</span></div><i /><div><h1>{exam.name || 'Try Out TKA'}</h1><p>{exam.mapel || 'Ujian'} · {total} soal{exam.durationMinutes ? ` · ${exam.durationMinutes} menit` : ''}</p></div></div><div className="exam-header-actions">
      <div className={`exam-timer${remaining < 300 ? ' urgent' : ''}`} aria-label="Sisa waktu ujian"><Clock size={19} /><div><small>Sisa waktu</small><strong>{[Math.floor(remaining / 3600), Math.floor(remaining % 3600 / 60), remaining % 60].map(value => String(value).padStart(2, '0')).join(':')}</strong></div></div>
      <button className="exam-btn exam-header-finish" disabled={submitting || !total} onClick={openFinish}><Check size={15} />Selesai ujian</button>
    </div></div></header>
    <main className="exam-layout"><div className="exam-breadcrumb">Ruang ujian <i />{exam.mapel || 'Try Out TKA'}</div><div className="exam-columns"><section className="exam-main" aria-label="Lembar soal">
      <div className="exam-progress-strip"><span><strong>{answeredCount}</strong> dari {total} soal terjawab</span><div className="exam-progress-track" role="progressbar" aria-label="Progres jawaban" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answeredCount}><div style={{ width: `${total ? answeredCount / total * 100 : 0}%` }} /></div><button type="button" className="exam-btn exam-open-nav" aria-haspopup="dialog" aria-expanded={drawer} onClick={() => setDrawer(true)}><Grid2X2 size={15} />Daftar soal</button></div>
      {(!online || remaining < 300 || snapshot?.recoveryError) && <div className="exam-notice" role="status"><Info size={16} /><span>{remaining === 0 ? 'Waktu ujian telah habis. Jawaban dikunci; sistem akan memastikan hasil ketika terhubung.' : !online ? 'Koneksi terputus. Jangan tutup halaman. Jawaban yang belum terkirim harus diterima sebelum waktu habis.' : snapshot?.recoveryError ? 'Penyimpanan jawaban perlu diperiksa. Baca pesan di bawah sebelum melanjutkan.' : 'Waktu tersisa kurang dari 5 menit. Periksa kembali jawaban dan status pengirimannya.'}</span></div>}
      {snapshot?.storageWarning && <p className="exam-storage-warning" role="alert">{snapshot.storageWarning}</p>}
      <article className="exam-question-card" ref={card} tabIndex={-1} aria-label={`Soal ${current}`}><div className="exam-question-top"><div className="exam-question-heading"><h2>Soal {String(current).padStart(2, '0')} <span>/ {total}</span></h2><span className="exam-type-tag">{questionTypeLabel(question)}</span></div><div className="exam-font-tools"><span>Ukuran teks</span><button aria-label="Perkecil teks" disabled={fontSize === 15} onClick={() => setFontSize(value => Math.max(15, value - 1))}>A−</button><button aria-label="Perbesar teks" disabled={fontSize === 22} onClick={() => setFontSize(value => Math.min(22, value + 1))}>A+</button></div></div>
        <div className="exam-question-body">{question ? <ExamQuestion question={question} number={current} answer={answers[current]} disabled={submitting || remaining === 0} onAnswer={value => onAnswer(current, value)} onImage={onImage} /> : <p role="status">Soal ujian belum tersedia. Hubungi operator.</p>}
          <div className={`exam-save-status${problem ? ' error' : state === 'saved' ? ' saved' : unsaved ? ' pending' : ''}`} role="status" aria-live="polite">{state === 'saved' ? <CheckCircle2 size={15} /> : unsaved && !problem ? <RefreshCw size={15} /> : <Info size={15} />}<div><strong>{labels[state]}</strong>{pending?.message && <p>{pending.message}</p>}
            {state === 'conflict' && question && <div className="exam-conflict-actions"><button className="exam-btn" disabled={submitting || remaining === 0} onClick={() => onResolve(question.id, 'server')}>Gunakan jawaban server</button><button className="exam-btn" disabled={!online || submitting || remaining === 0} onClick={async () => { if (await confirm({ title: 'Konfirmasi jawaban', message: 'Kirim pilihan yang tampil di halaman ini untuk menggantikan jawaban di server?' })) onResolve(question.id, 'local'); }}>Kirim jawaban saya</button></div>}
          </div></div>
        </div>
        <footer className="exam-question-footer"><button className="exam-btn" disabled={current <= 1 || submitting} onClick={() => navigate(current - 1)}><ChevronLeft size={15} />Sebelumnya</button><button className={`exam-review${question && review.has(question.id) ? ' active' : ''}`} aria-pressed={!!question && review.has(question.id)} disabled={!question} onClick={() => { if (question) setReview(old => { const next = new Set(old); if (next.has(question.id)) next.delete(question.id); else next.add(question.id); return next; }); }}><Flag size={14} />{question && review.has(question.id) ? 'Ditandai untuk ditinjau' : 'Tandai untuk ditinjau'}</button><button className="exam-btn primary" disabled={!total || submitting} onClick={() => current < total ? navigate(current + 1) : openFinish()}>{current < total ? 'Selanjutnya' : 'Periksa & selesaikan'}{current < total ? <ChevronRight size={15} /> : <Check size={15} />}</button></footer>
      </article><div className="exam-hint"><span><ShieldCheck size={13} />Pilihan jawaban dapat diubah sebelum waktu habis dan ujian selesai.</span><span>Soal {current} dari {total}</span></div>
      {reviewWarning && <p className="exam-local-note" role="status">Penanda tinjau belum dapat disimpan di tab ini. Jawaban tetap memakai status penyimpanan di atas.</p>}
    </section><aside className="exam-sidebar" aria-label="Informasi peserta dan navigasi soal">{panel}</aside></div></main>
    <ExamDialog open={drawer} title="Navigasi ujian" className="exam-drawer" onClose={() => setDrawer(false)}>{panel}</ExamDialog>
    <ExamDialog open={finish} title="Sudah selesai mengerjakan?" busy={submitting} onClose={() => setFinish(false)}>
      <p>Periksa kembali ringkasan jawaban sebelum menyelesaikan ujian.</p><div className="exam-dialog-stats"><div><strong>{answeredCount}</strong><small>Terjawab</small></div><div><strong>{Math.max(0, total - answeredCount)}</strong><small>Belum dijawab</small></div><div><strong>{review.size}</strong><small>Ditandai</small></div></div>
      {partial > 0 && <p className="exam-dialog-note warning">Ada {partial} soal Benar / Salah yang baru dijawab sebagian. Periksa setiap pernyataan.</p>}
      <p className={`exam-dialog-note${blocked ? ' warning' : ''}`}>{blocked ? 'Masih ada jawaban yang belum dikonfirmasi, koneksi terputus, atau waktu telah habis. Kembali ke soal dan periksa status penyimpanan.' : 'Jawaban telah dikonfirmasi server. Pastikan soal yang kosong atau ditandai sudah diperiksa.'}</p>
      <p>Setelah ujian diselesaikan, jawaban tidak dapat diubah lagi.</p><div className="exam-dialog-actions"><button className="exam-btn" disabled={submitting} onClick={() => setFinish(false)}>Periksa kembali</button><button className="exam-btn primary" disabled={blocked || submitting} onClick={() => void onFinish()}>{submitting ? 'Menyelesaikan...' : 'Selesai ujian'}</button></div>
    </ExamDialog>
  </div>;
}
