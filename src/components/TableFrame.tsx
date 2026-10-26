import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { readAllPages } from '../lib/paging';
import { downloadCsv, serializeCsv } from '../lib/analytics-csv';
import { ArrowDownUp, Download, ListFilter, Rows3 } from 'lucide-react';

export interface TableExport { url: string; params?: Record<string, string | number | undefined>; filename: string; columns: { title: string; value: (row: any) => unknown }[]; disabled?: boolean }

export function TableFrame({ children, total, pageSize, onPageSize, label = 'Tabel data', sort, onSort, sortLabel = 'Nama', exportOptions }: {
  children: ReactNode; total?: number; pageSize?: number; onPageSize?: (size: number) => void; label?: string; sort?: string; onSort?: (sort: string) => void; sortLabel?: string; exportOptions?: TableExport;
}) {
  const [compact, setCompact] = useState(false);
  const [progress, setProgress] = useState('');
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => () => exportController.current?.abort(), []);
  const exportCsv = async () => {
    if (!exportOptions || exportController.current) return;
    const controller = new AbortController(); exportController.current = controller; setProgress('Mengunduh CSV...');
    try {
      const rows = await readAllPages<any>(exportOptions.url, exportOptions.params, { signal: controller.signal, onProgress: (loaded, total) => { if (!controller.signal.aborted) setProgress(`${loaded.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} baris dimuat`); } });
      controller.signal.throwIfAborted();
      downloadCsv(serializeCsv([exportOptions.columns.map(column => column.title), ...rows.map(row => exportOptions.columns.map(column => column.value(row)))]), exportOptions.filename);
      toast.success('CSV berhasil diunduh.');
    } catch (error) { if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : 'Gagal mengunduh CSV.'); }
    finally { if (!controller.signal.aborted) setProgress(''); exportController.current = null; }
  };
  return <div className={`table-frame${compact ? ' table-compact' : ''}`}>
    <div className="table-toolbar"><span className="table-counter"><ListFilter size={14} />{total === undefined ? label : `${total.toLocaleString('id-ID')} entri`}</span>
      <div className="table-toolbar-actions">{exportOptions && <button className="btn-secondary" disabled={!!progress || exportOptions.disabled || total === 0} onClick={() => void exportCsv()}><Download size={14} />{progress ? 'Mengunduh CSV...' : 'Unduh CSV'}</button>}{onSort && <select aria-label={`Urutkan ${label}`} value={sort} onChange={event => onSort(event.target.value)}><option value="name_asc">{sortLabel} A–Z</option><option value="name_desc">{sortLabel} Z–A</option></select>}<button type="button" className="btn-secondary" aria-pressed={compact} onClick={() => setCompact(value => !value)}><Rows3 size={14} />{compact ? 'Nyaman' : 'Ringkas'}</button>
        {onPageSize && <label>Tampilkan <select aria-label={`Jumlah baris ${label}`} value={pageSize} onChange={event => onPageSize(Number(event.target.value))}>{[5, 10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select> baris</label>}
      </div>
    </div>
    {progress && <p className="export-progress" role="status">{progress}. Tunggu hingga seluruh halaman selesai.</p>}
    <div className="data-table-scroll" role="region" aria-label={label} tabIndex={0}>{children}</div>
  </div>;
}
export function StatusBadge({ value }: { value: string }) {
  const color = ['Selesai', 'Aktif', 'Mudah'].includes(value) ? 'green' : ['Sedang Mengerjakan', 'Sedang', 'draft'].includes(value) ? 'amber' : value === 'Sulit' ? 'red' : 'gray';
  return <span className={`status-badge status-${color}`}>{value}</span>;
}

export function SortableHeading({ title, sort, onSort }: { title: string; sort: string; onSort: (sort: string) => void }) {
  return <th scope="col" aria-sort={sort === 'name_desc' ? 'descending' : 'ascending'}><button className="table-sort" onClick={() => onSort(sort === 'name_asc' ? 'name_desc' : 'name_asc')}>{title}<ArrowDownUp size={12} /></button></th>;
}
export function TableState({ loading, error, columns, retry }: { loading: boolean; error: string; columns: number; retry: () => void }) {
  return <tr><td colSpan={columns}><div className="table-empty" role={error ? 'alert' : 'status'}>{error ? <><strong>Data belum berhasil dimuat</strong><p>{error}</p><button className="btn-secondary" onClick={retry}>Coba Lagi</button></> : loading ? 'Memuat data...' : 'Belum ada data.'}</div></td></tr>;
}
