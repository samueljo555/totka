import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Clock3,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import {
  TableFrame,
  StatusBadge,
  SortableHeading,
  TableState,
} from "./TableFrame";
import { ReportTable } from "./ReportTable";
import { Pagination } from "./Pagination";
import {
  OperatorError,
  OperatorFilters,
  OperatorNotice,
  OperatorPanel,
} from "./operator/OperatorUI";
import { useDebounced, usePagedList } from "../lib/paging";
import { useRemoteData } from "../lib/useRemoteData";
import { validClasses } from "../lib/operator-api";

export function OperatorExams({ history }: { history: boolean }) {
  return history ? <ReportTable kind="history" /> : <MonitoringExams />;
}
function MonitoringExams() {
  const [pageSize, setPageSize] = useState(10),
    [studentPageSize, setStudentPageSize] = useState(10);
  const [page, setPage] = useState(1),
    [studentPage, setStudentPage] = useState(1),
    [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState(""),
    [packageSearch, setPackageSearch] = useState(""),
    [className, setClassName] = useState(""),
    [status, setStatus] = useState("");
  const [sort, setSort] = useState("name_asc"),
    [studentSort, setStudentSort] = useState("name_asc"),
    [refreshing, setRefreshing] = useState(false);
  const query = useDebounced(search),
    packageQuery = useDebounced(packageSearch);
  const packages = usePagedList<any>(
    "/api/monitoring/packages",
    page,
    pageSize,
    { status: "aktif", search: packageQuery, sort },
  );
  const students = usePagedList<any>(
    `/api/monitoring/packages/${selected?.id}/students`,
    studentPage,
    studentPageSize,
    { search: query, className, status, sort: studentSort },
    !!selected,
  );
  const classes = useRemoteData<string[]>(
    selected ? "/api/users/classes" : null,
    validClasses,
  );
  const inFlight = useRef<AbortController | null>(null),
    loading = useRef(false);
  loading.current = packages.loading || (!!selected && students.loading);
  const reloadPackages = packages.reload,
    reloadStudents = students.reload,
    selectedId = selected?.id;
  const refresh = useCallback(async () => {
    if (inFlight.current || loading.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setRefreshing(true);
    try {
      await Promise.all([
        reloadPackages(controller.signal),
        ...(selectedId ? [reloadStudents(controller.signal)] : []),
      ]);
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setRefreshing(false);
      }
    }
  }, [reloadPackages, reloadStudents, selectedId]);
  useEffect(() => {
    setRefreshing(false);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => {
      clearInterval(timer);
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [refresh]);
  const current = packages.items.find((pkg) => pkg.id === selectedId);
  const verified = !!current && !packages.error;
  const select = (pkg: any) => {
    setSelected(pkg);
    setStudentPage(1);
    setSearch("");
    setClassName("");
    setStatus("");
  };
  const resetStudents = () => {
    setSearch("");
    setClassName("");
    setStatus("");
    setStudentSort("name_asc");
    setStudentPage(1);
  };
  return (
    <>
      {selected && (
        <div
          className="operator-monitor-stats"
          aria-label="Ringkasan paket terpilih"
        >
          {[
            ["Akun siswa", current?.registeredStudents, Users],
            ["Belum Mulai", current?.notStarted, Clock3],
            ["Sedang Mengerjakan", current?.ongoing, Activity],
            ["Selesai", current?.finished, Users],
          ].map(([label, value, Icon]: any) => (
            <div className="operator-stat" key={label}>
              <div>
                <p>{label}</p>
                <strong>
                  {verified && value != null
                    ? Number(value).toLocaleString("id-ID")
                    : "—"}
                </strong>
                <small>Seluruh siswa sekolah · paket terpilih</small>
              </div>
              <span className="operator-stat-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
            </div>
          ))}
        </div>
      )}
      <OperatorPanel
        title={selected ? current?.name || selected.name : "Paket ujian aktif"}
        description={
          selected
            ? "Status pengerjaan siswa pada paket terpilih."
            : "Token dan partisipasi siswa di sekolah Anda."
        }
        actions={
          <>
            {selected && (
              <button
                className="btn-secondary"
                onClick={() => setSelected(null)}
              >
                <ArrowLeft size={14} />
                Kembali ke paket
              </button>
            )}
            <button
              className="btn-secondary"
              disabled={
                refreshing ||
                packages.loading ||
                (!!selected && students.loading)
              }
              onClick={() => void refresh()}
            >
              <RefreshCw size={14} />
              {refreshing ? "Memperbarui..." : "Perbarui"}
            </button>
          </>
        }
      >
        {!selected ? (
          <>
            <OperatorFilters
              value={packageSearch}
              label="Cari paket aktif"
              placeholder="Cari nama paket aktif..."
              onChange={(value) => {
                setPackageSearch(value);
                setPage(1);
              }}
              onReset={() => {
                setPackageSearch("");
                setSort("name_asc");
                setPage(1);
              }}
            />
            <TableFrame
              total={packages.total}
              pageSize={pageSize}
              onPageSize={(value) => {
                setPageSize(value);
                setPage(1);
              }}
              sort={sort}
              onSort={(value) => {
                setSort(value);
                setPage(1);
              }}
              label="Paket aktif"
            >
              <table>
                <thead>
                  <tr>
                    <SortableHeading
                      title="Paket Ujian"
                      sort={sort}
                      onSort={(value) => {
                        setSort(value);
                        setPage(1);
                      }}
                    />
                    <th scope="col">Mata Pelajaran</th>
                    <th scope="col">Token</th>
                    <th scope="col" className="numeric">
                      Belum Mulai
                    </th>
                    <th scope="col" className="numeric">
                      Berlangsung
                    </th>
                    <th scope="col" className="numeric">
                      Selesai
                    </th>
                    <th scope="col">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.loading || packages.error ? (
                    <TableState
                      columns={7}
                      loading={packages.loading}
                      error={packages.error}
                      retry={() => void packages.reload()}
                    />
                  ) : packages.items.length ? (
                    packages.items.map((pkg) => (
                      <tr key={pkg.id}>
                        <td>
                          <strong className="table-primary">{pkg.name}</strong>
                          <small className="table-secondary">Paket aktif</small>
                        </td>
                        <td>
                          <span className="tag">{pkg.mapel}</span>
                        </td>
                        <td>
                          <strong className="operator-token">
                            {pkg.token || "—"}
                          </strong>
                        </td>
                        <td className="numeric">{pkg.notStarted}</td>
                        <td className="numeric">{pkg.ongoing}</td>
                        <td className="numeric">{pkg.finished}</td>
                        <td>
                          <button
                            className="btn-secondary"
                            onClick={() => select(pkg)}
                          >
                            Lihat peserta
                            <ArrowRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7}>
                        <div className="table-empty">
                          <Search size={25} />
                          <strong>
                            Belum ada paket aktif sesuai pencarian.
                          </strong>
                          <p>
                            Coba ubah pencarian atau tunggu paket diaktifkan.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableFrame>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={packages.total}
              onChange={setPage}
              loading={packages.loading}
            />
          </>
        ) : (
          <>
            {packages.error && (
              <OperatorError
                message={packages.error}
                retry={() => void packages.reload()}
              />
            )}
            {!packages.loading && !packages.error && !current && (
              <OperatorNotice>
                Paket ini tidak ada pada halaman daftar aktif terbaru. Kembali
                ke daftar untuk memeriksa statusnya.
              </OperatorNotice>
            )}
            <div className="operator-token-band">
              <div>
                <small>TOKEN PAKET</small>
                <strong className="operator-token">
                  {verified ? current.token || "—" : "—"}
                </strong>
              </div>
              <p>
                Ringkasan mencakup seluruh siswa sekolah pada paket ini. Filter
                di bawah hanya berlaku pada tabel peserta.
              </p>
            </div>
            <OperatorFilters
              value={search}
              onChange={(value) => {
                setSearch(value);
                setStudentPage(1);
              }}
              onReset={resetStudents}
            >
              <select
                className="input-field"
                aria-label="Kelas peserta"
                value={className}
                onChange={(e) => {
                  setClassName(e.target.value);
                  setStudentPage(1);
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
              <select
                className="input-field"
                aria-label="Status ujian"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setStudentPage(1);
                }}
              >
                <option value="">Semua status</option>
                <option value="belum">Belum Mulai</option>
                <option value="sedang_mengerjakan">Sedang Mengerjakan</option>
                <option value="selesai">Selesai</option>
              </select>
            </OperatorFilters>
            {classes.error && (
              <OperatorError message={classes.error} retry={classes.retry} />
            )}
            <TableFrame
              total={students.total}
              pageSize={studentPageSize}
              onPageSize={(value) => {
                setStudentPageSize(value);
                setStudentPage(1);
              }}
              sort={studentSort}
              onSort={(value) => {
                setStudentSort(value);
                setStudentPage(1);
              }}
              label="Peserta ujian"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">NISN</th>
                    <SortableHeading
                      title="Nama Siswa"
                      sort={studentSort}
                      onSort={(value) => {
                        setStudentSort(value);
                        setStudentPage(1);
                      }}
                    />
                    <th scope="col">Kelas</th>
                    <th scope="col">Status Pengerjaan</th>
                    <th scope="col" className="numeric">
                      Skor akhir
                    </th>
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
                          <strong className="table-primary">
                            {student.fullName}
                          </strong>
                        </td>
                        <td>{student.className || "—"}</td>
                        <td>
                          <StatusBadge
                            value={
                              student.session?.status === "selesai"
                                ? "Selesai"
                                : !student.session
                                  ? "Belum Mulai"
                                  : student.session.status ===
                                      "sedang_mengerjakan"
                                    ? "Sedang Mengerjakan"
                                    : "Status Lain"
                            }
                          />
                        </td>
                        <td className="numeric">
                          {student.session?.status === "selesai" &&
                          student.session.totalScore != null ? (
                            <span className="table-score">
                              {Number(
                                student.session.totalScore,
                              ).toLocaleString("id-ID", {
                                maximumFractionDigits: 1,
                              })}
                            </span>
                          ) : (
                            <span className="table-unavailable">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        <div className="table-empty">
                          <Users size={25} />
                          <strong>Tidak ada siswa yang sesuai filter.</strong>
                          <button
                            className="btn-secondary"
                            onClick={resetStudents}
                          >
                            Reset Filter
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableFrame>
            <Pagination
              page={studentPage}
              total={students.total}
              pageSize={studentPageSize}
              onChange={setStudentPage}
              loading={students.loading}
            />
          </>
        )}
        <p className="table-caption">
          Data diperbarui otomatis setiap 15 detik ketika halaman terlihat. Skor
          akhir hanya ditampilkan untuk sesi selesai.
        </p>
      </OperatorPanel>
    </>
  );
}
