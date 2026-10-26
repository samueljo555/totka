import { useState } from 'react';
import { useDebounced, usePagedList } from '../lib/paging';
export function RemoteSelect({ url, value, onChange, valueField = 'id', labelField = 'name', placeholder, includeUnknown = false }: { url: string; value: string; onChange: (value: string) => void; valueField?: string; labelField?: string; placeholder: string; includeUnknown?: boolean }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const data = usePagedList<Record<string, string>>(url, 1, 50, { search: debounced });
  return <div className="remote-select">
    <input className="input-field mb-2" aria-label={`Cari ${placeholder}`} placeholder={`Cari ${placeholder}...`} value={search} onChange={event => setSearch(event.target.value)} />
    <select aria-label={placeholder} className="input-field" value={value} onChange={event => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {includeUnknown && <option value="UNKNOWN">Tanpa Sekolah</option>}
      {value && value !== 'UNKNOWN' && !data.items.some(item => item[valueField] === value) && <option value={value}>Pilihan tersimpan</option>}
      {data.items.map(item => <option key={item[valueField]} value={item[valueField]}>{item[labelField]}</option>)}
    </select>
    {data.total > 50 && <small>Persempit pencarian untuk menemukan pilihan lainnya.</small>}
    {data.error && <small role="alert">{data.error}</small>}
  </div>;
}
