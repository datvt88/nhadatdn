'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HeaderNav } from '../../../components/header-nav';
import { API_BASE } from '../../../lib/api';
import { authHeaders, hasAdminAccess, readAuthUser, subscribeAuthUser, writeAuthUser, type AuthUser } from '../../../lib/auth-session';
import { listingStatusLabel, packageBadgeLabel, packageBadgeClassName, shouldShowVipBadge } from '../../../lib/listing-labels';
import { buildListingPath, resolveDealType } from '../../../lib/listing-route';

type MyListingItem = {
  id: number;
  slug: string;
  title: string;
  price: number;
  area: number;
  packageType: string;
  status: string;
  userId: number;
  createdAt: string;
};

type EditListingDraft = {
  id: number;
  slug: string;
  title: string;
  description: string;
  price: string;
  area: string;
  bedrooms: string;
  bathrooms: string;
  address: string;
  contactName: string;
  contactPhone: string;
};
type AddressSuggestion = { label: string; lat?: number; lng?: number };
type WardCatalogItem = { id: number; name: string };
type DistrictCatalogItem = { id: number; name: string; wards: WardCatalogItem[] };
type DanangCatalog = { cityName?: string; districts?: DistrictCatalogItem[] };
type ViewStatus = 'all' | 'active-sale' | 'sold' | 'active-rent' | 'rented';

const USER_LISTING_EDIT_WINDOW_DAYS = 30;

const packageGuide = [
  { packageType: 'FREE', beanCost: 0, note: 'Tin thường miễn phí, trừ 1 lượt FREE trong quota tài khoản' },
  { packageType: 'NORMAL', beanCost: 5, note: 'Tin thường trả phí, trừ 5 Bean/tin' },
  { packageType: 'VIP', beanCost: 50, note: 'Tin VIP ưu tiên hiển thị, trừ 50 Bean/tin' },
] as const;

function statusOptionsForTitle(title: string): Array<{ value: 'ACTIVE' | 'SOLD' | 'RENTED'; label: string }> {
  const dealType = resolveDealType(title);
  if (dealType === 'cho-thue') {
    return [
      { value: 'ACTIVE', label: 'Đang cho thuê' },
      { value: 'RENTED', label: 'Đã cho thuê' },
    ];
  }
  return [
    { value: 'ACTIVE', label: 'Đang bán' },
    { value: 'SOLD', label: 'Đã bán' },
  ];
}

function toViewStatus(item: MyListingItem): ViewStatus {
  if (item.status === 'SOLD') return 'sold';
  if (item.status === 'RENTED') return 'rented';
  return resolveDealType(item.title) === 'cho-thue' ? 'active-rent' : 'active-sale';
}

function inDateRange(item: MyListingItem, fromDate: string, toDate: string): boolean {
  const time = new Date(item.createdAt).getTime();
  if (!Number.isFinite(time)) return false;
  if (fromDate) {
    const from = new Date(`${fromDate}T00:00:00`).getTime();
    if (time < from) return false;
  }
  if (toDate) {
    const to = new Date(`${toDate}T23:59:59`).getTime();
    if (time > to) return false;
  }
  return true;
}

function isListingEditable(createdAt: string): boolean {
  const createdTime = new Date(createdAt).getTime();
  if (!Number.isFinite(createdTime)) return false;
  const expireTime = createdTime + USER_LISTING_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() <= expireTime;
}

function formatEditDeadline(createdAt: string): string {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return '';
  const deadline = new Date(created + USER_LISTING_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return deadline.toLocaleDateString('vi-VN');
}

function isExpiredSessionError(errorText: string | undefined): boolean {
  const lower = String(errorText ?? '').trim().toLowerCase();
  if (!lower) return false;
  return lower.includes('invalid or expired session') || lower.includes('unauthorized') || lower.includes('session');
}

function normalizeSearchText(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
export default function AccountHomePage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [myListings, setMyListings] = useState<MyListingItem[]>([]);
  const [statusById, setStatusById] = useState<Record<number, string>>({});
  const [viewStatus, setViewStatus] = useState<ViewStatus>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fullName, setFullName] = useState('');
  const [zaloPhone, setZaloPhone] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [googleTrackingKey, setGoogleTrackingKey] = useState('');
  const [facebookTrackingKey, setFacebookTrackingKey] = useState('');
  const [message, setMessage] = useState('');
  const [editingDraft, setEditingDraft] = useState<EditListingDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editAddressSuggestions, setEditAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [editAddressLoading, setEditAddressLoading] = useState(false);
  const [danangCatalog, setDanangCatalog] = useState<DanangCatalog | null>(null);

  useEffect(() => {
    const syncUser = (): void => {
      setUser(readAuthUser());
      setHydrated(true);
    };

    syncUser();
    return subscribeAuthUser(syncUser);
  }, []);

  useEffect(() => {
    if (hydrated && !user) {
      router.replace('/dang-nhap?next=/tai-khoan');
    }
  }, [hydrated, router, user]);

  useEffect(() => {
    setFullName(user?.fullName ?? '');
  }, [user?.fullName]);

  async function loadMyListings(currentUser: AuthUser) {
    const res = await fetch(`${API_BASE}/users/${currentUser.id}/listings?limit=500`, {
      cache: 'no-store',
      credentials: 'include',
      headers: authHeaders(currentUser),
    });

    const payload = (await res.json().catch(() => ({}))) as { items?: MyListingItem[]; error?: string };
    if (!res.ok) {
      if (isExpiredSessionError(payload.error)) {
        writeAuthUser(null);
        setUser(null);
        router.replace('/dang-nhap?next=/tai-khoan');
        return;
      }
      setMessage(`Lỗi tải tin của bạn: ${String(payload.error ?? 'unknown')}`);
      return;
    }

    const items = payload.items ?? [];
    setMyListings(items);
    const defaults: Record<number, string> = {};
    items.forEach((item) => {
      defaults[item.id] = item.status;
    });
    setStatusById(defaults);
  }

  async function loadTrackingSettings(currentUser: AuthUser) {
    const res = await fetch(`${API_BASE}/users/${currentUser.id}/settings`, {
      cache: 'no-store',
      credentials: 'include',
      headers: authHeaders(currentUser),
    });
    const payload = (await res.json().catch(() => ({}))) as { fullName?: string; contactPhone?: string; phoneVerified?: boolean; googleTrackingKey?: string; facebookTrackingKey?: string; error?: string };
    if (!res.ok) {
      if (isExpiredSessionError(payload.error)) {
        writeAuthUser(null);
        setUser(null);
        router.replace('/dang-nhap?next=/tai-khoan');
        return;
      }
      setMessage(`Lỗi tải cài đặt tracking: ${String(payload.error ?? 'unknown')}`);
      return;
    }
    const resolvedFullName = payload.fullName?.trim() || currentUser.fullName || '';
    const resolvedPhone = payload.contactPhone ?? currentUser.phone ?? '';
    const resolvedPhoneVerified = Boolean(payload.phoneVerified ?? currentUser.phoneVerified);
    setFullName(resolvedFullName);
    setZaloPhone(resolvedPhone);
    setPhoneVerified(resolvedPhoneVerified);
    setGoogleTrackingKey(payload.googleTrackingKey ?? '');
    setFacebookTrackingKey(payload.facebookTrackingKey ?? '');
    if (currentUser.fullName !== resolvedFullName || currentUser.phone !== resolvedPhone || Boolean(currentUser.phoneVerified) !== resolvedPhoneVerified) {
      const nextUser: AuthUser = { ...currentUser, fullName: resolvedFullName, phone: resolvedPhone, phoneVerified: resolvedPhoneVerified };
      writeAuthUser(nextUser);
      setUser(nextUser);
    }
  }

  useEffect(() => {
    if (user) {
      void loadMyListings(user);
      void loadTrackingSettings(user);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      const res = await fetch(`${API_BASE}/locations/danang`, { cache: 'no-store' });
      if (!res.ok || !active) return;
      const payload = (await res.json().catch(() => null)) as DanangCatalog | null;
      if (active && payload) {
        setDanangCatalog(payload);
      }
    };
    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  function buildWardAddressHints(keyword: string): AddressSuggestion[] {
    const query = normalizeSearchText(keyword);
    if (!danangCatalog?.districts?.length) return [];
    const seen = new Set<string>();
    const output: AddressSuggestion[] = [];
    for (const district of danangCatalog.districts) {
      const districtName = String(district.name ?? '').trim();
      for (const ward of district.wards ?? []) {
        const wardName = String(ward.name ?? '').trim();
        if (!wardName) continue;
        const candidate = `${wardName}, ${districtName}, Đà Nẵng`;
        const normalized = normalizeSearchText(candidate);
        if (query.length > 0 && !normalized.includes(query)) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        output.push({ label: candidate });
        if (output.length >= 8) return output;
      }
    }
    return output;
  }

  useEffect(() => {
    const keyword = editingDraft?.address?.trim() ?? '';
    if (keyword.length === 0) {
      setEditAddressSuggestions(buildWardAddressHints(''));
      setEditAddressLoading(false);
      return;
    }

    if (keyword.length < 2) {
      setEditAddressSuggestions(buildWardAddressHints(keyword));
      setEditAddressLoading(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setEditAddressLoading(true);
        const query = encodeURIComponent(keyword);
        const res = await fetch(`${API_BASE}/locations/address-suggest?q=${query}&limit=6`, {
          cache: 'no-store',
        });
        const remotePayload = (await res.json().catch(() => ({}))) as { items?: AddressSuggestion[] };
        if (!active) return;
        const remoteItems = Array.isArray(remotePayload.items)
          ? remotePayload.items
              .filter((item) => typeof item?.label === 'string' && item.label.trim().length > 0)
              .map((item) => {
                const mapped: AddressSuggestion = { label: String(item.label).trim() };
                if (typeof item.lat === 'number') mapped.lat = item.lat;
                if (typeof item.lng === 'number') mapped.lng = item.lng;
                return mapped;
              })
          : [];
        const localItems = buildWardAddressHints(keyword);
        const dedupe = new Set<string>();
        const merged: AddressSuggestion[] = [];
        for (const item of [...localItems, ...remoteItems]) {
          const key = item.label.toLowerCase();
          if (dedupe.has(key)) continue;
          dedupe.add(key);
          merged.push(item);
          if (merged.length >= 8) break;
        }
        setEditAddressSuggestions(merged);
      } catch {
        if (active) {
          setEditAddressSuggestions(buildWardAddressHints(keyword));
        }
      } finally {
        if (active) setEditAddressLoading(false);
      }
    }, 280);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [editingDraft?.address, danangCatalog]);

  async function saveTrackingSettings() {
    if (!user) return;
    const res = await fetch(`${API_BASE}/users/${user.id}/settings`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(user),
      },
      body: JSON.stringify({ fullName, contactPhone: zaloPhone, googleTrackingKey, facebookTrackingKey }),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(`Lỗi lưu tracking key: ${String(payload.error ?? 'unknown')}`);
      return;
    }
    const nextUser: AuthUser = { ...user, fullName: fullName.trim() || user.fullName, phone: zaloPhone.trim(), phoneVerified: false };
    writeAuthUser(nextUser);
    setUser(nextUser);
    setPhoneVerified(false);
    setMessage('Đã lưu thông tin tài khoản thành công.');
  }
  const filteredMyListings = useMemo(() => {
    return myListings.filter((item) => {
      if (viewStatus !== 'all' && toViewStatus(item) !== viewStatus) {
        return false;
      }
      return inDateRange(item, fromDate, toDate);
    });
  }, [myListings, viewStatus, fromDate, toDate]);

  async function exportMyListings() {
    if (!user) return;
    const params = new URLSearchParams();
    params.set('viewStatus', viewStatus);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);

    const res = await fetch(`${API_BASE}/users/${user.id}/listings/export?${params.toString()}`, {
      credentials: 'include',
      headers: authHeaders(user),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(`Lỗi export: ${String(payload.error ?? 'unknown')}`);
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'google-ads-real-estate-user-listings.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    setMessage('Đã xuất file CSV chuẩn Google Ads bất động sản.');
  }

  async function updateMyListingStatus(listing: MyListingItem) {
    if (!user) {
      return;
    }

    const nextStatus = statusById[listing.id] ?? listing.status;
    const res = await fetch(`${API_BASE}/users/${user.id}/listings/${listing.id}/status`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(user),
      },
      body: JSON.stringify({ status: nextStatus }),
    });

    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(`Lỗi cập nhật trạng thái tin #${listing.id}: ${String(payload.error ?? 'unknown')}`);
      return;
    }

    setMessage(`Đã cập nhật trạng thái tin #${listing.id}`);
    await loadMyListings(user);
  }


  async function openEditListing(listing: MyListingItem) {
    if (!user) return;
    if (!isListingEditable(listing.createdAt)) {
      setMessage(`Tin #${listing.id} đã quá ${USER_LISTING_EDIT_WINDOW_DAYS} ngày, chỉ có thể cập nhật trạng thái.`);
      return;
    }

    const res = await fetch(`${API_BASE}/listings/${encodeURIComponent(listing.slug)}`, {
      cache: 'no-store',
      credentials: 'include',
      headers: authHeaders(user),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      title?: string;
      description?: string;
      price?: number;
      area?: number;
      bedrooms?: number;
      bathrooms?: number;
      address?: string;
      contact?: { fullName?: string; phone?: string };
      error?: string;
    };
    if (!res.ok) {
      setMessage(`Lỗi tải dữ liệu tin #${listing.id}: ${String(payload.error ?? 'unknown')}`);
      return;
    }

    setEditingDraft({
      id: listing.id,
      slug: listing.slug,
      title: String(payload.title ?? listing.title ?? ''),
      description: String(payload.description ?? ''),
      price: String(payload.price ?? listing.price ?? ''),
      area: String(payload.area ?? listing.area ?? ''),
      bedrooms: String(payload.bedrooms ?? 0),
      bathrooms: String(payload.bathrooms ?? 0),
      address: String(payload.address ?? ''),
      contactName: String(payload.contact?.fullName ?? user.fullName ?? ''),
      contactPhone: String(payload.contact?.phone ?? user.phone ?? ''),
    });
    setEditAddressSuggestions([]);
  }

  async function saveListingEdit() {
    if (!user || !editingDraft || savingEdit) return;
    setSavingEdit(true);
    const res = await fetch(`${API_BASE}/users/${user.id}/listings/${editingDraft.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(user),
      },
      body: JSON.stringify({
        title: editingDraft.title.trim(),
        description: editingDraft.description.trim(),
        price: Number(editingDraft.price),
        area: Number(editingDraft.area),
        bedrooms: Number(editingDraft.bedrooms),
        bathrooms: Number(editingDraft.bathrooms),
        address: editingDraft.address.trim(),
        contactName: editingDraft.contactName.trim(),
        contactPhone: editingDraft.contactPhone.trim(),
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setSavingEdit(false);
    if (!res.ok) {
      setMessage(`Lỗi sửa tin #${editingDraft.id}: ${String(payload.error ?? 'unknown')}`);
      return;
    }

    setEditingDraft(null);
    setMessage(`Đã cập nhật tin #${editingDraft.id}`);
    await loadMyListings(user);
  }  if (!hydrated) {
    return (
      <main>
        <HeaderNav />
        <section className="mx-auto max-w-5xl px-6 py-8 text-slate-600">Đang tải hồ sơ...</section>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main>
      <HeaderNav />
      <section className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-900">Hồ sơ người dùng</h1>
        <p className="mt-2 text-slate-600">Quản lý thông tin tài khoản, Bean và toàn bộ tin bạn đã đăng.</p>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900">Thông tin tài khoản</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Họ tên</dt>
                <dd className="mt-1">
                  <input
                    className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nhập họ tên"
                  />
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{user.email}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Vai trò</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{user.role.toUpperCase()}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-500">User ID</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{user.id}</dd>
              </div>
            </dl>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Số điện thoại (Zalo)</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2"
                  placeholder="Nhập số điện thoại Zalo"
                  value={zaloPhone}
                  onChange={(e) => setZaloPhone(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void saveTrackingSettings()}
                  className="rounded bg-slate-900 px-4 py-2 text-white"
                >
                  Lưu thông tin
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Trạng thái xác thực số điện thoại:{' '}
                <span className={phoneVerified ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
                  {phoneVerified ? 'Đã xác thực' : 'Chưa xác thực (sẽ tích hợp SMS/Zalo OTP)'}
                </span>
              </p>
            </div>
          </article>

          <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-emerald-900">Số dư Bean</h2>
            <p className="mt-3 text-3xl font-bold text-emerald-700">{user.beanBalance}</p>
            <p className="mt-2 text-sm text-emerald-900/80">Bean bị trừ khi dùng gói THƯỜNG/VIP. Gói FREE không trừ Bean.</p>
            <p className="mt-1 text-sm text-emerald-900/80">Lượt FREE còn lại: <span className="font-semibold">{user.freePostsRemaining ?? 0}</span></p>
            <div className="mt-4 grid gap-2">
              <Link href="/dang-tin-nha-dat" className="rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700">
                Đăng tin mới
              </Link>
              <Link href="/favorites" className="rounded-lg border border-emerald-300 px-3 py-2 text-center text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
                Xem tin đã lưu
              </Link>
            </div>
            {hasAdminAccess(user.role) ? (
              <Link href="/quan-tri" className="mt-2 block rounded-lg border border-emerald-300 px-3 py-2 text-center text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
                Vào profile quản trị
              </Link>
            ) : null}
          </article>
        </div>

        <article className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Cài đặt tài khoản & tracking quảng cáo</h2>
          <p className="mt-1 text-sm text-slate-600">Mỗi tài khoản có key riêng để đánh giá hiệu quả quảng cáo Google/Facebook.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              className="rounded border border-slate-300 px-3 py-2"
              placeholder="Google Tracking Key"
              value={googleTrackingKey}
              onChange={(e) => setGoogleTrackingKey(e.target.value)}
            />
            <input
              className="rounded border border-slate-300 px-3 py-2"
              placeholder="Facebook Tracking Key"
              value={facebookTrackingKey}
              onChange={(e) => setFacebookTrackingKey(e.target.value)}
            />
          </div>
          <button type="button" onClick={() => void saveTrackingSettings()} className="mt-3 rounded bg-slate-900 px-4 py-2 text-white">Lưu cài đặt tài khoản</button>
        </article>

        <article className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Bảng giá Bean khi đăng tin</h2>
          <p className="mt-1 text-sm text-slate-600">Mức trừ Bean được đồng bộ theo logic backend.</p>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Gói đăng</th>
                  <th className="px-3 py-2">Bean bị trừ</th>
                  <th className="px-3 py-2">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {packageGuide.map((row) => (
                  <tr key={row.packageType} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{row.packageType}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">-{row.beanCost}</td>
                    <td className="px-3 py-2 text-slate-600">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Tin đăng của tôi</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => void exportMyListings()}>
                Xuất CSV Google Ads
              </button>
              <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => void loadMyListings(user)}>
                Làm mới danh sách
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <select className="rounded border border-slate-300 px-2 py-2" value={viewStatus} onChange={(e) => setViewStatus(e.target.value as ViewStatus)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="active-sale">Đang bán</option>
              <option value="sold">Đã bán</option>
              <option value="active-rent">Đang cho thuê</option>
              <option value="rented">Đã cho thuê</option>
            </select>
            <input type="date" className="rounded border border-slate-300 px-2 py-2" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <input type="date" className="rounded border border-slate-300 px-2 py-2" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <button type="button" className="rounded border border-slate-300 px-2 py-2 text-sm" onClick={() => { setViewStatus('all'); setFromDate(''); setToDate(''); }}>
              Xóa lọc
            </button>
          </div>

          {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Tiêu đề</th>
                  <th className="px-3 py-2">Loại tin</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Ngày đăng</th>
                  <th className="px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredMyListings.map((item) => {
                  const dealType = resolveDealType(item.title);
                  const options = statusOptionsForTitle(item.title);
                  const detailPath = buildListingPath({ slug: item.slug, title: item.title });
                  const canEdit = isListingEditable(item.createdAt);
                  const editDeadline = formatEditDeadline(item.createdAt);
                  return (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 text-slate-600">{item.id}</td>
                      <td className="px-3 py-2">
                        <a href={detailPath} className="font-medium text-slate-900 hover:text-[var(--brand-primary-hover)]">{item.title}</a>
                        <div className="text-xs text-slate-500">/{item.slug}</div>
                      </td>
                      <td className="px-3 py-2">
                        {shouldShowVipBadge(item.packageType) ? <span className={packageBadgeClassName(item.packageType)}>{packageBadgeLabel(item.packageType)}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-cyan-100 px-2 py-1 text-xs font-semibold text-cyan-800">{listingStatusLabel(item.status, dealType)}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('vi-VN')}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {canEdit ? (
                            <button
                              type="button"
                              className="h-9 shrink-0 rounded border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
                              onClick={() => void openEditListing(item)}
                            >
                              Sửa
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">Hết hạn sửa (đến {editDeadline})</span>
                          )}
                          <select
                            className="h-9 w-[118px] shrink-0 rounded border border-slate-300 px-2 text-sm"
                            value={statusById[item.id] ?? item.status}
                            onChange={(event) => setStatusById((prev) => ({ ...prev, [item.id]: event.target.value }))}
                          >
                            {options.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="h-9 shrink-0 rounded bg-[var(--brand-primary)] px-3 text-sm font-semibold text-white"
                            onClick={() => void updateMyListingStatus(item)}
                          >
                            Cập nhật
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredMyListings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">Không có tin phù hợp bộ lọc.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        {editingDraft ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
            <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900">Sửa tin #{editingDraft.id}</h3>
              <p className="mt-1 text-xs text-slate-500">Chỉ có thể sửa trong {USER_LISTING_EDIT_WINDOW_DAYS} ngày từ ngày đăng.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" value={editingDraft.title} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))} placeholder="Tiêu đề" />
                <textarea className="rounded border border-slate-300 px-3 py-2 sm:col-span-2 min-h-24" value={editingDraft.description} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, description: e.target.value } : prev))} placeholder="Mô tả" />
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.price} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, price: e.target.value } : prev))} placeholder="Giá" />
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.area} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, area: e.target.value } : prev))} placeholder="Diện tích" />
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.bedrooms} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, bedrooms: e.target.value } : prev))} placeholder="Phòng ngủ" />
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.bathrooms} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, bathrooms: e.target.value } : prev))} placeholder="Phòng tắm" />
                <div className="relative sm:col-span-2">
                  <input
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={editingDraft.address}
                    onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, address: e.target.value } : prev))}
                    onFocus={() => {
                      if (!editingDraft.address?.trim()) {
                        setEditAddressSuggestions(buildWardAddressHints(''));
                      }
                    }}
                    onBlur={() => window.setTimeout(() => setEditAddressSuggestions([]), 120)}
                    placeholder="Địa chỉ"
                    autoComplete="off"
                  />
                  {editAddressLoading && (editingDraft.address?.trim().length ?? 0) >= 2 ? (
                    <p className="mt-1 text-xs text-slate-500">Đang gợi ý địa chỉ theo phường/xã Đà Nẵng...</p>
                  ) : null}
                  {editAddressSuggestions.length > 0 ? (
                    <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-auto rounded border border-slate-200 bg-white shadow-md">
                      {editAddressSuggestions.map((item, index) => (
                        <li key={`${item.label}-${index}`}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                            onClick={() => {
                              setEditingDraft((prev) => (prev ? { ...prev, address: item.label } : prev));
                              setEditAddressSuggestions([]);
                            }}
                          >
                            {item.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.contactName} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, contactName: e.target.value } : prev))} placeholder="Người đăng" />
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.contactPhone} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, contactPhone: e.target.value } : prev))} placeholder="SĐT liên hệ" />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700" onClick={() => setEditingDraft(null)} disabled={savingEdit}>Hủy</button>
                <button type="button" className="rounded bg-[var(--brand-primary)] px-3 py-2 text-sm text-white disabled:opacity-60" onClick={() => void saveListingEdit()} disabled={savingEdit}>{savingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}





































