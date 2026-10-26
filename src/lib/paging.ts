import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number; hasMore: boolean; nextCursor: string | null }
export function queryUrl(url: string, params: Record<string, string | number | undefined> = {}) {
  const parsed = new URL(url, 'http://tka.local');
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') parsed.searchParams.delete(key);
    else parsed.searchParams.set(key, String(value));
  }
  return parsed.pathname + parsed.search;
}
export async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(url, { signal });
  let data;
  try { data = await response.json(); }
  catch { throw new Error('Respons server tidak dapat dibaca. Coba lagi.'); }
  if (!response.ok) throw new Error(data?.message || 'Gagal memuat data.');
  return data;
}
export async function readAllPages<T>(url: string, params: Record<string, string | number | undefined> = {}, options: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void } = {}): Promise<T[]> {
  const items: T[] = [];
  let after: string | undefined;
  const seen = new Set<string>();
  do {
    options.signal?.throwIfAborted();
    const data = await readJson<Page<T>>(queryUrl(url, { ...params, page: 1, pageSize: 100, after }), options.signal);
    if (!data || !Array.isArray(data.items)) throw new Error('Format data tidak sesuai. Muat ulang aplikasi.');
    if (data.hasMore && !data.nextCursor) throw new Error('Halaman ekspor belum lengkap. Coba kembali.');
    items.push(...data.items);
    options.onProgress?.(items.length, data.total);
    if (data.nextCursor && seen.has(data.nextCursor)) throw new Error('Cursor tidak bergerak. Coba kembali.');
    if (data.nextCursor) seen.add(data.nextCursor);
    after = data.nextCursor || undefined;
  } while (after);
  return items;
}
export function useDebounced<T>(value: T, delay = 300): T {
  const [current, setCurrent] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setCurrent(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return current;
}
export function usePagedList<T>(url: string, page: number, pageSize: number, params: Record<string, string | number | undefined> = {}, enabled = true) {
  const fullUrl = queryUrl(url, { ...params, page, pageSize });
  const [data, setData] = useState<Page<T>>({ items: [], total: 0, page: 1, pageSize, totalPages: 1, hasMore: false, nextCursor: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const lifecycle = useRef({ active: false });
  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return;
    const attempt = ++sequence.current;
    setLoading(true); setError('');
    try {
      const result = await readJson<Page<T>>(fullUrl, signal);
      if (lifecycle.current.active && attempt === sequence.current && !signal?.aborted) setData(result);
    } catch (failure) {
      if (lifecycle.current.active && attempt === sequence.current && !signal?.aborted) setError(failure instanceof Error ? failure.message : 'Gagal memuat data.');
    } finally { if (lifecycle.current.active && attempt === sequence.current) setLoading(false); }
  }, [enabled, fullUrl]);
  useEffect(() => {
    const controller = new AbortController();
    const life = lifecycle.current;
    life.active = enabled;
    if (enabled) void reload(controller.signal);
    else { setLoading(false); setError(''); }
    return () => { life.active = false; controller.abort(); };
  }, [reload, enabled]);
  return { ...data, loading, error, reload };
}
