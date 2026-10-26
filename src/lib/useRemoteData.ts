import { useEffect, useState } from 'react';
import { readJson } from './paging';

// Associate each result with its URL, including the render before effect cleanup.
export function useRemoteData<T>(url: string | null, validate: (data: T) => boolean) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ url: string | null; attempt: number; data: T | null; error: string }>({ url: null, attempt: 0, data: null, error: '' });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let active = true;
    setState({ url, attempt, data: null, error: '' });
    readJson<T>(url, controller.signal).then(data => {
      if (!validate(data)) throw new Error('Format data analitik tidak sesuai. Coba muat ulang.');
      if (active) setState({ url, attempt, data, error: '' });
    }).catch(error => {
      if (active) setState({ url, attempt, data: null, error: error instanceof Error ? error.message : 'Gagal memuat analitik.' });
    });
    return () => { active = false; controller.abort(); };
  }, [url, attempt, validate]);
  const current = state.url === url && state.attempt === attempt;
  return { data: current ? state.data : null, error: current ? state.error : '', retry: () => setAttempt(value => value + 1) };
}
