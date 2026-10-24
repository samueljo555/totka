export function Pagination({ page, total, pageSize, onChange, loading = false }: { page: number; total: number; pageSize: number; onChange: (page: number) => void; loading?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1 && page === 1) return null;
  return <div className="flex items-center justify-between gap-4 mt-4" aria-label="Navigasi halaman">
    <button className="btn-secondary" disabled={loading || page <= 1} onClick={() => onChange(page - 1)}>Sebelumnya</button>
    <span>Halaman {page} dari {pages} · {total} data</span>
    <button className="btn-secondary" disabled={loading || page >= pages} onClick={() => onChange(page + 1)}>Selanjutnya</button>
  </div>;
}
