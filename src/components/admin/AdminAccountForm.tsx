import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import { ExamDialog } from "../ExamDialog";
import { RemoteSelect } from "../RemoteSelect";
import { readJson } from "../../lib/paging";
import { adminWrite, roleNames } from "../../lib/admin-api";
import { AdminError, AdminNotice } from "./AdminUI";

export function AdminAccountForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(initial?.username || ""),
    [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(initial?.fullName || ""),
    [role, setRole] = useState(initial?.role || "operator"),
    [school, setSchool] = useState(initial?.schoolNpsn || "");
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [cardError, setCardError] = useState("");
  const [loadingCard, setLoadingCard] = useState(initial?.role === "siswa");
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    if (initial?.role !== "siswa") return;
    const controller = new AbortController();
    let active = true;
    readJson<{ loginPassword: string }>(
      `/api/users/${initial.id}/login-card`,
      controller.signal,
    )
      .then((data) => {
        if (active) setPassword(data.loginPassword || "");
      })
      .catch(() => {
        if (active)
          setCardError(
            "Password kartu belum dapat dimuat. Anda tetap dapat mengatur password baru atau membiarkannya kosong.",
          );
      })
      .finally(() => {
        if (active) setLoadingCard(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [initial]);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  const title = initial ? "Edit Akun Pengguna" : "Tambah Akun Pengguna";
  return (
    <ExamDialog
      open
      title={title}
      className="admin-form-dialog"
      busy={saving}
      onClose={onClose}
    >
      <p className="admin-dialog-description">
        Lengkapi identitas dan peran pengguna. Sekolah dapat dipilih sesuai
        penugasannya.
      </p>
      {error && <AdminError message={error} />}
      {cardError && <AdminNotice>{cardError}</AdminNotice>}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (request.current || loadingCard) return;
          const controller = new AbortController();
          request.current = controller;
          setSaving(true);
          setError("");
          try {
            await adminWrite(
              initial ? `/api/users/${initial.id}` : "/api/users",
              initial ? "PUT" : "POST",
              { username, password, fullName, role, schoolNpsn: school },
              controller.signal,
            );
            if (!controller.signal.aborted) onSaved();
          } catch (failure) {
            if (!controller.signal.aborted)
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Gagal menyimpan akun.",
              );
          } finally {
            if (request.current === controller) {
              request.current = null;
              setSaving(false);
            }
          }
        }}
      >
        <fieldset className="admin-form-grid" disabled={saving || loadingCard}>
          <label>
            Nama Lengkap / Nama Institusi
            <input
              className="input-field"
              placeholder="Ketik nama pengguna"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
          <label>
            Username
            <input
              className="input-field"
              placeholder="Ketik username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Peran (Role)
            <select
              className="input-field"
              aria-label="Peran (Role)"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {(initial
                ? ["operator", "guru", "super_admin", "admin", "siswa"]
                : ["operator", "guru", "super_admin"]
              ).map((value) => (
                <option key={value} value={value}>
                  {roleNames[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Password
            <input
              type={initial?.role === "siswa" ? "text" : "password"}
              className="input-field"
              placeholder={
                initial
                  ? "Kosongkan untuk mempertahankan password"
                  : "Ketik password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!initial}
              autoComplete="new-password"
            />
          </label>
          {["operator", "guru", "siswa"].includes(role) && (
            <div className="admin-field admin-full">
              <span>Sekolah / Instansi (Opsional)</span>
              <RemoteSelect
                url="/api/schools"
                value={school}
                onChange={setSchool}
                valueField="npsn"
                placeholder="Pilih sekolah"
              />
            </div>
          )}
        </fieldset>
        {loadingCard && (
          <p className="admin-loading" role="status">
            Memuat password kartu siswa...
          </p>
        )}
        <div className="admin-form-footer">
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={onClose}
          >
            Batal
          </button>
          <button className="btn" disabled={saving || loadingCard}>
            <Save size={15} />
            {saving
              ? "Menyimpan..."
              : initial
                ? "Simpan Perubahan"
                : "Simpan Data Pengguna"}
          </button>
        </div>
      </form>
    </ExamDialog>
  );
}
