import { Building2, UserRound } from "lucide-react";

export function StudentIdentity({
  user,
  heading = "Identitas peserta",
}: {
  user: any;
  heading?: string;
}) {
  const name = user?.fullName || "Nama belum tersedia";
  return (
    <section className="student-panel student-identity" aria-label={heading}>
      <div className="student-panel-heading">
        <h2>{heading}</h2>
        <UserRound size={17} aria-hidden="true" />
      </div>
      <div className="student-identity-person">
        <span className="student-avatar" aria-hidden="true">
          {name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part: string) => part[0])
            .join("")}
        </span>
        <div>
          <strong>{name}</strong>
          <small>Peserta try out TKA</small>
        </div>
      </div>
      <dl className="student-details">
        <dt>NISN</dt>
        <dd className="student-mono">{user?.nisn || "Belum tersedia"}</dd>
        <dt>Kelas</dt>
        <dd>{user?.className || "Belum tersedia"}</dd>
        <dt>Sekolah</dt>
        <dd>{user?.school?.name || "Belum tersedia"}</dd>
        {(user?.school?.npsn || user?.schoolNpsn) && (
          <>
            <dt>NPSN</dt>
            <dd className="student-mono">
              {user?.school?.npsn || user?.schoolNpsn}
            </dd>
          </>
        )}
      </dl>
      <p className="student-identity-help">
        <Building2 size={14} aria-hidden="true" />
        Jika identitas belum sesuai, hubungi operator sekolah sebelum memulai
        ujian.
      </p>
    </section>
  );
}
