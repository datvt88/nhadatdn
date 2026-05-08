'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HeaderNav } from '../../../components/header-nav';
import { API_BASE } from '../../../lib/api';
import { authHeaders, hasAdminAccess, readAuthUser, subscribeAuthUser, writeAuthUser } from '../../../lib/auth-session';

type UserItem = {
  id: number;
  email: string;
  fullName: string;
  phone?: string;
  role: string;
  beanBalance: number;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  authProvider?: string;
  createdAt?: string;
  walletAddress?: string;
  accountStatus?: string;
  bannedReason?: string;
};

type SignupBonusConfig = {
  beans: number;
  updatedAt?: string | null;
};

function normalizeAccountStatus(status?: string): 'ACTIVE' | 'BANNED' {
  return String(status ?? '').toUpperCase() === 'BANNED' ? 'BANNED' : 'ACTIVE';
}

function formatDateTime(value?: string): string {
  if (!value) return '--';
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return '--';
  return time.toLocaleString('vi-VN');
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [actorRole, setActorRole] = useState('');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const [beanDeltaByUser, setBeanDeltaByUser] = useState<Record<number, string>>({});
  const [beanNoteByUser, setBeanNoteByUser] = useState<Record<number, string>>({});
  const [beanSourceByUser, setBeanSourceByUser] = useState<Record<number, string>>({});
  const [statusReasonByUser, setStatusReasonByUser] = useState<Record<number, string>>({});
  const [signupBonusConfig, setSignupBonusConfig] = useState<SignupBonusConfig>({ beans: 100, updatedAt: null });
  const [signupBonusDraft, setSignupBonusDraft] = useState('100');

  const [solAmountByUser, setSolAmountByUser] = useState<Record<number, string>>({});
  const [solDirectionByUser, setSolDirectionByUser] = useState<Record<number, string>>({});
  const [solWalletByUser, setSolWalletByUser] = useState<Record<number, string>>({});
  const [solTxHashByUser, setSolTxHashByUser] = useState<Record<number, string>>({});
  const [solNoteByUser, setSolNoteByUser] = useState<Record<number, string>>({});

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const syncUser = (): void => {
      const user = readAuthUser();
      setActorRole(user?.role ?? '');
      setHydrated(true);
    };
    syncUser();
    return subscribeAuthUser(syncUser);
  }, []);

  useEffect(() => {
    if (hydrated && !hasAdminAccess(actorRole)) {
      router.replace('/dang-nhap?next=/admin/users');
    }
  }, [hydrated, actorRole, router]);

  async function loadUsers() {
    if (!hasAdminAccess(actorRole)) return;
    setLoading(true);
    setStatus('');
    try {
      const res = await fetch(`${API_BASE}/admin/users?limit=200`, {
        headers: authHeaders(readAuthUser()),
        cache: 'no-store',
      });
      const payload = await res.json();
      if (res.status === 401) {
        writeAuthUser(null);
        setUsers([]);
        setStatus('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        router.replace('/dang-nhap?next=/admin/users');
        return;
      }
      if (!res.ok) {
        setStatus(`Lỗi: ${String(payload.error ?? 'không thể tải users')}`);
        return;
      }
      setUsers(payload.items ?? []);
    } catch (error) {
      setStatus(`Lỗi kết nối: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadSignupBonusConfig() {
    if (!hasAdminAccess(actorRole)) return;
    const res = await fetch(`${API_BASE}/admin/users/signup-bonus`, {
      headers: authHeaders(readAuthUser()),
      cache: 'no-store',
    });
    const payload = (await res.json().catch(() => ({}))) as Partial<SignupBonusConfig> & { error?: string };
    if (!res.ok) {
      setStatus(`Lỗi tải cấu hình Bean thưởng đăng ký: ${String(payload.error ?? 'unknown')}`);
      return;
    }
    const beans = Number(payload.beans ?? 100);
    const nextConfig = {
      beans: Number.isFinite(beans) ? beans : 100,
      updatedAt: payload.updatedAt ?? null,
    };
    setSignupBonusConfig(nextConfig);
    setSignupBonusDraft(String(nextConfig.beans));
  }

  useEffect(() => {
    if (hydrated && hasAdminAccess(actorRole)) {
      void loadUsers();
      void loadSignupBonusConfig();
    }
  }, [hydrated, actorRole]);

  async function adjustBeans(userId: number) {
    const amount = Number(beanDeltaByUser[userId] ?? '0');
    const source = String(beanSourceByUser[userId] ?? 'MANUAL').trim() || 'MANUAL';
    const note = String(beanNoteByUser[userId] ?? '').trim();

    const res = await fetch(`${API_BASE}/admin/users/${userId}/beans/adjust`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(readAuthUser()),
      },
      body: JSON.stringify({ amount, source, note, applyAffiliate: false }),
    });

    const payload = await res.json();
    if (!res.ok) {
      setStatus(`Lỗi cập nhật Bean user ${userId}: ${String(payload.error ?? 'unknown')}`);
      return;
    }

    setStatus(`Cập nhật Bean thành công user ${userId}. Số dư mới: ${payload.beanBalance}`);
    await loadUsers();
  }

  async function saveSignupBonusConfig() {
    const beans = Number(signupBonusDraft);
    if (!Number.isFinite(beans) || beans < 0) {
      setStatus('Bean thưởng đăng ký phải là số không âm.');
      return;
    }
    const res = await fetch(`${API_BASE}/admin/users/signup-bonus`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(readAuthUser()),
      },
      body: JSON.stringify({ beans: Math.floor(beans) }),
    });
    const payload = (await res.json().catch(() => ({}))) as Partial<SignupBonusConfig> & { error?: string };
    if (!res.ok) {
      setStatus(`Lỗi lưu Bean thưởng đăng ký: ${String(payload.error ?? 'unknown')}`);
      return;
    }
    const nextBeans = Number(payload.beans ?? Math.floor(beans));
    setSignupBonusConfig({ beans: nextBeans, updatedAt: payload.updatedAt ?? null });
    setSignupBonusDraft(String(nextBeans));
    setStatus(`Đã lưu Bean thưởng tài khoản mới: ${nextBeans} Bean.`);
  }

  async function updateUserStatus(user: UserItem, nextStatus: 'ACTIVE' | 'BANNED') {
    const reason = String(statusReasonByUser[user.id] ?? '').trim();
    const res = await fetch(`${API_BASE}/admin/users/${user.id}/status`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(readAuthUser()),
      },
      body: JSON.stringify({ status: nextStatus, reason }),
    });

    const payload = await res.json();
    if (!res.ok) {
      setStatus(`Lỗi cập nhật trạng thái user ${user.id}: ${String(payload.error ?? 'unknown')}`);
      return;
    }

    setStatus(`Đã cập nhật trạng thái user ${user.id}: ${nextStatus}.`);
    await loadUsers();
  }

  async function syncSol(user: UserItem) {
    const amount = Number(solAmountByUser[user.id] ?? '0');
    const direction = String(solDirectionByUser[user.id] ?? 'MINT').toUpperCase() === 'BURN' ? 'BURN' : 'MINT';
    const walletAddress = String(solWalletByUser[user.id] ?? user.walletAddress ?? '').trim();
    const txHash = String(solTxHashByUser[user.id] ?? '').trim();
    const note = String(solNoteByUser[user.id] ?? '').trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus(`Sync SOL user ${user.id} thất bại: amount phải > 0`);
      return;
    }
    if (!walletAddress || !txHash) {
      setStatus(`Sync SOL user ${user.id} thất bại: cần wallet và txHash`);
      return;
    }

    const res = await fetch(`${API_BASE}/admin/users/${user.id}/beans/sync-sol`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(readAuthUser()),
      },
      body: JSON.stringify({ amount, direction, walletAddress, txHash, note }),
    });

    const payload = await res.json();
    if (!res.ok) {
      setStatus(`Lỗi sync SOL user ${user.id}: ${String(payload.error ?? 'unknown')}`);
      return;
    }

    setStatus(`Sync SOL thành công user ${user.id}. Số dư mới: ${payload.beanBalance}`);
    await loadUsers();
  }

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => {
      const haystack = `${user.email} ${user.fullName} ${user.phone ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [users, searchTerm]);

  if (!hydrated) {
    return (
      <main>
        <HeaderNav />
        <section className="mx-auto max-w-7xl px-6 py-8 text-slate-600">Đang tải quyền truy cập...</section>
      </main>
    );
  }

  if (!hasAdminAccess(actorRole)) {
    return null;
  }

  return (
    <main>
      <HeaderNav />
      <section className="admin-neo mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold">Quản trị Bean</h1>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/users" className="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">Bean</Link>
          <Link href="/admin/affiliates" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-400">Affiliate</Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={() => void loadUsers()}>
            {loading ? 'Đang tải...' : 'Tải danh sách user'}
          </button>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Tìm theo email, tên, SĐT"
            className="w-full max-w-md rounded border px-3 py-2"
          />
        </div>

        {status ? <p className="mt-3 text-sm text-slate-700">{status}</p> : null}

        <article className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h2 className="text-lg font-semibold text-emerald-950">Bean thưởng khi đăng ký mới</h2>
              <p className="mt-1 text-sm text-emerald-900/80">
                Mặc định 100 Bean để tài khoản mới có thể đăng 20 tin thường hoặc 2 tin VIP.
              </p>
              {signupBonusConfig.updatedAt ? <p className="mt-1 text-xs text-emerald-800">Cập nhật: {formatDateTime(signupBonusConfig.updatedAt)}</p> : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="number"
                min={0}
                value={signupBonusDraft}
                onChange={(event) => setSignupBonusDraft(event.target.value)}
                className="w-full rounded border border-emerald-300 bg-white px-3 py-2 sm:w-36"
              />
              <button className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => void saveSignupBonusConfig()}>
                Lưu cấu hình
              </button>
            </div>
          </div>
        </article>

        <div className="mt-6 space-y-4">
          {filteredUsers.map((user) => {
            const accountStatus = normalizeAccountStatus(user.accountStatus);
            return (
              <article key={user.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-4 lg:grid-cols-4">
                  <section className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Thông tin</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">ID {user.id} - {user.role}</p>
                    <p className="mt-1 break-all text-sm text-slate-700">{user.email}</p>
                    <p className="text-sm text-slate-700">{user.fullName}</p>
                    <p className="text-sm text-slate-500">{user.phone || '-'}</p>
                    <p className="mt-2 text-xs text-slate-500">Tham gia: {formatDateTime(user.createdAt)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${accountStatus === 'BANNED' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {accountStatus === 'BANNED' ? 'Bị khóa' : 'Đang hoạt động'}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">Bean: {user.beanBalance}</span>
                    </div>
                    <div className="mt-2 text-xs">
                      <div className={user.emailVerified ? 'text-emerald-700' : 'text-slate-500'}>Email: {user.emailVerified ? 'Đã xác thực' : 'Chưa xác thực'}</div>
                      <div className={user.phoneVerified ? 'text-emerald-700' : 'text-slate-500'}>Phone: {user.phoneVerified ? 'Đã xác thực' : 'Chưa xác thực'}</div>
                      <div className="text-slate-500">Provider: {user.authProvider || 'PASSWORD'}</div>
                    </div>
                    <p className="mt-2 break-all text-xs text-slate-500">Wallet: {user.walletAddress || '-'}</p>
                  </section>

                  <section className="rounded-lg border border-slate-100 p-3">
                    <p className="text-xs uppercase text-slate-500">Bean quản trị</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      <input value={beanDeltaByUser[user.id] ?? ''} onChange={(event) => setBeanDeltaByUser((prev) => ({ ...prev, [user.id]: event.target.value }))} placeholder="vd: 50 hoặc -5" className="w-full rounded border px-2 py-1" />
                      <select value={beanSourceByUser[user.id] ?? 'MANUAL'} onChange={(event) => setBeanSourceByUser((prev) => ({ ...prev, [user.id]: event.target.value }))} className="w-full rounded border px-2 py-1">
                        <option value="MANUAL">MANUAL</option>
                        <option value="BLOCKCHAIN_SOL">BLOCKCHAIN_SOL</option>
                        <option value="SYSTEM">SYSTEM</option>
                      </select>
                      <input value={beanNoteByUser[user.id] ?? ''} onChange={(event) => setBeanNoteByUser((prev) => ({ ...prev, [user.id]: event.target.value }))} placeholder="Lý do" className="w-full rounded border px-2 py-1" />
                      <button className="rounded bg-[var(--brand-primary)] px-3 py-2 text-sm text-white" onClick={() => void adjustBeans(user.id)}>Cập nhật Bean</button>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-100 p-3">
                    <p className="text-xs uppercase text-slate-500">Trạng thái tài khoản</p>
                    <div className="mt-2 grid gap-2">
                      <input value={statusReasonByUser[user.id] ?? ''} onChange={(event) => setStatusReasonByUser((prev) => ({ ...prev, [user.id]: event.target.value }))} placeholder="Lý do ban/mở" className="w-full rounded border px-2 py-1" />
                      {accountStatus === 'BANNED' ? (
                        <button className="rounded bg-emerald-600 px-3 py-2 text-sm text-white" onClick={() => void updateUserStatus(user, 'ACTIVE')}>Kích hoạt lại</button>
                      ) : (
                        <button className="rounded bg-red-600 px-3 py-2 text-sm text-white" onClick={() => void updateUserStatus(user, 'BANNED')}>Ban user</button>
                      )}
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-100 p-3">
                    <p className="text-xs uppercase text-slate-500">Sync SOL</p>
                    <div className="mt-2 grid gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input value={solAmountByUser[user.id] ?? ''} onChange={(event) => setSolAmountByUser((prev) => ({ ...prev, [user.id]: event.target.value }))} placeholder="SOL amount" className="w-full rounded border px-2 py-1" />
                        <select value={solDirectionByUser[user.id] ?? 'MINT'} onChange={(event) => setSolDirectionByUser((prev) => ({ ...prev, [user.id]: event.target.value }))} className="w-full rounded border px-2 py-1">
                          <option value="MINT">MINT</option>
                          <option value="BURN">BURN</option>
                        </select>
                      </div>
                      <input value={solWalletByUser[user.id] ?? user.walletAddress ?? ''} onChange={(event) => setSolWalletByUser((prev) => ({ ...prev, [user.id]: event.target.value }))} placeholder="Wallet SOL" className="w-full rounded border px-2 py-1" />
                      <input value={solTxHashByUser[user.id] ?? ''} onChange={(event) => setSolTxHashByUser((prev) => ({ ...prev, [user.id]: event.target.value }))} placeholder="Tx hash" className="w-full rounded border px-2 py-1" />
                      <input value={solNoteByUser[user.id] ?? ''} onChange={(event) => setSolNoteByUser((prev) => ({ ...prev, [user.id]: event.target.value }))} placeholder="Ghi chú sync" className="w-full rounded border px-2 py-1" />
                      <button className="rounded bg-violet-700 px-3 py-2 text-sm text-white" onClick={() => void syncSol(user)}>Sync SOL</button>
                    </div>
                  </section>
                </div>
              </article>
            );
          })}

          {filteredUsers.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-10 text-center text-slate-500">Không có user phù hợp.</div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
