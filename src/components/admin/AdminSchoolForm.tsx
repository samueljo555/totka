import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import { ExamDialog } from "../ExamDialog";
import { adminWrite } from "../../lib/admin-api";
import { AdminError, AdminNotice } from "./AdminUI";

export function AdminSchoolForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [npsn, setNpsn] = useState(initial?.npsn || ""),
    [name, setName] = useState(initial?.name || ""),
    [region, setRegion] = useState(initial?.region || "");
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
      title={initial ? "Edit Sekolah" : "Tambah Sekolah Baru"}
      className="admin-form-dialog"
      busy={saving}
      onClose={onClose}
    >
      <p className="admin-dialog-description">
        Identitas sekolah peserta dan wilayah penyelenggaraan.
      </p>
      {error && <AdminError message={error} />}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (request.current) return;
          const controller = new AbortController();
          request.current = controller;
          setSaving(true);
          setError("");
          try {
            await adminWrite(
              initial ? `/api/schools/${initial.npsn}` : "/api/schools",
              initial ? "PUT" : "POST",
              { npsn, name, region },
              controller.signal,
            );
            if (!controller.signal.aborted) onSaved();
          } catch (failure) {
            if (!controller.signal.aborted)
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Gagal menyimpan sekolah.",
              );
          } finally {
            if (request.current === controller) {
              request.current = null;
              setSaving(false);
            }
          }
        }}
      >
        <fieldset className="admin-form-grid" disabled={saving}>
          <label>
            NPSN
            <input
              className="input-field"
              placeholder="Contoh: 20101234"
              value={npsn}
              onChange={(e) => setNpsn(e.target.value)}
              disabled={!!initial}
              inputMode="numeric"
              required
            />
          </label>
          <label>
            Nama Sekolah / Instansi
            <input
              className="input-field"
              placeholder="Contoh: SD Negeri Harapan 01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="admin-full">
            Wilayah (Opsional)
            <input
              className="input-field"
              placeholder="Contoh: Jakarta Selatan"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </label>
        </fieldset>
        {!initial && (
          <AdminNotice>
            Akun operator sekolah dibuat mengikuti proses pendaftaran sekolah
            yang tersedia.
          </AdminNotice>
        )}
        <div className="admin-form-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </button>
          <button className="btn" disabled={saving}>
            <Save size={15} />
            {saving ? "Menyimpan..." : "Simpan Data Sekolah"}
          </button>
        </div>
      </form>
    </ExamDialog>
  );
}
