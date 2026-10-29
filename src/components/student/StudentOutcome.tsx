import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { Brand } from "../Brand";

function OutcomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="student-ui student-outcome-screen">
      <header className="student-outcome-header">
        <Brand />
        <span>Workspace siswa</span>
      </header>
      <main className="student-outcome-main">{children}</main>
      <footer className="student-outcome-footer">
        © {new Date().getFullYear()} TOTKA JU1 · Try Out TKA Jakarta Utara I
      </footer>
    </div>
  );
}
export function StudentResult({
  user,
  exam,
  score,
  release,
  onExit,
}: {
  user: any;
  exam: { name?: string; mapel?: string };
  score: number | null;
  release: string;
  onExit: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    title.current?.focus({ preventScroll: true });
  }, []);
  return (
    <OutcomeLayout>
      <section className="student-panel student-result-card">
        <span className="student-outcome-icon">
          <CheckCircle2 size={32} aria-hidden="true" />
        </span>
        <p className="student-eyebrow">{exam.name || "Try Out TKA"}</p>
        <h1 tabIndex={-1} ref={title}>
          Ujian Selesai!
        </h1>
        <p className="student-outcome-description">
          Terima kasih sudah mengerjakan dengan sungguh-sungguh. Hasil dihitung
          dari jawaban yang diterima sebelum ujian ditutup.
        </p>
        <span className="student-completed-badge">Selesai</span>
        <div className="student-result-score" aria-label="Hasil ujian">
          {release !== "langsung" ? (
            <>
              <h2>Menunggu Rilis</h2>
              <p>Nilai akan diumumkan kemudian oleh penyelenggara.</p>
            </>
          ) : score === null ? (
            <>
              <h2>Nilai belum tersedia</h2>
              <p>
                Ujian sudah selesai. Hubungi operator sekolah untuk memeriksa
                hasilnya.
              </p>
            </>
          ) : (
            <>
              <strong className="student-score-value">
                {score.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                <span> / 100</span>
              </strong>
              <p>Skor akhir try out</p>
            </>
          )}
        </div>
        <dl className="student-details student-result-identity">
          <dt>Nama peserta</dt>
          <dd>{user?.fullName || "Belum tersedia"}</dd>
          <dt>NISN</dt>
          <dd className="student-mono">{user?.nisn || "Belum tersedia"}</dd>
          <dt>Kelas</dt>
          <dd>{user?.className || "Belum tersedia"}</dd>
          <dt>Sekolah</dt>
          <dd>{user?.school?.name || "Belum tersedia"}</dd>
        </dl>
        <button className="student-primary-button" onClick={onExit}>
          Kembali ke Beranda
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </section>
    </OutcomeLayout>
  );
}
export function StudentSessionEnded({
  message,
  onExit,
}: {
  message?: string;
  onExit: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    title.current?.focus({ preventScroll: true });
  }, []);
  return (
    <OutcomeLayout>
      <section className="student-panel student-result-card student-session-ended">
        <span className="student-outcome-icon">
          <ShieldAlert size={32} aria-hidden="true" />
        </span>
        <p className="student-eyebrow">Sesi login</p>
        <h1 ref={title} tabIndex={-1}>
          Sesi Ujian Dinonaktifkan
        </h1>
        <p className="student-outcome-description" role="alert">
          {message ||
            "Sesi login tidak aktif. Silakan masuk kembali menggunakan akun Anda."}
        </p>
        <div className="student-notice">
          Jawaban yang sudah diterima server tetap tersimpan. Hubungi operator
          sekolah jika membutuhkan bantuan untuk melanjutkan.
        </div>
        <button className="student-primary-button" onClick={onExit}>
          Kembali ke Beranda
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </section>
    </OutcomeLayout>
  );
}
