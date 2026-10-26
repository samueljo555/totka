import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useDebounced, usePagedList } from '../lib/paging';
import { Pagination } from './Pagination';
export function PackageFilter({ value, label = '', onChange }: { value: string; label?: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const host = useRef<HTMLDivElement>(null);
  const query = useDebounced(search);
  const list = usePagedList<{ id: string; name: string; mapel: string }>('/api/packages', page, 20, { search: query }, open);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const choose = (id: string, name = '') => { if (id) setLabels(old => ({ ...old, [id]: name })); onChange(id); setOpen(false); };
  return <div className="package-picker" ref={host} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
    <button className="btn-secondary package-picker-toggle" type="button" aria-label="Paket try out" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}><span>{value ? labels[value] || label || list.items.find(item => item.id === value)?.name || 'Paket terpilih' : 'Semua Paket'}</span><ChevronDown size={15} /></button>
    {open && <div className="package-picker-menu" role="dialog" aria-label="Pilih paket try out">
      <label className="table-search"><Search size={15} /><input autoFocus className="input-field" aria-label="Cari paket try out" placeholder="Cari nama paket..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <button className={`package-option${!value ? ' selected' : ''}`} type="button" onClick={() => choose('')}>Semua Paket</button>
      {list.loading ? <p role="status">Memuat paket...</p> : list.error ? <div role="alert"><p>{list.error}</p><button className="btn-secondary" onClick={() => void list.reload()}>Coba Lagi</button></div> : list.items.map(item => <button key={item.id} className={`package-option${value === item.id ? ' selected' : ''}`} type="button" onClick={() => choose(item.id, item.name)}>{item.name}<small>{item.mapel}</small></button>)}
      {!list.loading && !list.error && !list.items.length && <p>Tidak ada paket sesuai pencarian.</p>}
      <Pagination page={page} pageSize={20} total={list.total} onChange={setPage} loading={list.loading} />
    </div>}
  </div>;
}
