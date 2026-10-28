import { useEffect, useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { ExamDialog } from "../ExamDialog";
import { adminWrite } from "../../lib/admin-api";
import { AdminError, AdminNotice } from "./AdminUI";

type School = { npsn: string; name: string; region: string };
export function AdminSchoolImport({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<School[]>([]),
    [filename, setFilename] = useState(""),
    [skipped, setSkipped] = useState(0);
  const [error, setError] = useState(""),
    [reading, setReading] = useState(false),
    [saving, setSaving] = useState(false);
  const attempt = useRef(0),
    request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      attempt.current++;
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  return (
    <ExamDialog
      open
      title="Impor Data Sekolah"
      className="admin-form-dialog admin-import-dialog"
      busy={saving}
      onClose={onClose}
    >
      <p className="admin-dialog-description">
        Periksa data contoh sebelum mengirim seluruh baris ke sistem.
      </p>
      {error && <AdminError message={error} />}
      <label className="admin-upload">
        <FileUp size={28} />
        <strong>Pilih file CSV</strong>
        <span>Urutan kolom: npsn,name,region · Header boleh disertakan.</span>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="File CSV sekolah"
          disabled={saving}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const current = ++attempt.current;
            setRows([]);
            setFilename(file.name);
            setError("");
            setSkipped(0);
            setReading(true);
            try {
              const lines = (await file.text())
                .replace(/^\uFEFF/, "")
                .split(/\r?\n/)
                .filter((line) => line.trim());
              if (current !== attempt.current) return;
              const data = lines[0]?.toLowerCase().includes("npsn")
                ? lines.slice(1)
                : lines;
              const parsed = data.map((line) => {
                const [npsn, name, region] = line.split(",");
                return {
                  npsn: npsn?.trim() || "",
                  name: name?.trim() || "",
                  region: region?.trim() || "",
                };
              });
              const valid = parsed.filter((row) => row.npsn && row.name);
              setRows(valid);
              setSkipped(parsed.length - valid.length);
              if (!valid.length)
                setError(
                  "CSV kosong atau tidak memiliki NPSN dan nama sekolah yang lengkap.",
                );
            } catch {
              if (current === attempt.current)
                setError("File belum dapat dibaca. Silakan pilih ulang.");
            } finally {
              if (current === attempt.current) setReading(false);
            }
          }}
        />
      </label>
      {reading && (
        <p role="status" className="admin-loading">
          Membaca file...
        </p>
      )}
      {!!rows.length && (
        <>
          <p className="admin-help">
            {filename} · {rows.length} sekolah siap diimpor
            {skipped ? ` · ${skipped} baris tidak lengkap dilewati` : ""}.
          </p>
          <div className="admin-import-preview">
            <table>
              <thead>
                <tr>
                  <th>NPSN</th>
                  <th>Nama sekolah</th>
                  <th>Wilayah</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    <td className="table-mono">{r.npsn}</td>
                    <td>{r.name}</td>
                    <td>{r.region || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-help">
            Pratinjau menampilkan maksimal lima baris pertama. Seluruh{" "}
            {rows.length} baris valid akan dikirim.
          </p>
        </>
      )}
      <AdminNotice>
        Gunakan CSV sederhana tanpa koma di dalam nama atau wilayah. Akun
        operator mengikuti proses impor sekolah yang sudah tersedia.
      </AdminNotice>
      <div className="admin-form-footer">
        <button className="btn-secondary" disabled={saving} onClick={onClose}>
          Batal
        </button>
        <button
          className="btn"
          disabled={saving || reading || !rows.length}
          onClick={async () => {
            if (request.current) return;
            const controller = new AbortController();
            request.current = controller;
            setSaving(true);
            setError("");
            try {
              await adminWrite(
                "/api/schools/batch",
                "POST",
                { schools: rows },
                controller.signal,
              );
              if (!controller.signal.aborted) onSaved();
            } catch (failure) {
              if (!controller.signal.aborted)
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Impor belum berhasil.",
                );
            } finally {
              if (request.current === controller) {
                request.current = null;
                setSaving(false);
              }
            }
          }}
        >
          <Upload size={15} />
          {saving ? "Mengimpor..." : "Impor Sekolah"}
        </button>
      </div>
    </ExamDialog>
  );
}
