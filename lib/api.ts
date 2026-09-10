const PUBLIC_API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '/api').trim();

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function deriveSiteOrigin(): string | null {
  const explicitSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicitSite && isAbsoluteHttpUrl(explicitSite)) {
    return trimTrailingSlash(explicitSite);
  }

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (!vercelHost) return null;
  const normalized = vercelHost.startsWith('http://') || vercelHost.startsWith('https://') ? vercelHost : `https://${vercelHost}`;
  return trimTrailingSlash(normalized);
}

function deriveServerApiBase(publicApiBase: string): string {
  const explicitServerBase = process.env.API_BASE_SERVER?.trim() || process.env.INTERNAL_API_BASE?.trim();
  if (explicitServerBase) return trimTrailingSlash(explicitServerBase);

  if (publicApiBase.includes('://localhost')) {
    return trimTrailingSlash(publicApiBase.replace('://localhost', '://host.docker.internal'));
  }

  if (isAbsoluteHttpUrl(publicApiBase)) {
    return trimTrailingSlash(publicApiBase);
  }

  // Goi thang backend qua API_PROXY_ORIGIN thay vi vong lai qua chinh domain cua minh.
  //
  // Truoc day nhanh nay tra ve `https://nhadatdn.net/api`, tuc la ham SSR/ISR tren
  // Vercel phai goi nguoc ve domain public cua chinh no roi moi qua rewrite -> tunnel
  // -> may local. Luc build/regenerate, cu goi vong nay hay that bai, va vi fetchJsonOr
  // nuot loi nen ket qua la sitemap sinh ra RONG ma khong bao gi. Da quan sat that:
  // sau khi deploy sitemap dong, /sitemap.xml van chi co 4 URL tinh.
  //
  // API_PROXY_ORIGIN chinh la origin backend that (https://api.nhadatdn.net tren Vercel,
  // http://public-api:3002 khi chay frontend trong docker), nen dung no vua dung vua
  // bot mot chang mang.
  const proxyOrigin = trimTrailingSlash(process.env.API_PROXY_ORIGIN?.trim() ?? '');
  const normalizedBase = publicApiBase.startsWith('/') ? publicApiBase : `/${publicApiBase}`;
  if (proxyOrigin && isAbsoluteHttpUrl(proxyOrigin)) {
    const proxyBasePath = trimTrailingSlash(process.env.API_PROXY_BASE_PATH?.trim() ?? '') || trimTrailingSlash(normalizedBase);
    return `${proxyOrigin}${proxyBasePath}`;
  }

  const siteOrigin = deriveSiteOrigin();
  if (siteOrigin) {
    return `${siteOrigin}${trimTrailingSlash(normalizedBase)}`;
  }

  return publicApiBase;
}

const SERVER_API_BASE = deriveServerApiBase(PUBLIC_API_BASE);

function resolveApiBase(): string {
  if (typeof window === 'undefined') return SERVER_API_BASE;

  const base = PUBLIC_API_BASE;
  const isLocalhostBase = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(base);
  const browserHost = window.location.hostname.toLowerCase();
  const isBrowserLocalhost = browserHost === 'localhost' || browserHost === '127.0.0.1';

  if (!isBrowserLocalhost) {
    return '/api';
  }
  if (isLocalhostBase) return base;
  if (isAbsoluteHttpUrl(base)) return trimTrailingSlash(base);
  return base || '/api';
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