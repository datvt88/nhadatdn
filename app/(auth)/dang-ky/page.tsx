'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../../../lib/api';
import { hasAdminAccess, writeAuthUser } from '../../../lib/auth-session';

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

function defaultRedirectByRole(role: string | undefined): string {
  return hasAdminAccess(role) ? '/quan-tri' : '/tai-khoan';
}

export default function RegisterPage() {
  const router = useRouter();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [status, setStatus] = useState('');
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleHint, setGoogleHint] = useState('');
  const [showManualRegister, setShowManualRegister] = useState(false);

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
          setGoogleHint('Đăng ký Google đang tắt bởi quản trị viên.');
        } else if (!clientId) {
          setGoogleHint('Google chưa cấu hình Client ID.');
        } else {
          setGoogleHint('');
        }
      } catch {
        if (!cancelled) {
          setGoogleEnabled(false);
          setGoogleClientId('');
          setGoogleHint('Không tải được cấu hình đăng ký Google.');
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
        setGoogleHint('Không thể khởi tạo Google Sign-Up.');
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
      googleId.renderButton(target, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'signup_with',
        width: 320,
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
    setStatus('Đang xác thực đăng ký Google...');
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: token, referralCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user) {
        setStatus(`Đăng ký Google thất bại: ${String(data.error ?? res.status)}`);
        return;
      }

      writeAuthUser({ ...data.user, ...(typeof data.sessionToken === 'string' && data.sessionToken.trim() !== '' ? { sessionToken: data.sessionToken } : {}) });
      setStatus('Đăng ký Google thành công.');
      router.replace(defaultRedirectByRole(data.user.role) as never);
      router.refresh();
    } catch (error) {
      setStatus('Đăng ký Google thất bại: ' + String(error));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function onRegister() {
    setStatus('Đang tạo tài khoản...');
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, phone, password, referralCode }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.user) {
      setStatus(`Đăng ký thất bại: ${String(data.error ?? res.status)}`);
      return;
    }

    writeAuthUser({ ...data.user, ...(typeof data.sessionToken === 'string' && data.sessionToken.trim() !== '' ? { sessionToken: data.sessionToken } : {}) });
    setStatus('Đăng ký thành công. Bạn đã có 10 tin đăng FREE (0 Bean).');
    router.replace(defaultRedirectByRole(data.user.role) as never);
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Đăng ký tài khoản</h1>
      <p className="mt-2 text-sm text-slate-600">Đăng ký bằng form thường hoặc Google.</p>
      <div className="mt-6 space-y-4">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Họ và tên" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (có thể để trống nếu dùng SĐT)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Số điện thoại (có thể để trống nếu dùng email)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        <input value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="Mã giới thiệu (tuỳ chọn)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />

        <button onClick={() => void onRegister()} className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white">
          Đăng ký
        </button>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-semibold">Đăng ký nhanh với Google</p>
          {googleEnabled && googleClientId ? (
            <div className="mt-3">
              <div ref={googleButtonRef} className={googleLoading ? 'pointer-events-none opacity-60' : ''} />
              {!googleReady ? <p className="mt-2 text-xs text-slate-500">Đang tải nút Google...</p> : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">{googleHint || 'Google Sign-Up chưa sẵn sàng.'}</p>
          )}
        </div>

        <Link href="/dang-nhap" className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Quay lại đăng nhập
        </Link>

        <p className="text-sm text-slate-600">{status}</p>
      </div>
    </main>
  );
}







