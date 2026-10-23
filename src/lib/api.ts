const TOKEN_KEY = 'tka_jwt_token';
const TOKEN_TIME_KEY = 'tka_token_created_at';
const LAST_ACTIVITY_KEY = 'tka_last_activity_at';

export const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8 jam (batas absolut sesi)
export const IDLE_TIMEOUT = 30 * 60 * 1000;        // 30 menit (batas tidak aktif)

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    const now = Date.now().toString();
    localStorage.setItem(TOKEN_TIME_KEY, now);
    localStorage.setItem(LAST_ACTIVITY_KEY, now);
  } catch (e) {
    console.error('Failed to save JWT token:', e);
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_TIME_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch (e) {
    console.error('Failed to clear JWT token:', e);
  }
}

export function resetActivityTimer(): void {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  } catch {}
}

export function isTokenExpired(): boolean {
  try {
    const timeStr = localStorage.getItem(TOKEN_TIME_KEY);
    if (!timeStr) return false;
    const createdAt = parseInt(timeStr, 10);
    return Date.now() - createdAt > SESSION_TIMEOUT;
  } catch {
    return false;
  }
}

export function isIdleTimeoutExceeded(): boolean {
  try {
    const lastActivityStr = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!lastActivityStr) return false;
    const lastActivity = parseInt(lastActivityStr, 10);
    return Date.now() - lastActivity > IDLE_TIMEOUT;
  } catch {
    return false;
  }
}

export function authHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

type SessionExpiredHandler = (message?: string) => void;
let onSessionExpiredCallback: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpiredCallback = handler;
}

export function triggerSessionExpired(message?: string): void {
  clearToken();
  if (onSessionExpiredCallback) {
    onSessionExpiredCallback(message || 'Sesi Anda telah berakhir. Silakan login kembali.');
  }
}

// Simpan fungsi fetch asli browser
const nativeFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch;

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  // Cek masa kedaluwarsa sesi sisi klien
  if (getToken()) {
    if (isTokenExpired()) {
      triggerSessionExpired('Sesi login 8 jam telah berakhir. Silakan login kembali.');
      throw new Error('SESSION_EXPIRED');
    }
    if (isIdleTimeoutExceeded()) {
      triggerSessionExpired('Anda tidak aktif selama lebih dari 30 menit. Sesi otomatis ditutup.');
      throw new Error('IDLE_TIMEOUT');
    }
  }

  // Perbarui timestamp aktivitas setiap kali melakukan API call
  resetActivityTimer();

  const token = getToken();
  const headers = new Headers(init.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await nativeFetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    let data: any = null;
    try {
      const clone = response.clone();
      data = await clone.json();
    } catch {}

    if (data?.error === 'TOKEN_EXPIRED') {
      triggerSessionExpired(data.message || 'Sesi login telah berakhir. Silakan login kembali.');
    } else if (data?.error === 'UNAUTHORIZED') {
      triggerSessionExpired(data.message || 'Token otentikasi tidak valid atau telah usang.');
    }
  }

  return response;
}

// Inisialisasi otomatis: Pasang interceptor global ke window.fetch
if (typeof window !== 'undefined') {
  window.fetch = async function (input: RequestInfo | URL, init: RequestInit = {}) {
    const url = typeof input === 'string' 
      ? input 
      : (input instanceof URL ? input.toString() : (input as Request).url);

    // Otomatis intersep semua rute /api
    if (url && (url.startsWith('/api') || url.includes('/api/'))) {
      return apiFetch(input, init);
    }
    return nativeFetch(input, init);
  };
}
