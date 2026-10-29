import { useEffect, useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { ExamDialog } from "../ExamDialog";
import { OperatorError, OperatorNotice } from "./OperatorUI";
import { writeStudent } from "../../lib/operator-api";

type Student = { nisn: string; fullName: string; className: string };
export function StudentImport({
  schoolNpsn,
  onClose,
  onSaved,
}: {
  schoolNpsn?: string;
  onClose: () => void;
  onSaved: (data: any) => void;
}) {
  const [rows, setRows] = useState<Student[]>([]),
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
      title="Impor Data Siswa"
      className="operator-form-dialog operator-import-dialog"
      busy={saving}
      onClose={onClose}
    >
      <p className="operator-dialog-description">
        Periksa data sebelum mengimpor siswa ke sekolah Anda.
      </p>
      {error && <OperatorError message={error} />}
      <label className="operator-upload">
        <FileUp size={28} />
        <strong>Pilih file CSV</strong>
        <span>
          Urutan kolom: nisn,fullName,className · Header boleh disertakan.
        </span>
        <input
          type="file"
          aria-label="File CSV siswa"
          accept=".csv,text/csv"
          disabled={saving}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const current = ++attempt.current;
            setRows([]);
            setError("");
            setFilename(file.name);
            setSkipped(0);
            setReading(true);
            try {
              const lines = (await file.text())
                .replace(/^\uFEFF/, "")
                .split(/\r?\n/)
                .filter((line) => line.trim());
              if (current !== attempt.current) return;
              const data = lines[0]?.toLowerCase().includes("nisn")
                ? lines.slice(1)
                : lines;
              const parsed = data.map((line) => {
                const [nisn, fullName, className] = line.split(",");
                return {
                  nisn: nisn?.trim() || "",
                  fullName: fullName?.trim() || "",
                  className: className?.trim() || "",
                };
              });
              const valid = parsed.filter((row) => row.nisn && row.fullName);
              setRows(valid);
              setSkipped(parsed.length - valid.length);
              if (!valid.length)
                setError(
                  "CSV kosong atau tidak memiliki NISN dan nama siswa yang lengkap.",
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
        <p className="operator-loading" role="status">
          Membaca file...
        </p>
      )}
      {!!rows.length && (
        <>
          <p className="operator-help">
            {filename} · {rows.length} baris siap dikirim
            {skipped ? ` · ${skipped} baris tidak lengkap dilewati` : ""}.
          </p>
          <div className="operator-import-preview">
            <table>
              <thead>
                <tr>
                  <th>NISN</th>
                  <th>Nama lengkap</th>
                  <th>Kelas</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, index) => (
                  <tr key={index}>
                    <td className="table-mono">{row.nisn}</td>
                    <td>{row.fullName}</td>
                    <td>{row.className || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="operator-help">
            Pratinjau menampilkan lima baris pertama. Jumlah siswa baru
            mengikuti hasil impor dari server.
          </p>
        </>
      )}
      <OperatorNotice>
        Gunakan CSV sederhana tanpa koma di dalam nilai kolom. Password 6
        karakter dibuat oleh sistem dan tersedia pada kartu login; akun yang
        sudah terdaftar tidak diatur ulang oleh impor.
      </OperatorNotice>
      <div className="operator-form-footer">
        <button
          type="button"
          className="btn-secondary"
          disabled={saving}
          onClick={onClose}
        >
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
              const data = await writeStudent(
                "/api/users/siswa/batch",
                { students: rows, schoolNpsn },
                controller.signal,
              );
              if (!controller.signal.aborted) onSaved(data);
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
          {saving ? "Mengimpor..." : "Impor Siswa"}
        </button>
      </div>
    </ExamDialog>
  );
}
