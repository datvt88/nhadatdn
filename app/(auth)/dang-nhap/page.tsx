'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../../../lib/api';
import { hasAdminAccess, readAuthUser, writeAuthUser } from '../../../lib/auth-session';

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccountsID = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
};

type GoogleWindow = Window & {
  google?: {
    accounts?: {
      id?: GoogleAccountsID;
    };
  };
};

function normalizeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  return value;
}

function defaultRedirectByRole(role: string | undefined): string {
  return hasAdminAccess(role) ? '/quan-tri' : '/tai-khoan';
}

function resolveRedirectTarget(role: string | undefined, nextPath: string | null): string {
  return nextPath ?? defaultRedirectByRole(role);
}

function readNextPath(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return normalizeNextPath(params.get('next'));
}

export default function LoginPage() {
  const router = useRouter();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleHint, setGoogleHint] = useState('');

  useEffect(() => {
    const existingUser = readAuthUser();
    if (!existingUser) return;
    const nextPath = readNextPath();
    router.replace(resolveRedirectTarget(existingUser.role, nextPath) as never);
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      try {
        const res = await fetch(`${API_BASE}/auth/providers`, { cache: 'no-store' });
        const payload = (await res.json().catch(() => ({}))) as {
          providers?: Array<{ id?: string; enabled?: boolean; clientId?: string }>;
        };
        if (cancelled) return;

        const providers = Array.isArray(payload.providers) ? payload.providers : [];
        const googleProvider = providers.find((provider) => String(provider?.id ?? '').toUpperCase() === 'GOOGLE');
        const enabled = Boolean(googleProvider?.enabled);
        const clientId = typeof googleProvider?.clientId === 'string' ? googleProvider.clientId.trim() : '';

        setGoogleEnabled(enabled);
        setGoogleClientId(clientId);
        if (!enabled) {
          setGoogleHint('Đăng nhập Google đang tắt bởi quản trị viên.');
        } else if (!clientId) {
          setGoogleHint('Google chưa cấu hình Client ID.');
        } else {
          setGoogleHint('');
        }
      } catch {
        if (!cancelled) {
          setGoogleEnabled(false);
          setGoogleClientId('');
          setGoogleHint('Không tải được cấu hình đăng nhập Google.');
        }
      }
    }

    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!googleEnabled || !googleClientId) {
      setGoogleReady(false);
      return;
    }

    let cancelled = false;
    const scriptId = 'google-identity-services';

    const mountGoogleButton = () => {
      if (cancelled) return;
      const googleId = (window as GoogleWindow).google?.accounts?.id;
      const target = googleButtonRef.current;
      if (!googleId || !target) {
        setGoogleReady(false);
        setGoogleHint('Không thể khởi tạo Google Sign-In.');
        return;
      }

      googleId.initialize({
        client_id: googleClientId,
        callback: (response) => {
          void onGoogleCredential(response.credential ?? '');
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      target.innerHTML = '';
      const buttonWidth =
        typeof window !== 'undefined' ? Math.min(320, Math.max(240, window.innerWidth - 48)) : 320;
      googleId.renderButton(target, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: buttonWidth,
        locale: 'vi',
      });
      setGoogleReady(true);
    };

    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existingScript) {
      if ((window as GoogleWindow).google?.accounts?.id) {
        mountGoogleButton();
      } else {
        existingScript.addEventListener('load', mountGoogleButton, { once: true });
      }
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', mountGoogleButton, { once: true });
    script.addEventListener(
      'error',
      () => {
        if (!cancelled) {
          setGoogleReady(false);
          setGoogleHint('Không tải được Google Sign-In script.');
        }
      },
      { once: true },
    );
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [googleEnabled, googleClientId]);

  async function onGoogleCredential(credential: string) {
    const token = credential.trim();
    if (!token || googleLoading) return;

    setGoogleLoading(true);
    setResult('Đang xác thực Google...');
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user) {
        setResult(`Đăng nhập Google thất bại: ${String(data.error ?? res.status)}`);
        return;
      }

      writeAuthUser({
        ...data.user,
        ...(typeof data.sessionToken === 'string' && data.sessionToken.trim() !== '' ? { sessionToken: data.sessionToken } : {}),
      });

      const target = resolveRedirectTarget(data.user.role, readNextPath());
      router.replace(target as never);
      router.refresh();
    } catch (error) {
      setResult('Đăng nhập Google thất bại: ' + String(error));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function onLogin() {
    if (loading) return;

    setLoading(true);
    setResult('Đang đăng nhập...');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user) {
        setResult(`Đăng nhập thất bại: ${data.error ?? res.status}`);
        return;
      }

      writeAuthUser({
        ...data.user,
        ...(typeof data.sessionToken === 'string' && data.sessionToken.trim() !== '' ? { sessionToken: data.sessionToken } : {}),
      });

      const target = resolveRedirectTarget(data.user.role, readNextPath());
      router.replace(target as never);
      router.refresh();
    } catch (error) {
      setResult('Đăng nhập thất bại: ' + String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Đăng nhập</h1>
      <p className="mt-2 text-sm text-slate-600">Đăng nhập bằng email, số điện thoại hoặc Google.</p>
      <form
        className="mt-6 space-y-4"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void onLogin();
        }}
      >
        <input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="Email hoặc số điện thoại"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          name="login-identifier"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          name="login-password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <button type="submit" disabled={loading} className="rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
          {loading ? 'Đang xử lý...' : 'Đăng nhập'}
        </button>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-semibold">Đăng nhập nhanh với Google</p>
          {googleEnabled && googleClientId ? (
            <div className="mt-3">
              <div ref={googleButtonRef} className={googleLoading ? 'pointer-events-none opacity-60' : ''} />
              {!googleReady ? <p className="mt-2 text-xs text-slate-500">Đang tải nút Google...</p> : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">{googleHint || 'Google Sign-In chưa sẵn sàng.'}</p>
          )}
        </div>

        <Link href="/dang-ky" className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Tạo tài khoản mới
        </Link>
        <p className="text-sm text-slate-600">{result}</p>
      </form>
    </main>
  );
}





