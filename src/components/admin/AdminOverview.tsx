import {
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardList,
  LayoutGrid,
  Users,
} from "lucide-react";
import { useRemoteData } from "../../lib/useRemoteData";
import { usePagedList } from "../../lib/paging";
import { StatusBadge } from "../TableFrame";
import { AdminError, AdminPanel } from "./AdminUI";

type Overview = {
  totalUsers: number;
  students: number;
  teachers: number;
  packages: number;
};
const valid = (value: Overview) =>
  !!value &&
  ["totalUsers", "students", "teachers", "packages"].every(
    (key) =>
      Number.isFinite(value[key as keyof Overview]) &&
      value[key as keyof Overview] >= 0,
  );
export function AdminOverview({
  onNavigate,
}: {
  onNavigate: (tab: string) => void;
}) {
  const summary = useRemoteData<Overview>("/api/overview", valid);
  const packages = usePagedList<any>("/api/packages", 1, 5, {
    sort: "name_asc",
  });
  const stats = [
    ["Total pengguna", "totalUsers", "Seluruh akun terdaftar", Users],
    ["Total siswa", "students", "Akun siswa di seluruh sekolah", Building2],
    ["Guru penulis", "teachers", "Pengelola bank soal", BookOpen],
    ["Paket try out", "packages", "Seluruh status paket", ClipboardList],
  ] as const;
  return (
    <>
      {summary.error && (
        <AdminError message={summary.error} retry={summary.retry} />
      )}
      {!summary.data && !summary.error && (
        <p className="admin-loading" role="status">
          Memuat ringkasan...
        </p>
      )}
      <div className="admin-stats" aria-label="Ringkasan sistem">
        {stats.map(([label, key, note, Icon]) => (
          <div className="admin-stat" key={key}>
            <div>
              <p>{label}</p>
              <strong data-stat={key}>
                {summary.data ? summary.data[key].toLocaleString("id-ID") : "—"}
              </strong>
              <small>{note}</small>
            </div>
            <span className="admin-stat-icon">
              <Icon size={18} aria-hidden="true" />
            </span>
          </div>
        ))}
      </div>
      <AdminPanel
        title="Akses cepat"
        description="Lanjutkan pengelolaan try out Anda."
      >
        <div className="admin-quick-grid">
          {[
            [
              "accounts",
              "Manajemen akun",
              "Kelola peran dan identitas pengguna.",
              Users,
            ],
            [
              "packages",
              "Paket try out",
              "Susun soal dan atur pelaksanaan.",
              ClipboardList,
            ],
            [
              "results",
              "Analitik hasil",
              "Lihat capaian siswa per paket.",
              LayoutGrid,
            ],
          ].map(([id, title, description, Icon]: any) => (
            <button
              type="button"
              className="admin-quick"
              key={id}
              onClick={() => onNavigate(id)}
            >
              <span className="admin-stat-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      </AdminPanel>
      <div className="admin-overview-columns">
        <AdminPanel
          title="Paket try out"
          description="Paket yang sudah tersedia di sistem."
          actions={
            <button
              className="btn-secondary"
              onClick={() => onNavigate("packages")}
            >
              Lihat semua
              <ArrowRight size={14} />
            </button>
          }
        >
          {packages.error ? (
            <AdminError
              message={packages.error}
              retry={() => void packages.reload()}
            />
          ) : packages.loading ? (
            <p className="admin-loading" role="status">
              Memuat paket...
            </p>
          ) : !packages.items.length ? (
            <div className="admin-empty">
              <ClipboardList size={24} />
              <h3>Belum ada paket try out</h3>
              <p>Mulai dengan menyiapkan soal dan membuat paket ujian.</p>
            </div>
          ) : (
            packages.items.map((pkg) => (
              <div className="admin-line" key={pkg.id}>
                <div>
                  <strong>{pkg.name}</strong>
                  <small>
                    {pkg.mapel} · {pkg._count?.questions || 0} soal ·{" "}
                    {pkg.durationMinutes} menit
                  </small>
                </div>
                <StatusBadge
                  value={pkg.status === "aktif" ? "Aktif" : pkg.status}
                />
              </div>
            ))
          )}
        </AdminPanel>
        <AdminPanel
          title="Alur persiapan"
          description="Periksa kebutuhan sebelum membuka ujian."
        >
          {[
            [
              "01",
              "Daftarkan sekolah & akun",
              "Pastikan identitas peserta sudah lengkap.",
            ],
            [
              "02",
              "Siapkan bank soal",
              "Periksa isi, gambar, dan kunci jawaban.",
            ],
            [
              "03",
              "Susun dan aktifkan paket",
              "Tentukan durasi lalu bagikan token.",
            ],
          ].map(([n, title, desc]) => (
            <div className="admin-line" key={n}>
              <span className="admin-step-number">{n}</span>
              <div>
                <strong>{title}</strong>
                <small>{desc}</small>
              </div>
            </div>
          ))}
        </AdminPanel>
      </div>
    </>
  );
}
