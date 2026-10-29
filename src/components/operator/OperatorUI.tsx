import type { ReactNode } from "react";
import { AlertCircle, Info, RotateCcw, Search } from "lucide-react";

export function OperatorPanel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`operator-panel ${className}`}>
      <div className="operator-panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="operator-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
export function OperatorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="operator-notice">
      <Info size={16} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
export function OperatorError({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="operator-error" role="alert">
      <AlertCircle size={16} aria-hidden="true" />
      <div>
        <p>{message}</p>
        {retry && (
          <button type="button" className="btn-secondary" onClick={retry}>
            <RotateCcw size={14} />
            Coba Lagi
          </button>
        )}
      </div>
    </div>
  );
}
export function OperatorFilters({
  value,
  onChange,
  placeholder = "Cari siswa (Nama / NISN / Kelas)...",
  label = "Cari siswa",
  onReset,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  onReset: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="operator-filters">
      <label className="table-search">
        <Search size={15} aria-hidden="true" />
        <input
          className="input-field"
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {children}
      <button type="button" className="table-reset" onClick={onReset}>
        <RotateCcw size={13} />
        Reset Filter
      </button>
    </div>
  );
}
