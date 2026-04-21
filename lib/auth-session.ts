export type AuthUser = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  beanBalance: number;
  phone?: string;
  freePostsRemaining?: number;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  authProvider?: string;
  createdAt?: string;
  sessionToken?: string;
};

const AUTH_USER_KEY = 'nhadatdn.auth.user';
const AUTH_EVENT = 'nhadatdn-auth-changed';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readCookie(name: string): string {
  if (!isBrowser()) return '';
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? '') : '';
}
function normalizeRole(role: string | undefined): string {
  return (role ?? '').trim().toUpperCase();
}

function isValidAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AuthUser>;
  return (
    typeof candidate.id === 'number' &&
    Number.isFinite(candidate.id) &&
    typeof candidate.email === 'string' &&
    typeof candidate.fullName === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.beanBalance === 'number'
  );
}

function normalizeAuthUser(user: AuthUser): AuthUser {
  return {
    ...user,
    freePostsRemaining: typeof user.freePostsRemaining === 'number' ? user.freePostsRemaining : 0,
    emailVerified: Boolean(user.emailVerified),
    phoneVerified: Boolean(user.phoneVerified),
    authProvider: user.authProvider ?? 'PASSWORD',
  };
}

export function hasAdminAccess(role: string | undefined): boolean {
  const normalized = normalizeRole(role);
  return normalized === 'ADMIN' || normalized === 'MOD' || normalized === 'SUPER_ADMIN' || normalized === 'MODERATOR' || normalized === 'MOD_AI';
}

export function readAuthUser(): AuthUser | null {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidAuthUser(parsed) ? normalizeAuthUser(parsed) : null;
  } catch {
    return null;
  }
}

export function writeAuthUser(user: AuthUser | null): void {
  if (!isBrowser()) {
    return;
  }

  if (user) {
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizeAuthUser(user)));
  } else {
    window.localStorage.removeItem(AUTH_USER_KEY);
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
  }

  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function subscribeAuthUser(onChange: () => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const handleStorage = (event: StorageEvent): void => {
    if (!event.key || event.key === AUTH_USER_KEY) {
      onChange();
    }
  };
  const handleFocus = (): void => {
    onChange();
  };
  const handlePageShow = (): void => {
    onChange();
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(AUTH_EVENT, onChange);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('pageshow', handlePageShow);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(AUTH_EVENT, onChange);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('pageshow', handlePageShow);
  };
}

export function authHeaders(user: AuthUser | null | undefined): Record<string, string> {
  if (!user) {
    return {};
  }
  const headers: Record<string, string> = {};
  const token = typeof user.sessionToken === 'string' ? user.sessionToken.trim() : '';
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const csrf = readCookie('nhadatdn_csrf').trim();
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }
  return headers;
}

