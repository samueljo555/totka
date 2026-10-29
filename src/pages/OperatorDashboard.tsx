import { useRef, useState } from "react";
import {
  Activity,
  Building2,
  Clock3,
  Plus,
  Printer,
  Upload,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { WorkspaceShell } from "../components/WorkspaceShell";
import {
  TableFrame,
  SortableHeading,
  TableState,
} from "../components/TableFrame";
import { Pagination } from "../components/Pagination";
import { OperatorExams } from "../components/OperatorExams";
import {
  OperatorError,
  OperatorFilters,
  OperatorNotice,
  OperatorPanel,
} from "../components/operator/OperatorUI";
import { StudentForm } from "../components/operator/StudentForm";
import { StudentImport } from "../components/operator/StudentImport";
import { useConfirm } from "../contexts/ConfirmContext";
import { useDebounced, usePagedList } from "../lib/paging";
import { useRemoteData } from "../lib/useRemoteData";
import { useLoginCardPrint } from "../lib/useLoginCardPrint";
import { validClasses, writeStudent } from "../lib/operator-api";
import "../operator-design.css";

const descriptions: Record<string, string> = {
  students: "Siapkan data siswa dan kartu login sebelum ujian dimulai.",
  monitoring: "Pantau partisipasi siswa dan temukan token paket aktif.",
  history: "Telusuri sesi ujian yang sudah selesai di sekolah Anda.",
};
const OperatorDashboard = ({
  user,
  onLogout,
}: {
  user?: any;
  onLogout: () => void;
}) => {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState("students"),
    [form, setForm] = useState<"add" | "import" | null>(null);
  const [search, setSearch] = useState(""),
    [className, setClassName] = useState(""),
    [sort, setSort] = useState("name_asc");
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [resettingId, setResettingId] = useState<string | null>(null);
  const resetting = useRef(false),
    query = useDebounced(search);
  const schoolName = user?.school?.name || "",
    schoolNpsn = user?.school?.npsn || user?.schoolNpsn || "";
  const students = usePagedList<any>(
    "/api/users/login-cards",
    page,
    pageSize,
    { search: query, className, sort },
    activeTab === "students",
  );
  const classes = useRemoteData<string[]>(
    activeTab === "students" ? "/api/users/classes" : null,
    validClasses,
  );
  const printing = useLoginCardPrint(
    schoolName,
    schoolNpsn,
    activeTab === "students",
  );
  const busy = !!printing.progress || resettingId !== null;
  const refresh = () => {
    void students.reload();
    classes.retry();
  };
  const resetFilters = () => {
    setSearch("");
    setClassName("");
    setSort("name_asc");
    setPage(1);
  };
  const resetPassword = async (student: any) => {
    if (resetting.current || printing.progress) return;
    resetting.current = true;
    setResettingId(student.id);
    try {
      if (
        !(await confirm({
          title: "Atur ulang password siswa",
          message: `Buat password 6 karakter baru untuk ${student.fullName}? Password lama tidak berlaku dan siswa perlu login kembali.`,
          confirmText: "Atur ulang password",
        }))
      )
        return;
      await writeStudent(
        `/api/users/${encodeURIComponent(student.id)}/login-card/reset`,
      );
      await students.reload();
      toast.success("Password baru tersimpan dan siap dicetak.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal mengatur ulang password.",
      );
    } finally {
      resetting.current = false;
      setResettingId(null);
    }
  };
  const tabs = [
    { id: "students", name: "Manajemen Siswa", icon: <Users /> },
    { id: "monitoring", name: "Pantau Ujian", icon: <Activity /> },
    { id: "history", name: "Riwayat Ujian", icon: <Clock3 /> },
  ];
  return (
    <WorkspaceShell
      user={user}
      roleLabel="Operator Sekolah"
      items={tabs}
      activeId={activeTab}
      onNavigate={(tab) => {
        setActiveTab(tab);
        setForm(null);
      }}
      onLogout={onLogout}
      description={descriptions[activeTab]}
      actions={
        activeTab === "students" ? (
          <>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => void printing.print()}
            >
              <Printer size={15} />
              {printing.progress ? "Menyiapkan kartu..." : "Cetak Kartu Login"}
            </button>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => setForm("import")}
            >
              <Upload size={15} />
              Import CSV
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => setForm("add")}
            >
              <Plus size={15} />
              Tambah Siswa
            </button>
          </>
        ) : undefined
      }
    >
      <div className="operator-content">
        <div className="operator-school-band">
          <span className="operator-space-icon">
            <Building2 size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>{schoolName || "Workspace sekolah"}</h2>
            <p>
              {schoolNpsn
                ? `NPSN ${schoolNpsn}`
                : "Identitas sekolah mengikuti akun operator."}
            </p>
          </div>
          <span className="operator-scope-label">Data sekolah Anda</span>
        </div>
        {activeTab === "students" && (
          <OperatorPanel
            title="Data siswa"
            description="Kelola identitas dan kartu login siswa di sekolah Anda."
          >
            <OperatorFilters
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              onReset={resetFilters}
            >
              <select
                className="input-field"
                aria-label="Kelas siswa"
                value={className}
                onChange={(e) => {
                  setClassName(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua Kelas</option>
                {className && !classes.data?.includes(className) && (
                  <option>{className}</option>
                )}
                {classes.data?.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </OperatorFilters>
            {classes.error && (
              <OperatorError message={classes.error} retry={classes.retry} />
            )}
            {printing.progress && (
              <p className="export-progress" role="status">
                Menyiapkan kartu: {printing.progress.loaded} dari{" "}
                {printing.progress.total || "..."} siswa dimuat. Tunggu hingga
                seluruh data selesai.
              </p>
            )}
            <TableFrame
              total={students.total}
              pageSize={pageSize}
              onPageSize={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              sort={sort}
              onSort={(value) => {
                setSort(value);
                setPage(1);
              }}
              label="Data siswa"
              exportOptions={{
                url: "/api/users",
                params: { search: query, className, sort },
                filename: "data_siswa.csv",
                disabled:
                  students.loading || !!students.error || query !== search,
                columns: [
                  { title: "NISN", value: (row) => row.nisn || "" },
                  { title: "Nama", value: (row) => row.fullName },
                  { title: "Kelas", value: (row) => row.className || "" },
                ],
              }}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">NISN</th>
                    <SortableHeading
                      title="Nama Lengkap"
                      sort={sort}
                      onSort={(value) => {
                        setSort(value);
                        setPage(1);
                      }}
                    />
                    <th scope="col">Kelas</th>
                    <th scope="col">Password Sementara</th>
                    <th scope="col">Kartu login</th>
                  </tr>
                </thead>
                <tbody>
                  {students.loading || students.error ? (
                    <TableState
                      columns={5}
                      loading={students.loading}
                      error={students.error}
                      retry={() => void students.reload()}
                    />
                  ) : students.items.length ? (
                    students.items.map((student) => (
                      <tr key={student.id}>
                        <td className="table-mono">{student.nisn || "—"}</td>
                        <td>
                          <div className="table-person">
                            <span className="table-avatar" aria-hidden="true">
                              {String(student.fullName || "?")
                                .trim()
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((s) => s[0])
                                .join("")}
                            </span>
                            <div>
                              <strong className="table-primary">
                                {student.fullName}
                              </strong>
                              <small className="table-secondary">
                                Username: {student.username || student.nisn}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="tag">
                            {student.className || "—"}
                          </span>
                        </td>
                        <td>
                          <div className="operator-credentials">
                            <code>
                              {student.loginPassword || "Belum tersedia"}
                            </code>
                            <button
                              className="btn-secondary"
                              disabled={busy}
                              onClick={() => void resetPassword(student)}
                            >
                              {resettingId === student.id
                                ? "Memproses..."
                                : "Atur ulang"}
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            className="operator-icon-action"
                            aria-label={`Cetak kartu ${student.fullName}`}
                            title="Cetak kartu siswa"
                            disabled={busy || !student.loginPassword}
                            onClick={() => void printing.print(student.id)}
                          >
                            <Printer size={15} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        <div className="table-empty">
                          <Users size={25} />
                          <strong>
                            {search || className
                              ? "Tidak ada siswa yang cocok dengan filter pencarian."
                              : "Belum ada siswa terdaftar."}
                          </strong>
                          <p>
                            {search || className
                              ? "Coba kata kunci lain atau reset filter."
                              : "Tambahkan siswa atau impor dari file CSV."}
                          </p>
                          {(search || className) && (
                            <button
                              className="btn-secondary"
                              onClick={resetFilters}
                            >
                              Reset Filter
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableFrame>
            <Pagination
              page={page}
              total={students.total}
              pageSize={pageSize}
              onChange={setPage}
              loading={students.loading}
            />
            <OperatorNotice>
              Cetak Kartu Login memuat seluruh siswa sekolah, sedangkan tombol
              cetak pada baris hanya memuat siswa tersebut. Filter berlaku pada
              tabel dan CSV identitas. Password tetap tersedia pada kartu login;
              gunakan Atur ulang untuk akun lama yang belum memiliki password
              kartu.
            </OperatorNotice>
          </OperatorPanel>
        )}
        {(activeTab === "monitoring" || activeTab === "history") && (
          <OperatorExams key={activeTab} history={activeTab === "history"} />
        )}
        {form === "add" && (
          <StudentForm
            schoolNpsn={schoolNpsn || undefined}
            schoolName={schoolName}
            onClose={() => setForm(null)}
            onSaved={(data) => {
              setForm(null);
              const password = data?.user?.tempPassword;
              toast.success(
                password
                  ? `Siswa dibuat. Password: ${password}. Kartu login siap dicetak.`
                  : "Siswa dibuat. Kartu login siap dicetak.",
              );
              refresh();
            }}
          />
        )}
        {form === "import" && (
          <StudentImport
            schoolNpsn={schoolNpsn || undefined}
            onClose={() => setForm(null)}
            onSaved={(data) => {
              setForm(null);
              toast.success(
                `Berhasil mengimpor ${data?.count ?? 0} siswa. Password tersedia pada kartu login.`,
              );
              refresh();
            }}
          />
        )}
      </div>
    </WorkspaceShell>
  );
};
export default OperatorDashboard;
