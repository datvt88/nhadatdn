const PUBLIC_API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

function deriveServerApiBase(publicApiBase: string): string {
  const explicitServerBase = process.env.API_BASE_SERVER ?? process.env.INTERNAL_API_BASE;
  if (explicitServerBase) return explicitServerBase;

  // In Docker, "localhost" points to the frontend container itself.
  // Fallback to host.docker.internal so SSR can reach mapped API port 3002.
  if (publicApiBase.includes('://localhost')) {
    return publicApiBase.replace('://localhost', '://host.docker.internal');
  }
  return publicApiBase;
}

const SERVER_API_BASE = deriveServerApiBase(PUBLIC_API_BASE);

function resolveApiBase(): string {
  if (typeof window === 'undefined') return SERVER_API_BASE;

  // When frontend is opened via HTTPS tunnel/domain, avoid hardcoded localhost API.
  // If NEXT_PUBLIC_API_BASE still points to localhost, fallback to same-origin /api.
  const base = PUBLIC_API_BASE.trim();
  const isLocalhostBase = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(base);
  const browserHost = window.location.hostname.toLowerCase();
  const isBrowserLocalhost = browserHost === 'localhost' || browserHost === '127.0.0.1';

  if (isLocalhostBase && !isBrowserLocalhost) {
    return '/api';
  }
  return base;
}

export const API_BASE = resolveApiBase();

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? 'GET';
  const shouldApplyDefaultRevalidate = method === 'GET' && init?.cache !== 'no-store' && init?.next === undefined;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    ...(shouldApplyDefaultRevalidate ? { next: { revalidate: 300 } } : {}),
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

export async function fetchJsonOr<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    return await fetchJson<T>(path, init);
  } catch {
    return fallback;
  }
}

export async function fetchTextOr(path: string, fallback: string, init?: RequestInit): Promise<string> {
  try {
    const method = init?.method?.toUpperCase() ?? 'GET';
    const shouldApplyDefaultRevalidate = method === 'GET' && init?.cache !== 'no-store' && init?.next === undefined;
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      ...(shouldApplyDefaultRevalidate ? { next: { revalidate: 300 } } : {}),
    });
    if (!res.ok) return fallback;
    return await res.text();
  } catch {
    return fallback;
  }
}

