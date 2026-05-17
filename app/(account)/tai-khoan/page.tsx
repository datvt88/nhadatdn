'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
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
  dealType?: string;
  propertyType?: string;
  createdAt: string;
};

type UploadedImage = { url: string; size: number };
type EditListingDraft = {
  id: number;
  slug: string;
  title: string;
  description: string;
  price: string;
  area: string;
  bedrooms: string;
  bathrooms: string;
  districtId: string;
  wardId: string;
  address: string;
  dealType: 'can-ban' | 'can-mua' | 'cho-thue';
  propertyType: string;
  houseDirection: string;
  frontage: string;
  roadWidth: string;
  floors: string;
  contactName: string;
  contactPhone: string;
  images: UploadedImage[];
};
type AddressSuggestion = { label: string; lat?: number; lng?: number };
type WardCatalogItem = { id: number; name: string; slug?: string };
type DistrictCatalogItem = { id: number; name: string; slug?: string; wards: WardCatalogItem[] };
type DanangCatalog = { cityId?: number; cityName?: string; districts?: DistrictCatalogItem[] };
type ViewStatus = 'all' | 'active-sale' | 'sold' | 'active-rent' | 'rented';
type UploadResult = { items?: Array<{ url?: string; size?: number }> };
type SessionPayload = { user?: AuthUser; sessionToken?: string; error?: string };

const USER_LISTING_EDIT_WINDOW_DAYS = 30;
const HOUSE_DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Tây Bắc', 'Đông Bắc', 'Tây Nam', 'Đông Nam'] as const;
const PROPERTY_TYPES = ['Nhà mặt tiền', 'Nhà kiệt, hẻm', 'Biệt thự, nhà liền kề', 'Căn hộ chung cư', 'Nhà trọ, phòng trọ', 'Cửa hàng, kho, xưởng', 'Nhà hàng, khách sạn', 'Đất thổ cư', 'Đất nền, đất dự án', 'Đất nông nghiệp', 'Trang trại, khu sinh thái', 'Các loại khác'] as const;

const packageGuide = [
  { packageType: 'NORMAL', beanCost: 5, note: 'Tin thường, trừ 5 Bean/tin' },
  { packageType: 'VIP', beanCost: 50, note: 'Tin VIP ưu tiên hiển thị, trừ 50 Bean/tin' },
] as const;

function resolveListingDealType(item: Pick<MyListingItem, 'title' | 'dealType'>): 'can-ban' | 'can-mua' | 'cho-thue' {
  return resolveDealType(item.title, item.dealType);
}

function statusOptionsForListing(item: Pick<MyListingItem, 'title' | 'dealType'>): Array<{ value: 'ACTIVE' | 'SOLD' | 'RENTED'; label: string }> {
  const dealType = resolveListingDealType(item);
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
  return resolveListingDealType(item) === 'cho-thue' ? 'active-rent' : 'active-sale';
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

function normalizeDecimalInput(raw: string): string {
  const cleaned = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/tr\/tháng|tr\/thang|triệu\/tháng|trieu\/thang/g, '')
    .replace(/tỷ|ty/g, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '.');
  const dots = cleaned.match(/\./g);
  if (!dots || dots.length <= 1) return cleaned;
  const lastDot = cleaned.lastIndexOf('.');
  return `${cleaned.slice(0, lastDot).replace(/\./g, '')}${cleaned.slice(lastDot)}`;
}

function parsePositiveDecimal(raw: string, maxFractionDigits?: number): number | null {
  const normalized = normalizeDecimalInput(raw);
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  if (typeof maxFractionDigits === 'number' && maxFractionDigits >= 0) {
    const fraction = normalized.split('.')[1] ?? '';
    if (fraction.length > maxFractionDigits) return null;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseOptionalDecimal(raw: string): number | undefined {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return undefined;
  return parsePositiveDecimal(trimmed) ?? undefined;
}

function parseNonNegativeInt(raw: string): number | null {
  const normalized = normalizeDecimalInput(raw);
  if (!normalized) return 0;
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function normalizePhone(raw: string): string {
  return String(raw ?? '').replace(/[^0-9]/g, '');
}

function buildUploadApiCandidates(path: string): string[] {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const candidates: string[] = [];
  const seen = new Set<string>();
  const addCandidate = (value: string) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  const publicBase = (process.env.NEXT_PUBLIC_API_BASE ?? '').trim().replace(/\/+$/, '');
  if (typeof window !== 'undefined' && /^https?:\/\//i.test(publicBase)) {
    addCandidate(`${publicBase}${normalizedPath}`);
  }
  addCandidate(`${API_BASE}${normalizedPath}`);
  addCandidate(`/api${normalizedPath}`);
  return candidates;
}

async function uploadImagesWithFallback(path: string, form: FormData, headers: Record<string, string>): Promise<Response> {
  const candidates = buildUploadApiCandidates(path);
  let lastResponse: Response | null = null;
  let lastError: unknown = null;
  for (const target of candidates) {
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: form,
      });
      if (res.ok || res.status === 413) return res;
      lastResponse = res;
      lastError = new Error(`upload failed with status ${res.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastResponse) return lastResponse;
  if (lastError instanceof Error) throw lastError;
  throw new Error('upload request failed');
}
export default function AccountHomePage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [showSignupBeanWelcome, setShowSignupBeanWelcome] = useState(false);
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
  const [profileBio, setProfileBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [editingDraft, setEditingDraft] = useState<EditListingDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingListingId, setDeletingListingId] = useState<number | null>(null);
  const [editUploading, setEditUploading] = useState(false);
  const [editDragActive, setEditDragActive] = useState(false);
  const [editAddressSuggestions, setEditAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [editAddressLoading, setEditAddressLoading] = useState(false);
  const [danangCatalog, setDanangCatalog] = useState<DanangCatalog | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

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
    const payload = (await res.json().catch(() => ({}))) as { fullName?: string; contactPhone?: string; phoneVerified?: boolean; googleTrackingKey?: string; facebookTrackingKey?: string; bio?: string; avatarUrl?: string; error?: string };
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
    setProfileBio(payload.bio ?? '');
    setAvatarUrl(payload.avatarUrl ?? currentUser.avatarUrl ?? '');
    if (currentUser.fullName !== resolvedFullName || currentUser.phone !== resolvedPhone || Boolean(currentUser.phoneVerified) !== resolvedPhoneVerified || (currentUser.avatarUrl ?? '') !== (payload.avatarUrl ?? '')) {
      const nextUser: AuthUser = { ...currentUser, fullName: resolvedFullName, phone: resolvedPhone, phoneVerified: resolvedPhoneVerified, avatarUrl: payload.avatarUrl ?? currentUser.avatarUrl };
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setShowSignupBeanWelcome(new URLSearchParams(window.location.search).get('welcome') === 'bean');
  }, []);

  const selectedEditDistrict = useMemo(() => {
    const districtValue = Number(editingDraft?.districtId ?? '');
    if (!districtValue || !danangCatalog?.districts?.length) return null;
    return danangCatalog.districts.find((item) => item.id === districtValue) ?? null;
  }, [danangCatalog, editingDraft?.districtId]);

  useEffect(() => {
    if (!editingDraft) return;
    if (!selectedEditDistrict) {
      if (editingDraft.wardId !== '') {
        setEditingDraft((prev) => (prev && prev.id === editingDraft.id ? { ...prev, wardId: '' } : prev));
      }
      return;
    }
    const wardExists = selectedEditDistrict.wards.some((item) => String(item.id) === editingDraft.wardId);
    if (wardExists) return;
    const nextWard = selectedEditDistrict.wards[0];
    setEditingDraft((prev) => {
      if (!prev || prev.id !== editingDraft.id) return prev;
      return { ...prev, wardId: nextWard ? String(nextWard.id) : '' };
    });
  }, [editingDraft, selectedEditDistrict]);

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
      body: JSON.stringify({ fullName, contactPhone: zaloPhone, googleTrackingKey, facebookTrackingKey, bio: profileBio }),
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

  async function uploadAvatar(file: File) {
    if (!user) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Vui lòng chọn file ảnh để làm avatar.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Ảnh đại diện tối đa 5MB.');
      return;
    }
    const form = new FormData();
    form.append('avatar', file);
    setAvatarUploading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/avatar`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(user),
        body: form,
      });
      const payload = (await res.json().catch(() => ({}))) as { avatarUrl?: string; error?: string };
      if (!res.ok || !payload.avatarUrl) {
        setMessage(`Lỗi upload avatar: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      const nextUser: AuthUser = { ...user, avatarUrl: payload.avatarUrl };
      setAvatarUrl(payload.avatarUrl);
      writeAuthUser(nextUser);
      setUser(nextUser);
      setMessage('Đã cập nhật ảnh đại diện.');
    } finally {
      setAvatarUploading(false);
      if (avatarFileInputRef.current) {
        avatarFileInputRef.current.value = '';
      }
    }
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

  async function ensureActiveSession(currentUser: AuthUser | null, reason: 'upload' | 'edit' | 'delete'): Promise<AuthUser | null> {
    if (!currentUser) {
      setMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return null;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        cache: 'no-store',
        credentials: 'include',
        headers: authHeaders(currentUser),
      });
      const payload = (await res.json().catch(() => ({}))) as SessionPayload;
      if (!res.ok || !payload.user) {
        if (isExpiredSessionError(payload.error)) {
          writeAuthUser(null);
          setUser(null);
          router.replace('/dang-nhap?next=/tai-khoan');
          setMessage(
            reason === 'upload'
              ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trước khi tải ảnh.'
              : reason === 'delete'
                ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trước khi xóa tin.'
                : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trước khi lưu thay đổi.',
          );
          return null;
        }
        return currentUser;
      }

      const nextUser: AuthUser = {
        ...currentUser,
        ...payload.user,
        ...(typeof payload.sessionToken === 'string' && payload.sessionToken.trim() !== '' ? { sessionToken: payload.sessionToken } : {}),
      };
      writeAuthUser(nextUser);
      setUser(nextUser);
      return nextUser;
    } catch {
      return currentUser;
    }
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
      district?: { name?: string };
      ward?: { name?: string };
      dealType?: string;
      propertyType?: string;
      houseDirection?: string;
      frontage?: number;
      roadWidth?: number;
      floors?: number;
      images?: Array<{ url?: string; webpUrl?: string }>;
      address?: string;
      contact?: { fullName?: string; phone?: string };
      error?: string;
    };
    if (!res.ok) {
      setMessage(`Lỗi tải dữ liệu tin #${listing.id}: ${String(payload.error ?? 'unknown')}`);
      return;
    }

    const districtName = String(payload.district?.name ?? '').trim().toLowerCase();
    const wardName = String(payload.ward?.name ?? '').trim().toLowerCase();
    const matchedDistrict = danangCatalog?.districts?.find((item) => item.name.trim().toLowerCase() === districtName) ?? null;
    const matchedWard = matchedDistrict?.wards?.find((item) => item.name.trim().toLowerCase() === wardName) ?? null;
    const initialImages = Array.isArray(payload.images)
      ? payload.images
          .map((item) => String(item?.url ?? '').trim())
          .filter((value) => value.length > 0)
          .map((url) => ({ url, size: 0 }))
      : [];

    setEditingDraft({
      id: listing.id,
      slug: listing.slug,
      title: String(payload.title ?? listing.title ?? ''),
      description: String(payload.description ?? ''),
      price: String(payload.price ?? listing.price ?? ''),
      area: String(payload.area ?? listing.area ?? ''),
      bedrooms: String(payload.bedrooms ?? 0),
      bathrooms: String(payload.bathrooms ?? 0),
      districtId: matchedDistrict ? String(matchedDistrict.id) : '',
      wardId: matchedWard ? String(matchedWard.id) : '',
      address: String(payload.address ?? ''),
      dealType: payload.dealType === 'cho-thue' ? 'cho-thue' : payload.dealType === 'can-mua' ? 'can-mua' : 'can-ban',
      propertyType: String(payload.propertyType ?? listing.propertyType ?? PROPERTY_TYPES[0]),
      houseDirection: String(payload.houseDirection ?? ''),
      frontage: payload.frontage == null ? '' : String(payload.frontage),
      roadWidth: payload.roadWidth == null ? '' : String(payload.roadWidth),
      floors: payload.floors == null ? '' : String(payload.floors),
      contactName: String(payload.contact?.fullName ?? user.fullName ?? ''),
      contactPhone: String(payload.contact?.phone ?? user.phone ?? ''),
      images: initialImages,
    });
    setEditAddressSuggestions([]);
  }

  async function uploadEditFiles(files: FileList | null) {
    if (!files || files.length === 0 || !editingDraft) return;
    if (editUploading) {
      setMessage('Hệ thống đang tải ảnh trước đó. Vui lòng chờ hoàn tất rồi thử lại.');
      return;
    }

    const incoming = Array.from(files);
    if (editingDraft.images.length + incoming.length > 10) {
      setMessage('Tối đa 10 ảnh cho mỗi tin đăng.');
      return;
    }

    const currentTotalSize = editingDraft.images.reduce((sum, item) => sum + item.size, 0);
    const incomingTotalSize = incoming.reduce((sum, file) => sum + file.size, 0);
    if (currentTotalSize + incomingTotalSize > 50 * 1024 * 1024) {
      setMessage('Tổng dung lượng ảnh vượt quá 50MB.');
      return;
    }

    const activeUser = await ensureActiveSession(user, 'upload');
    if (!activeUser) return;

    const form = new FormData();
    incoming.forEach((file) => form.append('images', file));

    setEditUploading(true);
    let res: Response;
    try {
      res = await uploadImagesWithFallback('/uploads/images', form, authHeaders(activeUser));
    } catch {
      setEditUploading(false);
      setMessage('Upload ảnh thất bại: không kết nối được backend.');
      return;
    }
    setEditUploading(false);

    const payload = (await res.json().catch(() => ({}))) as UploadResult & { error?: string };
    if (!res.ok) {
      setMessage(`Upload ảnh thất bại: ${String(payload.error ?? 'không rõ lỗi')}`);
      return;
    }

    const nextItems = (payload.items ?? [])
      .map((item) => ({ url: String(item.url ?? '').trim(), size: Number(item.size ?? 0) }))
      .filter((item) => item.url.length > 0);

    setEditingDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, images: [...prev.images, ...nextItems].slice(0, 10) };
    });
    setMessage(`Upload thành công ${nextItems.length} ảnh.`);
  }

  function removeEditImage(url: string) {
    setEditingDraft((prev) => (prev ? { ...prev, images: prev.images.filter((item) => item.url !== url) } : prev));
  }

  function handleEditDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (editUploading) return;
    setEditDragActive(true);
  }

  function handleEditDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setEditDragActive(false);
  }

  function handleEditDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setEditDragActive(false);
    if (editUploading) return;
    void uploadEditFiles(event.dataTransfer.files);
  }

  async function saveListingEdit() {
    if (!user || !editingDraft || savingEdit) return;
    const activeUser = await ensureActiveSession(user, 'edit');
    if (!activeUser) return;

    const price = parsePositiveDecimal(editingDraft.price, 2);
    const area = parsePositiveDecimal(editingDraft.area);
    const bedrooms = parseNonNegativeInt(editingDraft.bedrooms);
    const bathrooms = parseNonNegativeInt(editingDraft.bathrooms);
    const districtValue = Number(editingDraft.districtId);
    const wardValue = Number(editingDraft.wardId);
    const frontage = parseOptionalDecimal(editingDraft.frontage);
    const roadWidth = parseOptionalDecimal(editingDraft.roadWidth);
    const floors = editingDraft.floors.trim() === '' ? undefined : parseNonNegativeInt(editingDraft.floors);
    const contactPhone = normalizePhone(editingDraft.contactPhone);

    if (!editingDraft.title.trim()) {
      setMessage('Tiêu đề không được để trống.');
      return;
    }
    if (!editingDraft.description.trim()) {
      setMessage('Mô tả không được để trống.');
      return;
    }
    if (price === null || area === null || bedrooms === null || bathrooms === null) {
      setMessage('Giá tối đa 2 số sau phẩy; diện tích, phòng ngủ hoặc phòng tắm chưa hợp lệ.');
      return;
    }
    if (!districtValue || !wardValue) {
      setMessage('Vui lòng chọn đầy đủ quận và phường/xã.');
      return;
    }
    if (!editingDraft.address.trim()) {
      setMessage('Địa chỉ không được để trống.');
      return;
    }
    if (floors === null) {
      setMessage('Số tầng chưa hợp lệ.');
      return;
    }
    if (contactPhone.length > 0 && contactPhone.length < 8) {
      setMessage('Số điện thoại liên hệ chưa hợp lệ.');
      return;
    }
    if (editingDraft.images.length === 0) {
      setMessage('Tin đăng cần ít nhất 1 hình ảnh.');
      return;
    }

    setSavingEdit(true);
    const res = await fetch(`${API_BASE}/users/${activeUser.id}/listings/${editingDraft.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(activeUser),
      },
      body: JSON.stringify({
        title: editingDraft.title.trim(),
        description: editingDraft.description.trim(),
        price,
        area,
        bedrooms,
        bathrooms,
        districtId: districtValue,
        wardId: wardValue,
        address: editingDraft.address.trim(),
        dealType: editingDraft.dealType,
        propertyType: editingDraft.propertyType,
        houseDirection: editingDraft.houseDirection.trim(),
        frontage,
        roadWidth,
        floors,
        contactName: editingDraft.contactName.trim(),
        contactPhone: editingDraft.contactPhone.trim(),
        images: editingDraft.images.map((item) => ({ url: item.url })),
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
    setUser((prev) => {
      if (!prev) return prev;
      const nextUser: AuthUser = {
        ...prev,
        fullName: editingDraft.contactName.trim() || prev.fullName,
        phone: editingDraft.contactPhone.trim() || prev.phone || '',
      };
      writeAuthUser(nextUser);
      return nextUser;
    });
    await loadMyListings(activeUser);
  }

  async function deleteListing(listing: MyListingItem) {
    if (!user || deletingListingId !== null) return;
    const confirmed = typeof window !== 'undefined'
      ? window.confirm(`Xóa vĩnh viễn tin #${listing.id}?\n\nThao tác này sẽ xóa tin đăng và toàn bộ ảnh hiện có.`)
      : false;
    if (!confirmed) return;

    const activeUser = await ensureActiveSession(user, 'delete');
    if (!activeUser) return;

    setDeletingListingId(listing.id);
    const res = await fetch(`${API_BASE}/users/${activeUser.id}/listings/${listing.id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: authHeaders(activeUser),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setDeletingListingId(null);
    if (!res.ok) {
      setMessage(`Lỗi xóa tin #${listing.id}: ${String(payload.error ?? 'unknown')}`);
      return;
    }

    setEditingDraft((prev) => (prev?.id === listing.id ? null : prev));
    setMessage(`Đã xóa tin #${listing.id}`);
    await loadMyListings(activeUser);
  }

  if (!hydrated) {
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

        {showSignupBeanWelcome ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-sm">
            <p className="text-base font-semibold">Chào mừng tài khoản mới.</p>
            <p className="mt-1 text-sm">
              Bạn được tặng 100 Bean để sử dụng đăng tin miễn phí: có thể đăng 20 tin thường hoặc 2 tin VIP.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/dang-tin-nha-dat" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                Đăng tin ngay
              </Link>
              <button
                type="button"
                className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-white"
                onClick={() => {
                  setShowSignupBeanWelcome(false);
                  router.replace('/tai-khoan' as never);
                }}
              >
                Ẩn thông báo
              </button>
            </div>
          </div>
        ) : null}

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
              <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">Ảnh đại diện trang bio</label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-xl font-semibold text-slate-500">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={`Ảnh đại diện ${fullName || user.fullName}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span aria-hidden="true">{(fullName || user.fullName || user.email || 'N').trim().charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadAvatar(file);
                    }}
                  />
                  <button
                    type="button"
                    className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={avatarUploading}
                  >
                    {avatarUploading ? 'Đang upload...' : avatarUrl ? 'Đổi ảnh đại diện' : 'Upload ảnh đại diện'}
                  </button>
                  <p className="mt-2 text-xs text-slate-500">
                    Nếu đăng nhập bằng Google, hệ thống tự dùng ảnh Google khi bạn chưa upload avatar riêng. Ảnh upload sẽ được tối ưu 512px để hiển thị nhanh trên card và trang bio.
                  </p>
                </div>
              </div>
            </div>
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
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Giới thiệu ngắn trên trang bio cá nhân</label>
              <textarea
                className="min-h-[96px] w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="Ví dụ: Chuyên nhà đất Đà Nẵng, hỗ trợ xem nhà và kiểm tra pháp lý."
                value={profileBio}
                maxLength={300}
                onChange={(e) => setProfileBio(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">{profileBio.length}/300 ký tự. Nội dung này sẽ hiển thị công khai tại trang bio người đăng.</p>
            </div>
          </article>

          <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-emerald-900">Số dư Bean</h2>
            <p className="mt-3 text-3xl font-bold text-emerald-700">{user.beanBalance}</p>
            <p className="mt-2 text-sm text-emerald-900/80">Đăng tin thường trừ 5 Bean. Đăng tin VIP trừ 50 Bean.</p>
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
                  const dealType = resolveListingDealType(item);
                  const options = statusOptionsForListing(item);
                  const detailPath = buildListingPath({ slug: item.slug, title: item.title, categoryHint: dealType });
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
                        <div className="flex flex-wrap items-center gap-2">
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
                          <button
                            type="button"
                            className="h-9 shrink-0 rounded border border-red-300 px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                            onClick={() => void deleteListing(item)}
                            disabled={deletingListingId === item.id}
                          >
                            {deletingListingId === item.id ? 'Đang xóa...' : 'Xóa'}
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
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900">Sửa tin #{editingDraft.id}</h3>
              <p className="mt-1 text-xs text-slate-500">Chỉ có thể sửa trong {USER_LISTING_EDIT_WINDOW_DAYS} ngày từ ngày đăng.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" value={editingDraft.title} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))} placeholder="Tiêu đề" />
                <select className="rounded border border-slate-300 px-3 py-2" value={editingDraft.dealType} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, dealType: e.target.value as EditListingDraft['dealType'] } : prev))}>
                  <option value="can-ban">Cần bán</option>
                  <option value="can-mua">Cần mua</option>
                  <option value="cho-thue">Cho thuê</option>
                </select>
                <select className="rounded border border-slate-300 px-3 py-2" value={editingDraft.propertyType} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, propertyType: e.target.value } : prev))}>
                  {PROPERTY_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <textarea className="min-h-28 rounded border border-slate-300 px-3 py-2 sm:col-span-2" value={editingDraft.description} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, description: e.target.value } : prev))} placeholder="Mô tả" />
                <div className="flex overflow-hidden rounded border border-slate-300">
                  <input className="min-w-0 flex-1 px-3 py-2 outline-none" value={editingDraft.price} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, price: e.target.value } : prev))} placeholder={editingDraft.dealType === 'cho-thue' ? 'Giá thuê' : 'Giá bán'} />
                  <span className="flex items-center whitespace-nowrap px-3 text-sm font-semibold text-slate-600">{editingDraft.dealType === 'cho-thue' ? 'tr/tháng' : 'Tỷ'}</span>
                </div>
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.area} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, area: e.target.value } : prev))} placeholder="Diện tích m2" />
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.bedrooms} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, bedrooms: e.target.value } : prev))} placeholder="Số phòng ngủ" />
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.bathrooms} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, bathrooms: e.target.value } : prev))} placeholder="Số phòng toilet" />
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.floors} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, floors: e.target.value } : prev))} placeholder="Số tầng" />
                <select className="rounded border border-slate-300 px-3 py-2" value={editingDraft.houseDirection} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, houseDirection: e.target.value } : prev))}>
                  <option value="">Hướng nhà đất</option>
                  {HOUSE_DIRECTIONS.map((dir) => (
                    <option key={dir} value={dir}>{dir}</option>
                  ))}
                </select>
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.frontage} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, frontage: e.target.value } : prev))} placeholder="Chiều ngang (m)" />
                <input className="rounded border border-slate-300 px-3 py-2" value={editingDraft.roadWidth} onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, roadWidth: e.target.value } : prev))} placeholder="Đường vào (m)" />
                <select
                  className="rounded border border-slate-300 px-3 py-2"
                  value={editingDraft.districtId}
                  onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, districtId: e.target.value } : prev))}
                >
                  <option value="">Chọn quận/huyện</option>
                  {danangCatalog?.districts?.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <select
                  className="rounded border border-slate-300 px-3 py-2"
                  value={editingDraft.wardId}
                  onChange={(e) => setEditingDraft((prev) => (prev ? { ...prev, wardId: e.target.value } : prev))}
                >
                  <option value="">Chọn phường/xã</option>
                  {(selectedEditDistrict?.wards ?? []).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
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

              <div className="mt-4">
                <div
                  className={`rounded-xl border-2 border-dashed p-4 text-center transition ${editDragActive ? 'border-[var(--brand-primary)] bg-cyan-50' : 'border-slate-300 bg-slate-50'}`}
                  onDragOver={handleEditDragOver}
                  onDragLeave={handleEditDragLeave}
                  onDrop={handleEditDrop}
                >
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void uploadEditFiles(e.target.files);
                      e.currentTarget.value = '';
                    }}
                    disabled={editUploading}
                  />
                  <p className="text-sm font-medium text-slate-700">Kéo thả ảnh vào đây hoặc chọn ảnh để thêm vào tin đăng</p>
                  <p className="mt-1 text-xs text-slate-500">Tối đa 10 ảnh, tổng dung lượng không quá 50MB.</p>
                  <button type="button" className="mt-3 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-white disabled:opacity-60" onClick={() => editFileInputRef.current?.click()} disabled={editUploading}>
                    {editUploading ? 'Đang tải ảnh...' : 'Chọn ảnh'}
                  </button>
                </div>
                {editingDraft.images.length > 0 ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {editingDraft.images.map((image) => (
                      <div key={image.url} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <img src={image.url} alt="Ảnh tin đăng" className="h-40 w-full object-cover" />
                        <div className="flex items-center justify-between gap-2 p-3">
                          <span className="truncate text-xs text-slate-500">{image.url.split('/').pop()}</span>
                          <button type="button" className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50" onClick={() => removeEditImage(image.url)}>
                            Xóa ảnh
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">Tin đăng cần ít nhất 1 ảnh.</p>
                )}
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





































