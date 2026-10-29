import { lazy, Suspense, useRef, useState } from "react";
import {
  Edit3,
  Eye,
  Library,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { WorkspaceShell } from "../components/WorkspaceShell";
import {
  TableFrame,
  SortableHeading,
  TableState,
} from "../components/TableFrame";
import { Pagination } from "../components/Pagination";
import { ExamQuestion } from "../components/ExamQuestion";
import { ExamDialog } from "../components/ExamDialog";
import { RichImageDialog } from "../components/RichImageDialog";
import { useConfirm } from "../contexts/ConfirmContext";
import { useDebounced, usePagedList } from "../lib/paging";
import { contentText } from "../../backend/rich-content";
import "../teacher-design.css";
import "katex/dist/katex.min.css";
const QuestionEditor = lazy(() =>
  import("../components/QuestionEditor").then((module) => ({
    default: module.QuestionEditor,
  })),
);

const GuruDashboard = ({
  user,
  onLogout,
}: {
  user?: any;
  onLogout: () => void;
}) => {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<any | null | undefined>(undefined),
    [preview, setPreview] = useState<any>(null),
    [image, setImage] = useState<string | null>(null);
  const [search, setSearch] = useState(""),
    [subject, setSubject] = useState(""),
    [type, setType] = useState(""),
    [sort, setSort] = useState("name_asc");
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [deleting, setDeleting] = useState(false);
  const mutation = useRef(false),
    query = useDebounced(search);
  const list = usePagedList<any>(
    "/api/questions",
    page,
    pageSize,
    { search: query, mapel: subject, type, sort },
    editing === undefined,
  );
  const reset = () => {
    setSearch("");
    setSubject("");
    setType("");
    setSort("name_asc");
    setPage(1);
  };
  const remove = async (question: any) => {
    if (mutation.current) return;
    mutation.current = true;
    setDeleting(true);
    try {
      if (
        !(await confirm({
          title: "Hapus soal?",
          message: "Yakin ingin menghapus soal ini?",
          confirmText: "Hapus",
          isDestructive: true,
        }))
      )
        return;
      const response = await fetch(
        `/api/questions/${encodeURIComponent(question.id)}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(data?.message || "Gagal menghapus soal.");
      toast.success("Soal berhasil dihapus.");
      await list.reload();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menghapus soal.",
      );
    } finally {
      mutation.current = false;
      setDeleting(false);
    }
  };
  return (
    <WorkspaceShell
      user={user}
      roleLabel="Guru Penulis"
      items={[{ id: "bank", name: "Bank Soal", icon: <Library /> }]}
      activeId="bank"
      onNavigate={() => setEditing(undefined)}
      onLogout={onLogout}
      description="Susun bacaan, puisi, gambar, dan pertanyaan langsung dalam satu editor soal."
      actions={
        editing === undefined ? (
          <button
            className="btn"
            disabled={deleting}
            onClick={() => setEditing(null)}
          >
            <Plus size={15} />
            Tambah Soal
          </button>
        ) : undefined
      }
    >
      <div className="teacher-content">
        {editing === undefined ? (
          <section className="teacher-panel">
            <div className="teacher-panel-heading">
              <div>
                <h2>Daftar Soal</h2>
                <p>
                  Kelola soal Matematika dan Bahasa Indonesia milik akun Anda.
                </p>
              </div>
              <span className="teacher-scope">Bank soal Anda</span>
            </div>
            <div className="teacher-filters">
              <label className="table-search">
                <Search size={15} aria-hidden="true" />
                <input
                  className="input-field"
                  aria-label="Cari soal"
                  placeholder="Cari teks soal..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <select
                className="input-field"
                aria-label="Mata pelajaran soal"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua Mata Pelajaran</option>
                <option>Matematika</option>
                <option>Bahasa Indonesia</option>
              </select>
              <select
                className="input-field"
                aria-label="Tipe soal"
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua Tipe Soal</option>
                <option value="Pilihan Ganda Sederhana">PG Sederhana</option>
                <option value="Pilihan Ganda Kompleks">PG Kompleks</option>
                <option value="Pilihan Ganda Kompleks Kategori">
                  PG Kategori
                </option>
              </select>
              <button className="table-reset" onClick={reset}>
                <RotateCcw size={13} />
                Reset Filter
              </button>
            </div>
            <TableFrame
              total={list.total}
              pageSize={pageSize}
              onPageSize={(value) => {
                setPageSize(value);
                setPage(1);
              }}
              label="Bank soal"
              sortLabel="Soal"
              sort={sort}
              onSort={(value) => {
                setSort(value);
                setPage(1);
              }}
              exportOptions={{
                url: "/api/questions",
                params: { search: query, mapel: subject, type, sort },
                filename: "bank_soal.csv",
                disabled: list.loading || !!list.error || query !== search,
                columns: [
                  { title: "Mata Pelajaran", value: (q) => q.mapel },
                  { title: "Elemen", value: (q) => q.element },
                  { title: "Tipe Soal", value: (q) => q.type },
                  { title: "Soal", value: (q) => contentText(q.content) },
                ],
              }}
            >
              <table>
                <thead>
                  <tr>
                    <SortableHeading
                      title="Cuplikan Soal"
                      sort={sort}
                      onSort={(value) => {
                        setSort(value);
                        setPage(1);
                      }}
                    />
                    <th scope="col">Mata Pelajaran</th>
                    <th scope="col">Elemen</th>
                    <th scope="col">Tipe Soal</th>
                    <th scope="col">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {list.loading || list.error ? (
                    <TableState
                      columns={5}
                      loading={list.loading}
                      error={list.error}
                      retry={() => void list.reload()}
                    />
                  ) : list.items.length ? (
                    list.items.map((question) => (
                      <tr key={question.id}>
                        <td>
                          <strong className="teacher-question-summary">
                            {contentText(question.content)}
                          </strong>
                          <small className="table-secondary">
                            ID: {question.id.substring(0, 8)}
                          </small>
                        </td>
                        <td>
                          <span className="tag">{question.mapel}</span>
                        </td>
                        <td>
                          <span className="table-secondary">
                            {question.element || "—"}
                          </span>
                        </td>
                        <td>
                          <span className="teacher-type">{question.type}</span>
                        </td>
                        <td>
                          <div className="teacher-row-actions">
                            <button
                              className="teacher-icon-action"
                              aria-label="Lihat Pratinjau"
                              title="Lihat Pratinjau"
                              onClick={() => setPreview(question)}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              className="teacher-icon-action"
                              aria-label="Edit"
                              title="Edit"
                              disabled={deleting}
                              onClick={() => {
                                setEditing(question);
                                window.scrollTo(0, 0);
                              }}
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              className="teacher-icon-action danger"
                              aria-label="Hapus"
                              title="Hapus"
                              disabled={deleting}
                              onClick={() => void remove(question)}
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
                          <Library size={25} />
                          <strong>Belum ada soal sesuai filter.</strong>
                          <p>
                            Tambahkan soal baru atau ubah pencarian dan filter.
                          </p>
                          <button className="btn-secondary" onClick={reset}>
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
              page={page}
              total={list.total}
              pageSize={pageSize}
              onChange={setPage}
              loading={list.loading}
            />
            <p className="table-caption">
              Bacaan dan pertanyaan ditulis dalam satu isi soal. Konten yang
              sudah dipakai ujian tetap mengikuti penguncian sistem.
            </p>
          </section>
        ) : (
          <Suspense
            fallback={
              <p role="status" className="teacher-loading">
                Memuat editor soal...
              </p>
            }
          >
            <QuestionEditor
              key={editing?.id || "new"}
              initial={editing}
              onCancel={() => setEditing(undefined)}
              onSaved={async () => {
                setEditing(undefined);
              }}
            />
          </Suspense>
        )}
        <ExamDialog
          open={!!preview}
          title="Pratinjau Tampilan Siswa"
          className="question-preview-dialog teacher-preview-dialog"
          onClose={() => setPreview(null)}
        >
          {preview && (
            <div className="exam-workspace teacher-preview">
              <article className="exam-question-card">
                <div className="exam-question-body">
                  <ExamQuestion
                    question={preview}
                    number={1}
                    answer={null}
                    disabled
                    onAnswer={() => {}}
                    onImage={setImage}
                  />
                </div>
              </article>
            </div>
          )}
        </ExamDialog>
        <RichImageDialog src={image} onClose={() => setImage(null)} />
      </div>
    </WorkspaceShell>
  );
};
export default GuruDashboard;
