import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Info,
  LoaderCircle,
  UserRound,
  WifiOff,
} from "lucide-react";
import { WorkspaceShell } from "../WorkspaceShell";
import { StudentIdentity } from "./StudentIdentity";

interface Props {
  user: any;
  token: string;
  onToken: (token: string) => void;
  onStart: () => void;
  loading: boolean;
  error: string;
  online: boolean;
  onExit: () => void;
}
export function StudentHome({
  user,
  token,
  onToken,
  onStart,
  loading,
  error,
  online,
  onExit,
}: Props) {
  const [view, setView] = useState("start");
  return (
    <WorkspaceShell
      user={user}
      roleLabel="Siswa"
      items={[
        { id: "start", name: "Mulai Try Out", icon: <BookOpen /> },
        { id: "profile", name: "Profil Siswa", icon: <UserRound /> },
      ]}
      activeId={view}
      onNavigate={(next) => {
        setView(next);
        window.scrollTo(0, 0);
      }}
      onLogout={onExit}
      description={
        view === "profile"
          ? "Periksa identitas yang digunakan pada pelaksanaan try out."
          : "Siapkan diri dan masukkan token yang diberikan operator sekolah."
      }
    >
      <div className="student-ui">
        {view === "profile" ? (
          <div className="student-profile">
            <StudentIdentity user={user} heading="Profil peserta" />
          </div>
        ) : (
          <>
            <div className="student-greeting">
              <div>
                <p className="student-eyebrow">Selamat datang</p>
                <h2>Halo, {user?.fullName || "Siswa"}.</h2>
                <p>
                  Periksa identitasmu, lalu bersiap mengerjakan try out dengan
                  tenang.
                </p>
              </div>
              <span className="student-greeting-icon">
                <BookOpen size={30} aria-hidden="true" />
              </span>
            </div>
            <div className="student-start-columns">
              <section className="student-panel student-token-panel">
                <div className="student-panel-heading">
                  <div>
                    <h2>Mulai Ujian</h2>
                    <p>Token paket diberikan oleh operator sekolah.</p>
                  </div>
                  <BookOpen size={18} aria-hidden="true" />
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    onStart();
                  }}
                  aria-busy={loading}
                >
                  {error && (
                    <div className="student-error" role="alert">
                      <AlertCircle size={16} aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}
                  {!online && (
                    <div className="student-notice" role="status">
                      <WifiOff size={16} aria-hidden="true" />
                      <span>
                        Koneksi terputus. Hubungkan kembali untuk memulai atau
                        melanjutkan ujian.
                      </span>
                    </div>
                  )}
                  <label
                    className="student-token-label"
                    htmlFor="student-exam-token"
                  >
                    Token Ujian
                  </label>
                  <input
                    id="student-exam-token"
                    className="student-token-input"
                    value={token}
                    onChange={(e) => onToken(e.target.value)}
                    placeholder="Masukkan Token"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    minLength={3}
                    disabled={loading}
                    aria-invalid={error ? true : undefined}
                    aria-describedby="student-token-help"
                  />
                  <p id="student-token-help" className="student-token-help">
                    <Info size={14} aria-hidden="true" />
                    Masukkan token persis seperti yang diberikan, termasuk huruf
                    besar/kecil.
                  </p>
                  <button
                    type="submit"
                    className="btn student-start-button"
                    disabled={loading || !online}
                  >
                    {loading ? (
                      <>
                        <LoaderCircle
                          size={16}
                          className="student-spinner"
                          aria-hidden="true"
                        />
                        Memproses...
                      </>
                    ) : (
                      <>
                        Mulai Kerjakan
                        <ArrowRight size={16} aria-hidden="true" />
                      </>
                    )}
                  </button>
                  <p className="student-token-footnote">
                    Waktu ujian mulai berjalan setelah token berhasil diproses.
                    Sesi yang masih aktif dilanjutkan dengan sisa waktunya.
                  </p>
                </form>
              </section>
              <StudentIdentity user={user} />
            </div>
            <section className="student-panel student-instructions">
              <div className="student-panel-heading">
                <h2>Sebelum mulai</h2>
              </div>
              <div className="student-instruction-grid">
                {[
                  [
                    "01",
                    "Periksa identitas",
                    "Pastikan nama, NISN, kelas, dan sekolah sudah sesuai.",
                  ],
                  [
                    "02",
                    "Siapkan koneksi",
                    "Gunakan perangkat dan koneksi internet yang stabil.",
                  ],
                  [
                    "03",
                    "Baca petunjuk",
                    "Perhatikan durasi dan petunjuk pada setiap tipe soal.",
                  ],
                ].map(([number, title, text]) => (
                  <div className="student-instruction" key={number}>
                    <b>{number}</b>
                    <div>
                      <strong>{title}</strong>
                      <p>{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
