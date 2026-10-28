import type { ReactNode } from "react";
import { AlertCircle, Info, RotateCcw, Search } from "lucide-react";

export function AdminPanel({
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
    <section className={`admin-panel ${className}`}>
      <div className="admin-panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="admin-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
export function AdminError({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="admin-error" role="alert">
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
export function AdminNotice({ children }: { children: ReactNode }) {
  return (
    <div className="admin-notice">
      <Info size={16} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
export function AdminFilters({
  search,
  onSearch,
  children,
  onReset,
}: {
  search: string;
  onSearch: (value: string) => void;
  children?: ReactNode;
  onReset: () => void;
}) {
  return (
    <div className="admin-filters">
      <label className="table-search">
        <Search size={15} aria-hidden="true" />
        <input
          className="input-field"
          aria-label="Cari data"
          placeholder="Cari nama, identitas, atau judul..."
          value={search}
          onChange={(event) => onSearch(event.target.value)}
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
