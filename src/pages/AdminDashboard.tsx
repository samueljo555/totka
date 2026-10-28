import { useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  ClipboardList,
  Edit3,
  LineChart,
  Plus,
  Settings,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { useConfirm } from "../contexts/ConfirmContext";
import { AnalyticsReports } from "../components/ReportTable";
import {
  TableFrame,
  StatusBadge,
  SortableHeading,
  TableState,
} from "../components/TableFrame";
import { Pagination } from "../components/Pagination";
import { AdminOverview } from "../components/admin/AdminOverview";
import { AdminAccountForm } from "../components/admin/AdminAccountForm";
import { AdminSchoolForm } from "../components/admin/AdminSchoolForm";
import { AdminSchoolImport } from "../components/admin/AdminSchoolImport";
import { AdminPackageForm } from "../components/admin/AdminPackageForm";
import {
  AdminFilters,
  AdminNotice,
  AdminPanel,
} from "../components/admin/AdminUI";
import { useDebounced, usePagedList } from "../lib/paging";
import { adminWrite, roleNames } from "../lib/admin-api";
import "../admin-design.css";
import "katex/dist/katex.min.css";

const descriptions: Record<string, string> = {
  overview: "Kelola persiapan dan pelaksanaan try out dari satu workspace.",
  accounts: "Kelola akses pengguna dengan identitas dan peran yang jelas.",
  schools: "Kelola sekolah peserta dan identitas operatornya.",
  packages: "Susun, periksa, dan aktifkan paket try out.",
  results: "Tinjau capaian siswa, kualitas soal, dan hasil per sekolah.",
  settings: "Pengaturan pelaksanaan tersedia pada masing-masing paket.",
};
function Person({ name, detail }: { name: string; detail?: string }) {
  return (
    <div className="table-person">
      <span className="table-avatar" aria-hidden="true">
        {(name || "?")
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0])
          .join("")}
      </span>
      <div>
        <strong className="table-primary">{name}</strong>
        {detail && <small className="table-secondary">{detail}</small>}
      </div>
    </div>
  );
}

const AdminDashboard = ({
  user,
  onLogout,
}: {
  user?: any;
  onLogout: () => void;
}) => {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState("overview"),
    [search, setSearch] = useState("");
  const query = useDebounced(search);
  const [userSort, setUserSort] = useState("name_asc"),
    [schoolSort, setSchoolSort] = useState("name_asc"),
    [packageSort, setPackageSort] = useState("name_asc");
  const [userRole, setUserRole] = useState(""),
    [packageSubject, setPackageSubject] = useState("");
  const [userPage, setUserPage] = useState(1),
    [schoolPage, setSchoolPage] = useState(1),
    [packagePage, setPackagePage] = useState(1);
  const [usersPerPage, setUsersPerPage] = useState(10),
    [schoolsPerPage, setSchoolsPerPage] = useState(10),
    [packagesPerPage, setPackagesPerPage] = useState(10);
  const [accountForm, setAccountForm] = useState<{
      initial: any | null;
    } | null>(null),
    [schoolForm, setSchoolForm] = useState<{ initial: any | null } | null>(
      null,
    ),
    [importing, setImporting] = useState(false);
  const [packageForm, setPackageForm] = useState<any | null | undefined>(
      undefined,
    ),
    [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const userList = usePagedList<any>(
    "/api/users",
    userPage,
    usersPerPage,
    { search: query, sort: userSort, role: userRole },
    activeTab === "accounts",
  );
  const schoolList = usePagedList<any>(
    "/api/schools",
    schoolPage,
    schoolsPerPage,
    { search: query, sort: schoolSort },
    activeTab === "schools",
  );
  const packageList = usePagedList<any>(
    "/api/packages",
    packagePage,
    packagesPerPage,
    { search: query, sort: packageSort, mapel: packageSubject },
    activeTab === "packages",
  );
  const navigate = (tab: string) => {
    setActiveTab(tab);
    setSearch("");
    setUserPage(1);
    setSchoolPage(1);
    setPackagePage(1);
    setAccountForm(null);
    setSchoolForm(null);
    setImporting(false);
    setPackageForm(undefined);
  };
  const onSearch = (value: string) => {
    setSearch(value);
    setUserPage(1);
    setSchoolPage(1);
    setPackagePage(1);
  };
  const reset = () => {
    onSearch("");
    setUserRole("");
    setPackageSubject("");
    setUserSort("name_asc");
    setSchoolSort("name_asc");
    setPackageSort("name_asc");
  };
  const remove = async (kind: "users" | "schools", record: any) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    try {
      if (
        !(await confirm({
          title: kind === "users" ? "Hapus akun?" : "Hapus sekolah?",
          message:
            kind === "users"
              ? `Yakin ingin menghapus pengguna ${record.fullName}?`
              : `Hapus sekolah ${record.name}?`,
          isDestructive: true,
          confirmText: "Hapus",
        }))
      )
        return;
      await adminWrite(
        `/api/${kind}/${kind === "users" ? record.id : record.npsn}`,
        "DELETE",
      );
      toast.success("Data berhasil dihapus.");
      await (kind === "users" ? userList.reload() : schoolList.reload());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menghapus data.",
      );
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  };
  const changeStatus = async (pkg: any) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    const activate = pkg.status !== "aktif";
    try {
      if (
        !(await confirm({
          title: activate ? "Buka ujian?" : "Tutup ujian?",
          message: activate
            ? "Ubah status paket menjadi AKTIF? Paket yang aktif dapat diakses siswa."
            : "Nonaktifkan paket ujian ini? Siswa tidak akan bisa masuk menggunakan token ini lagi.",
          confirmText: activate ? "Buka ujian" : "Tutup ujian",
        }))
      )
        return;
      await adminWrite(`/api/packages/${pkg.id}`, "PUT", {
        status: activate ? "aktif" : "draft",
      });
      toast.success(
        activate ? "Paket ujian diaktifkan." : "Paket ujian ditutup.",
      );
      await packageList.reload();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Status paket belum berhasil diubah.",
      );
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  };
  const tabs = [
    { id: "overview", name: "Ringkasan", icon: <BarChart3 /> },
    { id: "accounts", name: "Manajemen Akun", icon: <Users /> },
    { id: "schools", name: "Data Sekolah", icon: <Building2 /> },
    { id: "packages", name: "Paket Try Out", icon: <ClipboardList /> },
    { id: "results", name: "Analitik Hasil", icon: <LineChart /> },
    { id: "settings", name: "Pengaturan Ujian", icon: <Settings /> },
  ];
  const actions =
    activeTab === "overview" ? (
      <button className="btn" onClick={() => navigate("packages")}>
        <ClipboardList size={15} />
        Kelola paket
      </button>
    ) : activeTab === "accounts" ? (
      <button className="btn" onClick={() => setAccountForm({ initial: null })}>
        <Plus size={15} />
        Tambah Akun
      </button>
    ) : activeTab === "schools" ? (
      <>
        <button className="btn-secondary" onClick={() => setImporting(true)}>
          <Upload size={15} />
          Import CSV
        </button>
        <button
          className="btn"
          onClick={() => setSchoolForm({ initial: null })}
        >
          <Plus size={15} />
          Tambah Sekolah
        </button>
      </>
    ) : activeTab === "packages" && packageForm === undefined ? (
      <button
        className="btn"
        onClick={() => {
          setSearch("");
          setPackageForm(null);
        }}
      >
        <Plus size={15} />
        Buat Paket Baru
      </button>
    ) : undefined;
  return (
    <WorkspaceShell
      user={user}
      roleLabel="Super Admin"
      items={tabs}
      activeId={activeTab}
      onNavigate={navigate}
      onLogout={onLogout}
      description={descriptions[activeTab]}
      actions={actions}
    >
      <div className="admin-content">
        {activeTab === "overview" && <AdminOverview onNavigate={navigate} />}
        {activeTab === "accounts" && (
          <AdminPanel
            title="Daftar akun"
            description="Kelola akun dan peran pengguna di seluruh sekolah."
          >
            <AdminFilters search={search} onSearch={onSearch} onReset={reset}>
              <select
                className="input-field"
                aria-label="Peran pengguna"
                value={userRole}
                onChange={(event) => {
                  setUserRole(event.target.value);
                  setUserPage(1);
                }}
              >
                <option value="">Semua Peran</option>
                {Object.entries(roleNames).map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
            </AdminFilters>
            <TableFrame
              total={userList.total}
              pageSize={usersPerPage}
              onPageSize={(size) => {
                setUsersPerPage(size);
                setUserPage(1);
              }}
              label="Daftar akun"
              sort={userSort}
              onSort={(value) => {
                setUserSort(value);
                setUserPage(1);
              }}
              exportOptions={{
                url: "/api/users",
                params: { search: query, role: userRole, sort: userSort },
                filename: "daftar_akun.csv",
                disabled:
                  userList.loading || !!userList.error || search !== query,
                columns: [
                  { title: "Nama", value: (r) => r.fullName },
                  { title: "Username", value: (r) => r.username },
                  { title: "Peran", value: (r) => r.role },
                  { title: "Sekolah", value: (r) => r.school?.name || "" },
                ],
              }}
            >
              <table>
                <thead>
                  <tr>
                    <SortableHeading
                      title="Nama"
                      sort={userSort}
                      onSort={(value) => {
                        setUserSort(value);
                        setUserPage(1);
                      }}
                    />
                    <th scope="col">Username</th>
                    <th scope="col">Peran</th>
                    <th scope="col">Sekolah</th>
                    <th scope="col">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {userList.loading || userList.error ? (
                    <TableState
                      columns={5}
                      loading={userList.loading}
                      error={userList.error}
                      retry={() => void userList.reload()}
                    />
                  ) : userList.items.length ? (
                    userList.items.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <Person
                            name={u.fullName}
                            detail={
                              u.role === "siswa" && u.nisn
                                ? `NISN ${u.nisn}`
                                : undefined
                            }
                          />
                        </td>
                        <td className="table-mono">{u.username}</td>
                        <td>
                          <span
                            className={`admin-role-tag ${u.role === "guru" ? "teacher" : ""}`}
                          >
                            {roleNames[u.role] || u.role}
                          </span>
                        </td>
                        <td>
                          <span className="table-secondary">
                            {u.school?.name ||
                              (["admin", "super_admin"].includes(u.role)
                                ? "Pusat"
                                : "Tanpa sekolah")}
                          </span>
                        </td>
                        <td>
                          <div className="admin-row-actions">
                            <button
                              className="admin-icon-action"
                              aria-label="Edit"
                              title="Edit akun"
                              disabled={busy}
                              onClick={() => setAccountForm({ initial: u })}
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              className="admin-icon-action danger"
                              aria-label="Hapus"
                              title="Hapus akun"
                              disabled={busy}
                              onClick={() => void remove("users", u)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        <div className="table-empty">
                          <Users size={25} />
                          <strong>Belum ada pengguna yang sesuai.</strong>
                          <p>Coba ubah pencarian atau filter peran.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableFrame>
            <Pagination
              page={userPage}
              total={userList.total}
              pageSize={usersPerPage}
              onChange={setUserPage}
              loading={userList.loading}
            />
          </AdminPanel>
        )}
        {activeTab === "schools" && (
          <AdminPanel
            title="Daftar sekolah"
            description="Identitas sekolah dan wilayah penyelenggaraan."
          >
            <AdminFilters search={search} onSearch={onSearch} onReset={reset} />
            <TableFrame
              total={schoolList.total}
              pageSize={schoolsPerPage}
              onPageSize={(size) => {
                setSchoolsPerPage(size);
                setSchoolPage(1);
              }}
              label="Daftar sekolah"
              sort={schoolSort}
              onSort={(value) => {
                setSchoolSort(value);
                setSchoolPage(1);
              }}
              exportOptions={{
                url: "/api/schools",
                params: { search: query, sort: schoolSort },
                filename: "daftar_sekolah.csv",
                disabled:
                  schoolList.loading || !!schoolList.error || search !== query,
                columns: [
                  { title: "NPSN", value: (r) => r.npsn },
                  { title: "Nama Sekolah", value: (r) => r.name },
                  { title: "Wilayah", value: (r) => r.region || "" },
                ],
              }}
            >
              <table>
                <thead>
                  <tr>
                    <SortableHeading
                      title="Nama Sekolah"
                      sort={schoolSort}
                      onSort={(value) => {
                        setSchoolSort(value);
                        setSchoolPage(1);
                      }}
                    />
                    <th scope="col">NPSN</th>
                    <th scope="col">Wilayah</th>
                    <th scope="col">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {schoolList.loading || schoolList.error ? (
                    <TableState
                      columns={4}
                      loading={schoolList.loading}
                      error={schoolList.error}
                      retry={() => void schoolList.reload()}
                    />
                  ) : schoolList.items.length ? (
                    schoolList.items.map((s) => (
                      <tr key={s.npsn}>
                        <td>
                          <Person name={s.name} detail="Sekolah peserta" />
                        </td>
                        <td className="table-mono">{s.npsn}</td>
                        <td>{s.region || "—"}</td>
                        <td>
                          <div className="admin-row-actions">
                            <button
                              className="admin-icon-action"
                              aria-label="Edit"
                              title="Edit sekolah"
                              disabled={busy}
                              onClick={() => setSchoolForm({ initial: s })}
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              className="admin-icon-action danger"
                              aria-label="Hapus"
                              title="Hapus sekolah"
                              disabled={busy}
                              onClick={() => void remove("schools", s)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>
                        <div className="table-empty">
                          <Building2 size={25} />
                          <strong>Belum ada data sekolah yang sesuai.</strong>
                          <p>Tambahkan sekolah atau ubah pencarian.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableFrame>
            <Pagination
              page={schoolPage}
              total={schoolList.total}
              pageSize={schoolsPerPage}
              onChange={setSchoolPage}
              loading={schoolList.loading}
            />
          </AdminPanel>
        )}
        {activeTab === "packages" &&
          (packageForm === undefined ? (
            <AdminPanel
              title="Daftar paket try out"
              description="Atur soal, durasi, token, dan status paket."
            >
              <AdminFilters search={search} onSearch={onSearch} onReset={reset}>
                <select
                  className="input-field"
                  aria-label="Mata pelajaran paket"
                  value={packageSubject}
                  onChange={(event) => {
                    setPackageSubject(event.target.value);
                    setPackagePage(1);
                  }}
                >
                  <option value="">Semua Mata Pelajaran</option>
                  <option>Matematika</option>
                  <option>Bahasa Indonesia</option>
                </select>
              </AdminFilters>
              <TableFrame
                total={packageList.total}
                pageSize={packagesPerPage}
                onPageSize={(size) => {
                  setPackagesPerPage(size);
                  setPackagePage(1);
                }}
                label="Paket ujian"
                sort={packageSort}
                onSort={(value) => {
                  setPackageSort(value);
                  setPackagePage(1);
                }}
                exportOptions={{
                  url: "/api/packages",
                  params: {
                    search: query,
                    sort: packageSort,
                    mapel: packageSubject,
                  },
                  filename: "paket_ujian.csv",
                  disabled:
                    packageList.loading ||
                    !!packageList.error ||
                    search !== query,
                  columns: [
                    { title: "Nama Paket", value: (r) => r.name },
                    { title: "Mata Pelajaran", value: (r) => r.mapel },
                    {
                      title: "Jumlah Soal",
                      value: (r) => r._count?.questions || 0,
                    },
                    {
                      title: "Durasi (Menit)",
                      value: (r) => r.durationMinutes,
                    },
                    { title: "Status", value: (r) => r.status },
                  ],
                }}
              >
                <table>
                  <thead>
                    <tr>
                      <SortableHeading
                        title="Nama Paket"
                        sort={packageSort}
                        onSort={(value) => {
                          setPackageSort(value);
                          setPackagePage(1);
                        }}
                      />
                      <th scope="col">Mata Pelajaran</th>
                      <th scope="col" className="numeric">
                        Jumlah Soal
                      </th>
                      <th scope="col" className="numeric">
                        Durasi
                      </th>
                      <th scope="col">Token</th>
                      <th scope="col">Status</th>
                      <th scope="col">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packageList.loading || packageList.error ? (
                      <TableState
                        columns={7}
                        loading={packageList.loading}
                        error={packageList.error}
                        retry={() => void packageList.reload()}
                      />
                    ) : packageList.items.length ? (
                      packageList.items.map((pkg) => (
                        <tr key={pkg.id}>
                          <td>
                            <strong className="table-primary">
                              {pkg.name}
                            </strong>
                            <small className="table-secondary">
                              {pkg.navigationMode === "maju_terus"
                                ? "Navigasi berurutan"
                                : "Navigasi bebas"}
                            </small>
                          </td>
                          <td>
                            <span className="tag">{pkg.mapel}</span>
                          </td>
                          <td className="numeric">
                            {pkg._count?.questions || 0}
                          </td>
                          <td className="numeric">
                            {pkg.durationMinutes} menit
                          </td>
                          <td>
                            <span className="admin-token">
                              {pkg.token || "—"}
                            </span>
                          </td>
                          <td>
                            <StatusBadge
                              value={
                                pkg.status === "aktif" ? "Aktif" : pkg.status
                              }
                            />
                          </td>
                          <td>
                            <div className="admin-row-actions">
                              <button
                                className="btn-secondary"
                                disabled={busy}
                                onClick={() => {
                                  setSearch("");
                                  setPackageForm(pkg);
                                  window.scrollTo(0, 0);
                                }}
                              >
                                Edit Paket
                              </button>
                              <button
                                className={
                                  pkg.status === "aktif"
                                    ? "btn-secondary admin-close-exam"
                                    : "btn"
                                }
                                disabled={busy}
                                onClick={() => void changeStatus(pkg)}
                              >
                                {pkg.status === "aktif"
                                  ? "Tutup Ujian"
                                  : "Buka Ujian"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7}>
                          <div className="table-empty">
                            <ClipboardList size={25} />
                            <strong>Belum ada paket sesuai pencarian.</strong>
                            <p>
                              Buat paket baru atau ubah filter yang digunakan.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TableFrame>
              <Pagination
                page={packagePage}
                total={packageList.total}
                pageSize={packagesPerPage}
                onChange={setPackagePage}
                loading={packageList.loading}
              />
            </AdminPanel>
          ) : (
            <AdminPackageForm
              key={packageForm?.id || "new"}
              initial={packageForm}
              userId={user?.id}
              onClose={() => setPackageForm(undefined)}
              onSaved={() => {
                setPackageForm(undefined);
                toast.success("Paket berhasil disimpan.");
                void packageList.reload();
              }}
            />
          ))}
        {activeTab === "results" && <AnalyticsReports />}
        {activeTab === "settings" && (
          <AdminPanel
            title="Pengaturan pelaksanaan"
            description="Konfigurasi ujian mengikuti paket yang digunakan."
          >
            <div className="admin-empty admin-settings">
              <span className="admin-stat-icon">
                <Settings size={25} />
              </span>
              <h3>Kelola pengaturan melalui paket try out</h3>
              <p>
                Durasi, mata pelajaran, navigasi, pilihan soal, dan rilis nilai
                tersedia pada formulir paket.
              </p>
              <button className="btn" onClick={() => navigate("packages")}>
                Buka paket try out
                <ArrowRight size={15} />
              </button>
            </div>
            <AdminNotice>
              Konten yang sudah digunakan pada sesi ujian tetap mengikuti
              penguncian sistem.
            </AdminNotice>
          </AdminPanel>
        )}
        {accountForm && (
          <AdminAccountForm
            initial={accountForm.initial}
            onClose={() => setAccountForm(null)}
            onSaved={() => {
              setAccountForm(null);
              toast.success("Akun berhasil disimpan.");
              void userList.reload();
            }}
          />
        )}
        {schoolForm && (
          <AdminSchoolForm
            initial={schoolForm.initial}
            onClose={() => setSchoolForm(null)}
            onSaved={() => {
              setSchoolForm(null);
              toast.success("Sekolah berhasil disimpan.");
              void schoolList.reload();
            }}
          />
        )}
        {importing && (
          <AdminSchoolImport
            onClose={() => setImporting(false)}
            onSaved={() => {
              setImporting(false);
              toast.success("Data sekolah berhasil diimpor.");
              void schoolList.reload();
            }}
          />
        )}
      </div>
    </WorkspaceShell>
  );
};
export default AdminDashboard;
