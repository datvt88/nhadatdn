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
  affiliateCode?: string;
  referredBy?: number;
  createdAt?: string;
};

function formatDateTime(value?: string): string {
  if (!value) return '--';
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return '--';
  return time.toLocaleString('vi-VN');
}

export default function AdminAffiliatesPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [actorRole, setActorRole] = useState('');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [affiliateOnly, setAffiliateOnly] = useState(true);

  const [bonusByUser, setBonusByUser] = useState<Record<number, string>>({});
  const [noteByUser, setNoteByUser] = useState<Record<number, string>>({});

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
      router.replace('/dang-nhap?next=/admin/affiliates');
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
        router.replace('/dang-nhap?next=/admin/affiliates');
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

  useEffect(() => {
    if (hydrated && hasAdminAccess(actorRole)) {
      void loadUsers();
    }
  }, [hydrated, actorRole]);

  async function rewardAffiliate(user: UserItem) {
    const amount = Number(bonusByUser[user.id] ?? '0');
    const note = String(noteByUser[user.id] ?? '').trim() || 'Affiliate reward';
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus(`User ${user.id}: số Bean thưởng phải > 0`);
      return;
    }

    const res = await fetch(`${API_BASE}/admin/users/${user.id}/beans/adjust`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(readAuthUser()),
      },
      body: JSON.stringify({ amount, source: 'AFFILIATE', note, applyAffiliate: true }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setStatus(`Lỗi thưởng affiliate user ${user.id}: ${String(payload.error ?? 'unknown')}`);
      return;
    }

    setStatus(`Đã thưởng affiliate cho user ${user.id}. Số dư mới: ${payload.beanBalance}`);
    await loadUsers();
  }

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return users
      .filter((user) => {
        if (affiliateOnly && !String(user.affiliateCode ?? '').trim()) return false;
        if (!q) return true;
        const haystack = `${user.email} ${user.fullName} ${user.phone ?? ''} ${user.affiliateCode ?? ''} ${user.referredBy ?? ''}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const ac = new Date(a.createdAt ?? '').getTime() || 0;
        const bc = new Date(b.createdAt ?? '').getTime() || 0;
        return bc - ac;
      });
  }, [users, searchTerm, affiliateOnly]);

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
      <section className="admin-neo mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Quản trị Affiliate</h1>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/users" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-400">Bean</Link>
          <Link href="/admin/affiliates" className="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">Affiliate</Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={() => void loadUsers()}>
            {loading ? 'Đang tải...' : 'Tải danh sách user'}
          </button>
          <label className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={affiliateOnly} onChange={(event) => setAffiliateOnly(event.target.checked)} />
            Chỉ user có mã affiliate
          </label>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Tìm theo email, tên, SĐT, mã affiliate"
            className="w-full max-w-md rounded border px-3 py-2"
          />
        </div>

        {status ? <p className="mt-3 text-sm text-slate-700">{status}</p> : null}

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-[1200px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Email / Tên / SĐT</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Mã Affiliate</th>
                <th className="px-3 py-2">Ref By</th>
                <th className="px-3 py-2">Bean hiện tại</th>
                <th className="px-3 py-2">Tham gia</th>
                <th className="px-3 py-2">Thưởng Affiliate</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 font-medium">{user.id}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{user.email}</div>
                    <div>{user.fullName}</div>
                    <div className="text-slate-500">{user.phone || '-'}</div>
                  </td>
                  <td className="px-3 py-2">{user.role}</td>
                  <td className="px-3 py-2 font-semibold">{user.affiliateCode || '-'}</td>
                  <td className="px-3 py-2">{user.referredBy ?? '-'}</td>
                  <td className="px-3 py-2 font-semibold">{user.beanBalance}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{formatDateTime(user.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="space-y-2">
                      <input
                        value={bonusByUser[user.id] ?? ''}
                        onChange={(event) => setBonusByUser((prev) => ({ ...prev, [user.id]: event.target.value }))}
                        placeholder="Bean thưởng"
                        className="w-28 rounded border px-2 py-1"
                      />
                      <input
                        value={noteByUser[user.id] ?? ''}
                        onChange={(event) => setNoteByUser((prev) => ({ ...prev, [user.id]: event.target.value }))}
                        placeholder="Ghi chú"
                        className="w-44 rounded border px-2 py-1"
                      />
                      <button className="rounded bg-[var(--brand-primary)] px-3 py-1 text-white" onClick={() => void rewardAffiliate(user)}>
                        Thưởng affiliate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">Không có user affiliate phù hợp.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}