import type { AuthUser } from './auth-session';

export type FavoriteListing = {
  slug: string;
  title: string;
  price: number | undefined;
  area: number | undefined;
  address: string | undefined;
  image: string | undefined;
  path: string;
};

function keyByUser(userId: number): string {
  return `nhadatdn.favorites.${userId}`;
}

export function readFavorites(user: AuthUser | null): FavoriteListing[] {
  if (!user || typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(keyByUser(user.id));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FavoriteListing[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isFavorite(user: AuthUser | null, slug: string): boolean {
  return readFavorites(user).some((item) => item.slug === slug);
}

export function toggleFavorite(user: AuthUser | null, item: FavoriteListing): { ok: boolean; saved: boolean; message?: string } {
  if (!user || typeof window === 'undefined') {
    return { ok: false, saved: false, message: 'Vui lòng đăng nhập để lưu tin.' };
  }

  const current = readFavorites(user);
  const exists = current.some((entry) => entry.slug === item.slug);
  const next = exists ? current.filter((entry) => entry.slug !== item.slug) : [item, ...current];
  window.localStorage.setItem(keyByUser(user.id), JSON.stringify(next.slice(0, 200)));
  return { ok: true, saved: !exists };
}

export function removeFavorite(user: AuthUser | null, slug: string): void {
  if (!user || typeof window === 'undefined') return;
  const next = readFavorites(user).filter((entry) => entry.slug !== slug);
  window.localStorage.setItem(keyByUser(user.id), JSON.stringify(next));
}


