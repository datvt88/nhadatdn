const DEFAULT_SITE_URL = 'https://nhadatdn.net';

export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!fromEnv) return DEFAULT_SITE_URL;
  try {
    const parsed = new URL(fromEnv);
    return parsed.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function toAbsoluteUrl(pathname: string): string {
  const site = getSiteUrl();
  if (!pathname) return site;
  if (/^https?:\/\//i.test(pathname)) return pathname;
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${site}${normalized}`;
}

export function normalizeSeoText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}
