import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import { ExamDialog } from "../ExamDialog";
import { OperatorError, OperatorNotice } from "./OperatorUI";
import { writeStudent } from "../../lib/operator-api";

export function StudentForm({
  schoolNpsn,
  schoolName,
  onClose,
  onSaved,
}: {
  schoolNpsn?: string;
  schoolName?: string;
  onClose: () => void;
  onSaved: (data: any) => void;
}) {
  const [nisn, setNisn] = useState(""),
    [fullName, setFullName] = useState(""),
    [className, setClassName] = useState("");
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  return (
    <ExamDialog
      open
      title="Formulir Pendaftaran Siswa"
      className="operator-form-dialog"
      busy={saving}
      onClose={onClose}
    >
      <p className="operator-dialog-description">
        Daftarkan siswa pada {schoolName || "sekolah akun operator Anda"}. NISN
        digunakan sebagai username.
      </p>
      {error && <OperatorError message={error} />}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (request.current) return;
          const controller = new AbortController();
          request.current = controller;
          setSaving(true);
          setError("");
          try {
            const data = await writeStudent(
              "/api/users/siswa",
              { nisn, fullName, className, schoolNpsn },
              controller.signal,
            );
            if (!controller.signal.aborted) onSaved(data);
          } catch (failure) {
            if (!controller.signal.aborted)
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Gagal menyimpan siswa.",
              );
          } finally {
            if (request.current === controller) {
              request.current = null;
              setSaving(false);
            }
          }
        }}
      >
        <fieldset className="operator-form-grid" disabled={saving}>
          <label>
            NISN
            <input
              className="input-field"
              placeholder="Contoh: 0091234567"
              value={nisn}
              onChange={(e) => setNisn(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              required
            />
          </label>
          <label>
            Nama Lengkap
            <input
              className="input-field"
              placeholder="Ketik nama lengkap siswa"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
          <label className="operator-full">
            Kelas
            <input
              className="input-field"
              placeholder="Ketik nama kelas (mis. 6A, VII-B)"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            />
          </label>
        </fieldset>
        <OperatorNotice>
          Password dibuat otomatis sebanyak 6 karakter dan tetap tersedia pada
          kartu login. NISN dan kelas disimpan sesuai isian Anda.
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
          <button className="btn" disabled={saving}>
            <Save size={15} />
            {saving ? "Menyimpan..." : "Simpan Data Siswa"}
          </button>
        </div>
      </form>
    </ExamDialog>
  );
}
