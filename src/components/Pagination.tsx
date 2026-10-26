import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
export function Pagination({ page, total, pageSize, onChange, loading = false }: { page: number; total: number; pageSize: number; onChange: (page: number) => void; loading?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { if (!loading && page > pages) onChange(pages); }, [loading, page, pages, onChange]);
  const visible = [...new Set([1, ...Array.from({ length: 5 }, (_, i) => page - 2 + i).filter(n => n > 1 && n < pages), pages])];
  return <div className="table-pagination" aria-label="Navigasi halaman">
    <span role="status">Menampilkan <strong>{total ? Math.min((page - 1) * pageSize + 1, total) : 0}–{Math.min(page * pageSize, total)}</strong> dari <strong>{total.toLocaleString('id-ID')}</strong> entri <span className="pagination-page-label">· Halaman {page} dari {pages}</span></span>
    <nav aria-label="Halaman tabel"><button type="button" aria-label="Halaman sebelumnya" disabled={loading || page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={14} /></button>
      {visible.map((number, i) => <span key={number} className="page-number-group">{i > 0 && number - visible[i - 1]! > 1 && <span className="page-ellipsis">…</span>}<button type="button" aria-label={`Halaman ${number}`} aria-current={number === page ? 'page' : undefined} disabled={loading} onClick={() => onChange(number)}>{number}</button></span>)}
      <button type="button" aria-label="Halaman berikutnya" disabled={loading || page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={14} /></button></nav>
  </div>;
}
