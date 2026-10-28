import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, RefreshCw, Save, Search } from "lucide-react";
import { FormattedContent } from "../FormattedContent";
import { Pagination } from "../Pagination";
import { StatusBadge } from "../TableFrame";
import { useDebounced, usePagedList } from "../../lib/paging";
import { adminWrite } from "../../lib/admin-api";
import { AdminError, AdminNotice } from "./AdminUI";

export function AdminPackageForm({
  initial,
  userId,
  onClose,
  onSaved,
}: {
  initial: any | null;
  userId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name || ""),
    [mapel, setMapel] = useState(initial?.mapel || "Matematika");
  const [duration, setDuration] = useState(initial?.durationMinutes || 90),
    [token, setToken] = useState(
      initial?.token ||
        Math.random().toString(36).substring(2, 12).toUpperCase(),
    );
  const [navigation, setNavigation] = useState(
      initial?.navigationMode || "bebas",
    ),
    [release, setRelease] = useState(initial?.releaseScoreMode || "langsung");
  const [ids, setIds] = useState<string[]>(
    initial?.questions?.map((q: any) => q.questionId) || [],
  );
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const query = useDebounced(search),
    pageSize = 5;
  const list = usePagedList<any>("/api/questions", page, pageSize, {
    mapel,
    search: query,
  });
  const questions = list.items.filter((q) => q.mapel === mapel),
    loading = list.loading || query !== search;
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  return (
    <form
      className="admin-package-layout"
      onSubmit={async (event) => {
        event.preventDefault();
        if (request.current || loading || list.error) return;
        if (!Number.isInteger(duration) || duration <= 0) {
          setError("Durasi harus berupa bilangan bulat positif.");
          return;
        }
        const controller = new AbortController();
        request.current = controller;
        setSaving(true);
        setError("");
        try {
          await adminWrite(
            initial ? `/api/packages/${initial.id}` : "/api/packages",
            initial ? "PUT" : "POST",
            {
              name,
              mapel,
              token,
              durationMinutes: duration,
              navigationMode: navigation,
              releaseScoreMode: release,
              ...(initial ? {} : { status: "draft", createdById: userId }),
              questionIds: ids,
            },
            controller.signal,
          );
          if (!controller.signal.aborted) onSaved();
        } catch (failure) {
          if (!controller.signal.aborted)
            setError(
              failure instanceof Error
                ? failure.message
                : "Gagal menyimpan paket.",
            );
        } finally {
          if (request.current === controller) {
            request.current = null;
            setSaving(false);
          }
        }
      }}
    >
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>{initial ? "Edit Paket Ujian" : "Peracikan Paket Baru"}</h2>
            <p>Atur identitas paket, lalu pilih soal sesuai mata pelajaran.</p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={onClose}
          >
            <ArrowLeft size={14} />
            Kembali ke paket
          </button>
        </div>
        {error && <AdminError message={error} />}
        <fieldset className="admin-form-section" disabled={saving}>
          <h3 className="admin-section-title">
            <b>01</b>Identitas & konfigurasi
          </h3>
          <div className="admin-form-grid">
            <label className="admin-full">
              Nama Paket
              <input
                className="input-field"
                placeholder="Contoh: Try Out Nasional MTK 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label>
              Mata Pelajaran
              <select
                className="input-field"
                aria-label="Mata Pelajaran"
                value={mapel}
                onChange={(e) => {
                  setMapel(e.target.value);
                  setIds([]);
                  setPage(1);
                  setSearch("");
                }}
              >
                <option>Matematika</option>
                <option>Bahasa Indonesia</option>
              </select>
            </label>
            <label>
              Durasi Waktu (Menit)
              <input
                className="input-field"
                type="number"
                min={1}
                step={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                required
              />
            </label>
            <label className="admin-full">
              Token Ujian
              <div className="admin-token-field">
                <input
                  className="input-field"
                  aria-label="Token Ujian"
                  placeholder="Contoh: BATCH1MTK"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn-secondary"
                  aria-label="Generate Token Baru"
                  onClick={() =>
                    setToken(
                      Math.random().toString(36).substring(2, 12).toUpperCase(),
                    )
                  }
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            </label>
            <label>
              Mode Navigasi
              <select
                className="input-field"
                aria-label="Mode Navigasi"
                value={navigation}
                onChange={(e) => setNavigation(e.target.value)}
              >
                <option value="bebas">Bebas (bisa mundur)</option>
                <option value="maju_terus">
                  Maju Terus (tidak bisa mundur)
                </option>
              </select>
            </label>
            <label>
              Opsi Perilisan Nilai
              <select
                className="input-field"
                aria-label="Opsi Perilisan Nilai"
                value={release}
                onChange={(e) => setRelease(e.target.value)}
              >
                <option value="langsung">Langsung setelah ujian selesai</option>
                <option value="tertunda">Sembunyikan / rilis ditunda</option>
              </select>
            </label>
          </div>
        </fieldset>
        <fieldset className="admin-form-section" disabled={saving}>
          <h3 className="admin-section-title">
            <b>02</b>Pilih Soal {mapel}
          </h3>
          <p className="admin-help">
            Hanya soal dari mata pelajaran yang dipilih ditampilkan. Pilihan
            tetap tersimpan saat berpindah halaman.
          </p>
          <label className="table-search admin-question-search">
            <Search size={15} aria-hidden="true" />
            <input
              className="input-field"
              aria-label="Cari soal paket"
              placeholder="Cari teks soal..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <div className="admin-question-list" aria-busy={loading}>
            {list.error ? (
              <AdminError
                message={list.error}
                retry={() => void list.reload()}
              />
            ) : loading ? (
              <p className="admin-loading" role="status">
                Memuat soal {mapel}...
              </p>
            ) : !questions.length ? (
              <div className="admin-empty">
                <Search size={22} />
                <h3>Belum ada soal {mapel} yang sesuai.</h3>
                <p>Coba ubah pencarian atau siapkan soal pada bank soal.</p>
              </div>
            ) : (
              questions.map((q) => (
                <label
                  key={q.id}
                  className={`admin-question-choice${ids.includes(q.id) ? " selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Pilih soal ${q.id}`}
                    checked={ids.includes(q.id)}
                    onChange={(e) =>
                      setIds((old) =>
                        e.target.checked
                          ? [...old, q.id]
                          : old.filter((id) => id !== q.id),
                      )
                    }
                  />
                  <div>
                    <small>ID: {q.id.substring(0, 8)}</small>
                    <div className="admin-question-preview">
                      <FormattedContent value={q.content || ""} />
                    </div>
                    <div className="admin-question-tags">
                      <span className="tag">{q.type}</span>
                      <span className="tag">{q.element}</span>
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
          <Pagination
            page={page}
            total={list.total}
            pageSize={pageSize}
            onChange={setPage}
            loading={loading}
          />
        </fieldset>
        <div className="admin-form-footer">
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={onClose}
          >
            Batal
          </button>
          <button className="btn" disabled={saving || loading || !!list.error}>
            <Save size={15} />
            {saving ? "Menyimpan..." : "Simpan Paket Try Out"}
          </button>
        </div>
      </section>
      <aside className="admin-package-summary">
        <div className="admin-panel">
          <div className="admin-panel-heading">
            <h2>Ringkasan paket</h2>
            <Check size={16} />
          </div>
          <div className="admin-summary-body">
            <div className="admin-line">
              <span>Mata pelajaran</span>
              <strong>{mapel}</strong>
            </div>
            <div className="admin-line">
              <span>Soal dipilih</span>
              <strong>{ids.length} soal dipilih</strong>
            </div>
            <div className="admin-line">
              <span>Durasi</span>
              <strong>{duration} menit</strong>
            </div>
            <div className="admin-line">
              <span>Status</span>
              <StatusBadge
                value={
                  initial?.status === "aktif"
                    ? "Aktif"
                    : initial?.status || "draft"
                }
              />
            </div>
            <AdminNotice>
              {initial
                ? "Perubahan isi paket yang sudah dipakai ujian mengikuti penguncian sistem. Status paket diatur melalui daftar paket."
                : "Paket baru disimpan sebagai draft. Periksa soal dan kunci sebelum membuka ujian."}
            </AdminNotice>
          </div>
        </div>
      </aside>
    </form>
  );
}
