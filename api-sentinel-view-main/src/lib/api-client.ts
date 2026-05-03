/**
 * API client for the Sentinel backend server.
 * All endpoints use POST with JSON body.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
export const API_ORIGIN = RAW_API_BASE_URL.endsWith('/api')
  ? RAW_API_BASE_URL.slice(0, -4)
  : RAW_API_BASE_URL;
export const API_BASE_URL = `${API_ORIGIN}/api`;

/**
 * In-memory token for the current session.
 * We do NOT write to localStorage — the httpOnly cookie set by the backend
 * is automatically sent by fetch() via `credentials: 'include'`.
 * This in-memory token is kept as a fallback for explicit Authorization header
 * use (e.g. mobile / API token flows).
 */
let _sessionToken: string | null = null;

// Session expiry handling
let _isRefreshing = false;
let _refreshSubscribers: ((token: string | null) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string | null) => void) {
  _refreshSubscribers.push(cb);
}

function onRefreshed(token: string | null) {
  _refreshSubscribers.forEach(cb => cb(token));
  _refreshSubscribers = [];
}

export function setToken(token: string | null) {
  _sessionToken = token;
}

export function getToken() {
  return _sessionToken;
}

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

export function buildApiUrl(path: string) {
  return `${API_BASE_URL}${normalizePath(path)}`;
}

export function buildWebSocketUrl(path: string) {
  const wsOrigin = API_ORIGIN.startsWith('https://')
    ? API_ORIGIN.replace(/^https:\/\//, 'wss://')
    : API_ORIGIN.replace(/^http:\/\//, 'ws://');
  return `${wsOrigin}${normalizePath(path)}`;
}

async function handleApiError(res: Response): Promise<never> {
  if (res.status === 401) {
    setToken(null);

    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }

    throw new ApiError(res.status, res.statusText, { detail: 'Session expired. Please log in again.' });
  }

  let errBody: unknown = null;
  try {
    const text = await res.text();
    errBody = text ? JSON.parse(text) : null;
  } catch {
    // Ignore non-JSON error bodies.
  }
  throw new ApiError(res.status, res.statusText, errBody);
}

export async function fetchWithSession(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? undefined);
  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    await handleApiError(res);
  }

  return res;
}

async function request<T>(
  path: string,
  body?: Record<string, unknown>,
  options?: { method?: string; signal?: AbortSignal },
): Promise<T> {
  const method = options?.method ?? 'POST';
  const url = buildApiUrl(path);
  const token = getToken();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
    signal: options?.signal,
  });

  if (!res.ok) {
    await handleApiError(res);
  }

  const text = await res.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/** POST JSON to API */
export function post<T = unknown>(path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return request<T>(path, body, { method: 'POST', signal });
}

/** GET from API */
export function get<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, undefined, { method: 'GET', signal });
}

/** PATCH JSON to API */
export function patch<T = unknown>(path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return request<T>(path, body, { method: 'PATCH', signal });
}

/** DELETE from API */
export function del<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, undefined, { method: 'DELETE', signal });
}
