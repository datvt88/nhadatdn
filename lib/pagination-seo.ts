export function parsePositivePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 2) {
    return 1;
  }
  return parsed;
}

export function buildPagePath(
  basePath: string,
  page: number,
  query?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) {
      params.set(key, trimmed);
    }
  }
  if (page > 1) {
    params.set('page', String(page));
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
