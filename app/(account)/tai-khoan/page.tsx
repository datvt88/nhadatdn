'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { HeaderNav } from '../../../components/header-nav';
import { API_BASE } from '../../../lib/api';
import { authHeaders, hasAdminAccess, readAuthUser, subscribeAuthUser, writeAuthUser, type AuthUser } from '../../../lib/auth-session';
import { listingStatusLabel, packageBadgeLabel, packageBadgeClassName, shouldShowVipBadge } from '../../../lib/listing-labels';
import { formatAreaM2, formatListingDisplayAddress, formatListingPrice, resolveSeoImageUrls, type ListingImageLike } from '../../../lib/listing-presenter';
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
  districtName?: string;
  wardName?: string;
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
type SocialListingDetail = {
  title?: string;
  status?: string;
  description?: string;
  price?: number;
  area?: number;
  address?: string;
  city?: string | { name?: string };
  district?: string | { name?: string };
  ward?: string | { name?: string };
  coverImage?: string;
  images?: ListingImageLike[];
  error?: string;
};
type SocialListingPreview = {
  imageUrl: string;
  location: string;
};
type SocialListingDetailState = {
  listingId: number;
  detail: SocialListingDetail;
};

const USER_LISTING_EDIT_WINDOW_DAYS = 30;
const HOUSE_DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Tây Bắc', 'Đông Bắc', 'Tây Nam', 'Đông Nam'] as const;
const PROPERTY_TYPES = ['Nhà mặt tiền', 'Nhà kiệt, hẻm', 'Biệt thự, nhà liền kề', 'Căn hộ chung cư', 'Nhà trọ, phòng trọ', 'Cửa hàng, kho, xưởng', 'Nhà hàng, khách sạn', 'Đất thổ cư', 'Đất nền, đất dự án', 'Đất nông nghiệp', 'Trang trại, khu sinh thái', 'Các loại khác'] as const;
const PUBLIC_SITE_URL = 'https://nhadatdn.net';

const packageGuide = [
  { packageType: 'NORMAL', beanCost: 5, note: 'Tin thường, trừ 5 Bean/tin' },
  { packageType: 'VIP', beanCost: 50, note: 'Tin VIP ưu tiên hiển thị, trừ 50 Bean/tin' },
] as const;

function resolveListingDealType(item: Pick<MyListingItem, 'title' | 'dealType'>): 'can-ban' | 'can-mua' | 'cho-thue' {
  return resolveDealType(item.title, item.dealType);
}

function normalizeSocialDescription(value?: string): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= 900) return normalized;
  const candidate = normalized.slice(0, 901);
  const boundary = candidate.lastIndexOf(' ');
  return `${candidate.slice(0, boundary >= 720 ? boundary : 900).trim()}…`;
}

function buildSocialProductPost(
  item: MyListingItem,
  detail?: SocialListingDetail,
): { publicUrl: string; facebookUrl: string; caption: string } {
  const dealType = resolveListingDealType(item);
  const detailPath = buildListingPath({
    slug: item.slug,
    title: item.title,
    ...(item.districtName ? { district: item.districtName } : {}),
    ...(item.wardName ? { ward: item.wardName } : {}),
    categoryHint: dealType,
  });
  const publicUrl = new URL(detailPath, PUBLIC_SITE_URL).toString();
  const title = detail?.title?.trim() || item.title.trim();
  const facts = [
    'Giá: ' + formatListingPrice(Number(detail?.price ?? item.price), dealType),
    'Diện tích: ' + formatAreaM2(Number(detail?.area ?? item.area)),
    item.propertyType?.trim() || '',
  ].filter(Boolean);
  const location = formatListingDisplayAddress(
    detail?.address
      || [
        readSocialLocationName(detail?.ward) || item.wardName?.trim(),
        readSocialLocationName(detail?.district) || item.districtName?.trim(),
        readSocialLocationName(detail?.city) || 'TP Đà Nẵng',
      ].filter(Boolean).join(', '),
  );
  const description = normalizeSocialDescription(detail?.description);
  const caption = [
    title,
    facts.join(' | '),
    location ? 'Khu vực: ' + location : '',
    description,
    'Xem chi tiết: ' + publicUrl,
    '#NhadatDN #NhaDatDaNang',
  ].filter(Boolean).join('\n');

  return {
    publicUrl,
    facebookUrl: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(publicUrl),
    caption,
  };
}

function readSocialLocationName(value?: string | { name?: string }): string {
  if (typeof value === 'string') return value.trim();
  return String(value?.name ?? '').trim();
}

function buildSocialShareImageUrl(imageUrl: string): string {
  const params = new URLSearchParams({ url: imageUrl, w: '1200', q: '82' });
  return `/_next/image?${params.toString()}`;
}

async function loadSocialShareImageFile(imageUrl: string, listingId: number, signal: AbortSignal): Promise<File> {
  const response = await fetch(buildSocialShareImageUrl(imageUrl), {
    cache: 'force-cache',
    credentials: 'omit',
    headers: { accept: 'image/jpeg,image/png,image/webp' },
    signal,
  });
  if (!response.ok) throw new Error(`share image failed with status ${response.status}`);

  const blob = await response.blob();
  const mimeType = blob.type.toLowerCase();
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const extension = extensions[mimeType];
  if (!extension || blob.size === 0 || blob.size > 8 * 1024 * 1024) {
    throw new Error('share image is invalid');
  }
  return new File([blob], `nhadatdn-listing-${listingId}.${extension}`, {
    type: mimeType,
    lastModified: Date.now(),
  });
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
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsError, setListingsError] = useState('');
  const [socialListingId, setSocialListingId] = useState('');
  const [socialCaption, setSocialCaption] = useState('');
  const [socialMessage, setSocialMessage] = useState('');
  const [socialPreview, setSocialPreview] = useState<SocialListingPreview | null>(null);
  const [socialDetail, setSocialDetail] = useState<SocialListingDetailState | null>(null);
  const [socialShareImageFile, setSocialShareImageFile] = useState<File | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialPreparingShare, setSocialPreparingShare] = useState(false);
  const [socialPublic, setSocialPublic] = useState(false);
  const [socialCaptionCopied, setSocialCaptionCopied] = useState(false);
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
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingDraft, setEditingDraft] = useState<EditListingDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingListingId, setDeletingListingId] = useState<number | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
  const [editUploading, setEditUploading] = useState(false);
  const [editDragActive, setEditDragActive] = useState(false);
  const [editAddressSuggestions, setEditAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [editAddressLoading, setEditAddressLoading] = useState(false);
  const [danangCatalog, setDanangCatalog] = useState<DanangCatalog | null>(null);
  const socialWidgetRef = useRef<HTMLElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);
  const editDialogRef = useRef<HTMLDivElement | null>(null);

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

  async function loadMyListings(currentUser: AuthUser, signal?: AbortSignal) {
    setListingsLoading(true);
    setListingsError('');
    try {
      const res = await fetch(`${API_BASE}/users/${currentUser.id}/listings?limit=500`, {
        cache: 'no-store',
        credentials: 'include',
        headers: authHeaders(currentUser),
        ...(signal ? { signal } : {}),
      });

      const payload = (await res.json().catch(() => ({}))) as { items?: MyListingItem[]; error?: string };
      if (!res.ok) {
        if (isExpiredSessionError(payload.error)) {
          writeAuthUser(null);
          setUser(null);
          router.replace('/dang-nhap?next=/tai-khoan');
          return;
        }
        setListingsError(`Không thể tải tin đăng: ${String(payload.error ?? 'unknown')}`);
        return;
      }

      const items = payload.items ?? [];
      setMyListings(items);
      const defaults: Record<number, string> = {};
      items.forEach((item) => {
        defaults[item.id] = item.status;
      });
      setStatusById(defaults);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setListingsError('Không thể kết nối backend để tải tin đăng. Vui lòng thử lại.');
    } finally {
      if (!signal?.aborted) setListingsLoading(false);
    }
  }
  async function loadTrackingSettings(currentUser: AuthUser, signal?: AbortSignal) {
    const res = await fetch(`${API_BASE}/users/${currentUser.id}/settings`, {
      cache: 'no-store',
      credentials: 'include',
      headers: authHeaders(currentUser),
      ...(signal ? { signal } : {}),
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
    const resolvedAvatarUrl = payload.avatarUrl ?? currentUser.avatarUrl ?? '';
    setFullName(resolvedFullName);
    setZaloPhone(resolvedPhone);
    setPhoneVerified(resolvedPhoneVerified);
    setGoogleTrackingKey(payload.googleTrackingKey ?? '');
    setFacebookTrackingKey(payload.facebookTrackingKey ?? '');
    setProfileBio(payload.bio ?? '');
    setAvatarUrl(resolvedAvatarUrl);
    if (currentUser.fullName !== resolvedFullName || currentUser.phone !== resolvedPhone || Boolean(currentUser.phoneVerified) !== resolvedPhoneVerified || (currentUser.avatarUrl ?? '') !== resolvedAvatarUrl) {
      const nextUser: AuthUser = { ...currentUser, fullName: resolvedFullName, phone: resolvedPhone, phoneVerified: resolvedPhoneVerified };
      if (resolvedAvatarUrl) {
        nextUser.avatarUrl = resolvedAvatarUrl;
      } else {
        delete nextUser.avatarUrl;
      }
      writeAuthUser(nextUser);
      setUser(nextUser);
    }
  }

  useEffect(() => {
    if (!user) {
      setMyListings([]);
      setListingsLoading(false);
      return;
    }
    const controller = new AbortController();
    void loadMyListings(user, controller.signal);
    void loadTrackingSettings(user, controller.signal).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage('Không thể tải thông tin tài khoản. Vui lòng thử lại.');
    });
    return () => controller.abort();
  }, [user?.id]);

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

      for (const ward of district.wards ?? []) {
        const wardName = String(ward.name ?? '').trim();
        if (!wardName) continue;
        const candidate = `${wardName}, TP Đà Nẵng`;
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
                const mapped: AddressSuggestion = { label: formatListingDisplayAddress(item.label) };
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
    if (!user || settingsSaving) return;
    setSettingsSaving(true);
    try {
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
        setMessage(`Lỗi lưu thông tin tài khoản: ${String(payload.error ?? 'unknown')}`);
        return;
      }
      const normalizedPhone = zaloPhone.trim();
      const phoneChanged = normalizedPhone !== String(user.phone ?? '').trim();
      const nextUser: AuthUser = {
        ...user,
        fullName: fullName.trim() || user.fullName,
        phone: normalizedPhone,
        phoneVerified: phoneChanged ? false : Boolean(user.phoneVerified),
      };
      writeAuthUser(nextUser);
      setUser(nextUser);
      setPhoneVerified(Boolean(nextUser.phoneVerified));
      setMessage('Đã lưu thông tin tài khoản thành công.');
    } catch {
      setMessage('Không thể kết nối backend để lưu thông tin. Vui lòng thử lại.');
    } finally {
      setSettingsSaving(false);
    }
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
  useEffect(() => {
    if (!editingDraft || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingDraft(null);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => editDialogRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingDraft?.id]);
  const filteredMyListings = useMemo(() => {
    return myListings.filter((item) => {
      if (viewStatus !== 'all' && toViewStatus(item) !== viewStatus) {
        return false;
      }
      return inDateRange(item, fromDate, toDate);
    });
  }, [myListings, viewStatus, fromDate, toDate]);
  const listingSummary = useMemo(() => ({
    total: myListings.length,
    active: myListings.filter((item) => item.status === 'ACTIVE').length,
    completed: myListings.filter((item) => item.status === 'SOLD' || item.status === 'RENTED').length,
  }), [myListings]);

  const socialShareableListings = useMemo(
    () => myListings.filter((item) => item.status === 'ACTIVE' && item.slug.trim().length > 0),
    [myListings],
  );
  const selectedSocialListing = useMemo(
    () => socialShareableListings.find((item) => String(item.id) === socialListingId) ?? null,
    [socialListingId, socialShareableListings],
  );
  const selectedSocialPost = useMemo(
    () => (selectedSocialListing
      ? buildSocialProductPost(
          selectedSocialListing,
          socialDetail?.listingId === selectedSocialListing.id ? socialDetail.detail : undefined,
        )
      : null),
    [selectedSocialListing, socialDetail],
  );
  const defaultSocialCaption = selectedSocialPost?.caption ?? '';

  useEffect(() => {
    setSocialCaption(defaultSocialCaption);
    setSocialMessage('');
    setSocialCaptionCopied(false);
  }, [defaultSocialCaption]);

  useEffect(() => {
    const listing = selectedSocialListing;
    if (!listing) {
      setSocialPreview(null);
      setSocialDetail(null);
      setSocialShareImageFile(null);
      setSocialLoading(false);
      setSocialPublic(false);
      return;
    }

    const controller = new AbortController();
    setSocialPreview(null);
    setSocialDetail(null);
    setSocialShareImageFile(null);
    setSocialLoading(true);
    setSocialPublic(false);

    void (async () => {
      try {
        const res = await fetch(API_BASE + '/listings/' + encodeURIComponent(listing.slug), {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = (await res.json().catch(() => ({}))) as SocialListingDetail;
        if (controller.signal.aborted) return;

        if (!res.ok) {
          setSocialMessage(
            res.status === 404
              ? 'Tin này hiện không còn hiển thị public nên chưa thể chia sẻ.'
              : 'Không thể kiểm tra trạng thái public của tin. Vui lòng thử lại.',
          );
          return;
        }
        if (String(payload.status ?? '').toUpperCase() !== 'ACTIVE') {
          setSocialMessage('Chỉ tin đang hoạt động và còn hiển thị public mới có thể chia sẻ.');
          return;
        }

        const detailLocation = formatListingDisplayAddress(
          payload.address
            || [
              readSocialLocationName(payload.ward),
              readSocialLocationName(payload.district),
              readSocialLocationName(payload.city) || 'TP Đà Nẵng',
            ].filter(Boolean).join(', '),
        );
        const imageUrl = resolveSeoImageUrls({
          images: payload.images,
          coverImage: payload.coverImage,
        })[0] ?? '';
        let shareImageFile: File | null = null;
        if (imageUrl) {
          try {
            shareImageFile = await loadSocialShareImageFile(imageUrl, listing.id, controller.signal);
          } catch {
            shareImageFile = null;
          }
        }
        if (controller.signal.aborted) return;

        setSocialPreview({
          imageUrl,
          location: detailLocation,
        });
        setSocialDetail({ listingId: listing.id, detail: payload });
        setSocialShareImageFile(shareImageFile);
        setSocialPublic(true);
        setSocialMessage(
          shareImageFile
            ? 'Tin đã sẵn sàng với nội dung và ảnh để chia sẻ.'
            : 'Tin đã sẵn sàng. Ứng dụng sẽ nhận nội dung, link và ảnh xem trước khi hỗ trợ.',
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSocialMessage('Không thể kiểm tra tin public. Vui lòng kiểm tra kết nối và thử lại.');
      } finally {
        if (!controller.signal.aborted) setSocialLoading(false);
      }
    })();

    return () => controller.abort();
  }, [selectedSocialListing]);

  useEffect(() => {
    setSocialListingId('');
    setSocialCaption('');
    setSocialMessage('');
    setSocialPreview(null);
    setSocialDetail(null);
    setSocialShareImageFile(null);
    setSocialLoading(false);
    setSocialPreparingShare(false);
    setSocialPublic(false);
    setSocialCaptionCopied(false);
  }, [user?.id]);

  function shareableSocialCaption(): string {
    const caption = socialCaption.trim();
    if (!selectedSocialPost) return caption;
    if (caption.includes(selectedSocialPost.publicUrl)) return caption;
    return [caption, 'Xem chi tiết: ' + selectedSocialPost.publicUrl].filter(Boolean).join('\n');
  }

  async function copySocialCaption(target?: string): Promise<boolean> {
    const content = shareableSocialCaption();
    if (!content) return false;
    try {
      await navigator.clipboard.writeText(content);
      setSocialCaptionCopied(true);
      setSocialMessage(
        target
          ? 'Đã sao chép nội dung cho ' + target + '.'
          : 'Đã sao chép. Khi Facebook mở, hãy dán nội dung vào bài viết.',
      );
      return true;
    } catch {
      setSocialCaptionCopied(false);
      setSocialMessage('Không thể sao chép tự động. Hãy chọn và sao chép nội dung trong ô bài viết.');
      return false;
    }
  }

  async function shareSocialPost() {
    if (!selectedSocialPost || !socialPublic) return;
    const content = shareableSocialCaption();
    if (!content) return;
    if (typeof navigator.share !== 'function') {
      await copySocialCaption();
      return;
    }

    setSocialPreparingShare(true);
    setSocialMessage('Đang chuẩn bị nội dung và ảnh...');
    let sharedWithImage = false;
    try {
      let shareData: ShareData = {
        title: selectedSocialListing?.title ?? 'Tin đăng NhadatDN',
        text: content,
        url: selectedSocialPost.publicUrl,
      };

      if (socialShareImageFile && typeof navigator.canShare === 'function') {
        try {
          const files = [socialShareImageFile];
          if (navigator.canShare({ files })) {
            shareData = {
              title: selectedSocialListing?.title ?? 'Tin đăng NhadatDN',
              text: content,
              files,
            };
            sharedWithImage = true;
          }
        } catch {
          sharedWithImage = false;
        }
      }

      await navigator.share(shareData);
      setSocialMessage(
        sharedWithImage
          ? 'Đã mở ứng dụng chia sẻ với nội dung, link và ảnh tin đăng.'
          : 'Đã mở ứng dụng chia sẻ với nội dung và link. Ảnh xem trước được lấy từ trang tin khi ứng dụng hỗ trợ.',
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setSocialMessage('Đã hủy chia sẻ. Nội dung vẫn được giữ nguyên.');
        return;
      }
      setSocialMessage('Không thể mở ứng dụng chia sẻ. Bạn có thể sao chép nội dung để đăng thủ công.');
    } finally {
      setSocialPreparingShare(false);
    }
  }

  function focusSocialListing(listing: MyListingItem) {
    setSocialListingId(String(listing.id));
    requestAnimationFrame(() => {
      const widget = socialWidgetRef.current;
      widget?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      widget?.focus({ preventScroll: true });
    });
  }
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
    if (!user || statusUpdatingId !== null) return;

    const nextStatus = statusById[listing.id] ?? listing.status;
    if (nextStatus === listing.status) {
      setMessage(`Trạng thái tin #${listing.id} chưa thay đổi.`);
      return;
    }

    setStatusUpdatingId(listing.id);
    try {
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
    } catch {
      setMessage(`Không thể kết nối backend để cập nhật tin #${listing.id}.`);
    } finally {
      setStatusUpdatingId(null);
    }
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
    try {
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
    } catch {
      setMessage(`Không thể kết nối backend để sửa tin #${editingDraft.id}.`);
    } finally {
      setSavingEdit(false);
    }
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
    try {
      const res = await fetch(`${API_BASE}/users/${activeUser.id}/listings/${listing.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(activeUser),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(`Lỗi xóa tin #${listing.id}: ${String(payload.error ?? 'unknown')}`);
        return;
      }

      setEditingDraft((prev) => (prev?.id === listing.id ? null : prev));
      setMessage(`Đã xóa tin #${listing.id}`);
      await loadMyListings(activeUser);
    } catch {
      setMessage(`Không thể kết nối backend để xóa tin #${listing.id}.`);
    } finally {
      setDeletingListingId(null);
    }
  }
  function userListingPath(item: MyListingItem): string {
    return buildListingPath({
      slug: item.slug,
      title: item.title,
      categoryHint: resolveListingDealType(item),
      ...(item.districtName ? { district: item.districtName } : {}),
      ...(item.wardName ? { ward: item.wardName } : {}),
    });
  }

  function renderListingActions(item: MyListingItem, mobile = false) {
    const options = statusOptionsForListing(item);
    const canEdit = isListingEditable(item.createdAt);
    const editDeadline = formatEditDeadline(item.createdAt);
    const selectedStatus = statusById[item.id] ?? item.status;
    const controlClassName = mobile ? 'min-h-11 w-full' : 'h-9 shrink-0';

    return (
      <div className={mobile ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap items-center gap-2'}>
        {item.status === 'ACTIVE' && item.slug.trim() ? (
          <button
            type="button"
            className={`${controlClassName} rounded border border-sky-300 px-3 text-sm font-semibold text-sky-700 hover:bg-sky-50`}
            onClick={() => focusSocialListing(item)}
            aria-label={`Chia sẻ tin ${item.title}`}
          >
            Chia sẻ
          </button>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            className={`${controlClassName} rounded border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50`}
            onClick={() => void openEditListing(item)}
            aria-label={`Sửa tin ${item.title}`}
          >
            Sửa
          </button>
        ) : (
          <span className={`${mobile ? 'col-span-2' : ''} self-center text-xs text-slate-500`}>Hết hạn sửa (đến {editDeadline})</span>
        )}
        <label className={mobile ? 'col-span-2' : ''}>
          <span className="sr-only">Trạng thái tin {item.title}</span>
          <select
            className={`${controlClassName} ${mobile ? '' : 'w-[132px]'} rounded border border-slate-300 px-2 text-sm`}
            value={selectedStatus}
            onChange={(event) => setStatusById((prev) => ({ ...prev, [item.id]: event.target.value }))}
            disabled={statusUpdatingId === item.id}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`${controlClassName} rounded bg-[var(--brand-primary)] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300`}
          onClick={() => void updateMyListingStatus(item)}
          disabled={statusUpdatingId !== null || selectedStatus === item.status}
          aria-label={`Cập nhật trạng thái tin ${item.title}`}
        >
          {statusUpdatingId === item.id ? 'Đang cập nhật...' : 'Cập nhật'}
        </button>
        <button
          type="button"
          className={`${controlClassName} rounded border border-red-300 px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60`}
          onClick={() => void deleteListing(item)}
          disabled={deletingListingId !== null}
          aria-label={`Xóa tin ${item.title}`}
        >
          {deletingListingId === item.id ? 'Đang xóa...' : 'Xóa'}
        </button>
      </div>
    );
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
      {message ? (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-4 right-4 z-40 flex items-start justify-between gap-3 rounded-lg border border-slate-300 bg-slate-900 px-4 py-3 text-sm text-white shadow-lg sm:left-auto sm:max-w-md">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage('')} className="shrink-0 px-1 font-semibold text-white" aria-label="Đóng thông báo">X</button>
        </div>
      ) : null}
      <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-semibold text-slate-900">Hồ sơ người dùng</h1>
        <p className="mt-2 text-slate-600">Quản lý thông tin tài khoản, Bean và toàn bộ tin bạn đã đăng.</p>
        <nav aria-label="Điều hướng hồ sơ" className="mt-5 flex gap-1 overflow-x-auto border-y border-slate-200 py-2">
          <a href="#ho-so" className="min-h-11 shrink-0 rounded px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white">Hồ sơ</a>
          <a href="#tin-dang" className="min-h-11 shrink-0 rounded px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white">Tin đăng</a>
          <a href="#chia-se" className="min-h-11 shrink-0 rounded px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white">Chia sẻ</a>
          <a href="#cai-dat" className="min-h-11 shrink-0 rounded px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white">Cài đặt</a>
        </nav>

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
          <article id="ho-so" className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900">Thông tin tài khoản</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <dt><label htmlFor="account-full-name" className="text-xs uppercase tracking-wide text-slate-500">Họ tên</label></dt>
                <dd className="mt-1">
                  <input
                    id="account-full-name"
                    className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nhập họ tên"
                  />
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
                <dd className="mt-1 break-all text-sm font-medium text-slate-900">{user.email}</dd>
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
              <span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">Ảnh đại diện trang bio</span>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-xl font-semibold text-slate-500">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={`Ảnh đại diện ${fullName || user.fullName}`} className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
                    className="min-h-11 rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={avatarUploading}
                  >
                    {avatarUploading ? 'Đang upload...' : avatarUrl ? 'Đổi ảnh đại diện' : 'Upload ảnh đại diện'}
                  </button>
                  <p className="mt-2 text-xs text-slate-500">Ảnh upload sẽ được tối ưu 512px để hiển thị nhanh trên card và trang bio.</p>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label htmlFor="account-zalo-phone" className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Số điện thoại (Zalo)</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="account-zalo-phone"
                  inputMode="tel"
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2"
                  placeholder="Nhập số điện thoại Zalo"
                  value={zaloPhone}
                  onChange={(e) => setZaloPhone(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void saveTrackingSettings()}
                  className="min-h-11 shrink-0 rounded bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={settingsSaving}
                >
                  {settingsSaving ? 'Đang lưu...' : 'Lưu thông tin'}
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
              <label htmlFor="account-profile-bio" className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Giới thiệu ngắn trên trang bio cá nhân</label>
              <textarea
                id="account-profile-bio"
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

        <article id="cai-dat" className="mt-6 scroll-mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-slate-900">Cài đặt tài khoản & tracking quảng cáo</h2>
          <p className="mt-1 text-sm text-slate-600">Mỗi tài khoản có key riêng để đánh giá hiệu quả quảng cáo Google/Facebook.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Google Tracking Key
              <input
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal text-slate-900"
                placeholder="Nhập Google Tracking Key"
                value={googleTrackingKey}
                onChange={(e) => setGoogleTrackingKey(e.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Facebook Tracking Key
              <input
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal text-slate-900"
                placeholder="Nhập Facebook Tracking Key"
                value={facebookTrackingKey}
                onChange={(e) => setFacebookTrackingKey(e.target.value)}
              />
            </label>
          </div>
          <button type="button" onClick={() => void saveTrackingSettings()} disabled={settingsSaving} className="mt-3 min-h-11 rounded bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60">{settingsSaving ? 'Đang lưu...' : 'Lưu cài đặt tài khoản'}</button>
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

        <article id="tin-dang" className="mt-6 scroll-mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Tin đăng của tôi</h2>
              <p className="mt-1 text-sm text-slate-600">{listingSummary.active} đang hoạt động · {listingSummary.completed} đã giao dịch · {listingSummary.total} tổng cộng</p>
            </div>
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
            <select aria-label="Lọc tin theo trạng thái" className="min-h-11 rounded border border-slate-300 px-2 py-2" value={viewStatus} onChange={(e) => setViewStatus(e.target.value as ViewStatus)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="active-sale">Đang bán</option>
              <option value="sold">Đã bán</option>
              <option value="active-rent">Đang cho thuê</option>
              <option value="rented">Đã cho thuê</option>
            </select>
            <input type="date" aria-label="Ngày đăng từ" className="min-h-11 rounded border border-slate-300 px-2 py-2" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <input type="date" aria-label="Ngày đăng đến" className="min-h-11 rounded border border-slate-300 px-2 py-2" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <button type="button" className="min-h-11 rounded border border-slate-300 px-2 py-2 text-sm" onClick={() => { setViewStatus('all'); setFromDate(''); setToDate(''); }}>
              Xóa lọc
            </button>
          </div>

          <section
            id="chia-se"
            ref={socialWidgetRef}
            tabIndex={-1}
            className="-mx-5 mt-4 scroll-mt-4 border-y border-sky-200 bg-sky-50/60 px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            aria-labelledby="social-product-post-title"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="social-product-post-title" className="text-base font-semibold text-slate-900">Bài viết sản phẩm mạng xã hội</h3>
              <span className="text-xs font-medium text-slate-600">Facebook · Instagram · Ứng dụng khác</span>
            </div>

            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <div className="space-y-3">
                <select
                  aria-label="Chọn tin đăng để tạo bài viết sản phẩm"
                  className="min-h-11 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  value={socialListingId}
                  onChange={(event) => setSocialListingId(event.target.value)}
                >
                  <option value="">Chọn từ tất cả tin đang hoạt động</option>
                  {socialShareableListings.map((item) => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </select>

                {socialShareableListings.length === 0 ? (
                  <p className="text-sm text-slate-600">Chưa có tin đang hoạt động để chia sẻ.</p>
                ) : null}

                {socialLoading ? (
                  <p className="text-sm text-slate-600" role="status">Đang tải nội dung và chuẩn bị ảnh...</p>
                ) : null}

                {selectedSocialListing && socialPreview && socialPublic ? (
                  <div className="flex gap-3 border-t border-sky-200 pt-3">
                    {socialPreview.imageUrl ? (
                      <img
                        src={socialPreview.imageUrl}
                        alt={'Ảnh tin ' + selectedSocialListing.title}
                        className="h-20 w-24 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded bg-slate-200 px-2 text-center text-xs text-slate-500">
                        Chưa có ảnh
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold text-slate-900">{selectedSocialListing.title}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {formatListingPrice(Number(selectedSocialListing.price), resolveListingDealType(selectedSocialListing))}
                        {' · '}
                        {formatAreaM2(Number(selectedSocialListing.area))}
                      </p>
                      {socialPreview.location ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{socialPreview.location}</p> : null}
                    </div>
                  </div>
                ) : null}

                {selectedSocialPost && socialPublic ? (
                  <a
                    href={selectedSocialPost.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block break-all text-xs font-medium text-[var(--brand-primary-hover)] hover:underline"
                  >
                    {selectedSocialPost.publicUrl}
                  </a>
                ) : null}
              </div>

              <div className="space-y-2">
                <textarea
                  aria-label="Nội dung bài viết sản phẩm"
                  rows={7}
                  className="w-full resize-y rounded border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none focus:border-[var(--brand-primary)] disabled:bg-slate-100"
                  value={socialCaption}
                  onChange={(event) => {
                    setSocialCaption(event.target.value);
                    setSocialCaptionCopied(false);
                  }}
                  disabled={!selectedSocialPost || !socialPublic}
                  placeholder="Chọn tin đăng để tạo nội dung bài viết"
                />
                <button
                  type="button"
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
                  onClick={() => {
                    setSocialCaption(defaultSocialCaption);
                    setSocialCaptionCopied(false);
                    setSocialMessage('Đã khôi phục nội dung mặc định.');
                  }}
                  disabled={!selectedSocialPost || !socialPublic || socialCaption === defaultSocialCaption}
                >
                  Khôi phục nội dung mặc định
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-11 rounded bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                onClick={() => void shareSocialPost()}
                disabled={!selectedSocialPost || !socialPublic || socialLoading || socialPreparingShare || !socialCaption.trim()}
              >
                {socialPreparingShare ? 'Đang chuẩn bị...' : 'Chia sẻ qua ứng dụng'}
              </button>
              <button
                type="button"
                className="min-h-11 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                onClick={() => void copySocialCaption()}
                disabled={!selectedSocialPost || !socialPublic || socialLoading || !socialCaption.trim()}
              >
                {socialCaptionCopied ? 'Đã sao chép' : 'Sao chép nội dung'}
              </button>
              {selectedSocialPost && socialPublic ? (
                <a
                  href={selectedSocialPost.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={'Mở Facebook để chia sẻ tin ' + (selectedSocialListing?.title ?? '')}
                  onClick={() => {
                    setSocialMessage(
                      socialCaptionCopied
                        ? 'Facebook đã mở. Hãy dán nội dung đã sao chép vào bài viết.'
                        : 'Facebook đã mở. Hãy quay lại sao chép nội dung trước khi đăng.',
                    );
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded bg-[#1877f2] px-4 py-2 text-sm font-semibold text-white"
                >
                  Mở Facebook
                </a>
              ) : (
                <button type="button" disabled className="min-h-11 rounded bg-slate-300 px-4 py-2 text-sm font-semibold text-white">Mở Facebook</button>
              )}
              {selectedSocialPost && socialPublic ? (
                <a
                  href="https://www.instagram.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={'Mở Instagram để chia sẻ tin ' + (selectedSocialListing?.title ?? '')}
                  onClick={() => void copySocialCaption('Instagram')}
                  className="inline-flex min-h-11 items-center justify-center rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Mở Instagram
                </a>
              ) : (
                <button type="button" disabled className="min-h-11 rounded border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400">Mở Instagram</button>
              )}
            </div>

            {socialMessage ? <p className="mt-2 text-xs text-slate-600" role="status">{socialMessage}</p> : null}
          </section>

+
+


          {listingsError ? (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
              <span>{listingsError}</span>
              <button type="button" className="min-h-11 shrink-0 rounded border border-red-300 bg-white px-3 font-semibold" onClick={() => void loadMyListings(user)}>
                Thử lại
              </button>
            </div>
          ) : null}
          {listingsLoading ? <p className="mt-4 text-sm text-slate-600" role="status">Đang tải danh sách tin đăng...</p> : null}

          <div className="mt-4 divide-y divide-slate-200 md:hidden">
            {!listingsLoading && !listingsError ? filteredMyListings.map((item) => {
              const dealType = resolveListingDealType(item);
              return (
                <article key={item.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <a href={userListingPath(item)} className="line-clamp-2 font-semibold text-slate-900 hover:text-[var(--brand-primary-hover)]">{item.title}</a>
                      <p className="mt-1 text-xs text-slate-500">Tin #{item.id} · {new Date(item.createdAt).toLocaleDateString('vi-VN')}</p>
                    </div>
                    <span className="shrink-0 rounded bg-cyan-100 px-2 py-1 text-xs font-semibold text-cyan-800">{listingStatusLabel(item.status, dealType)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                    <span>{shouldShowVipBadge(item.packageType) ? packageBadgeLabel(item.packageType) : 'Tin thường'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatListingPrice(Number(item.price), dealType)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatAreaM2(Number(item.area))}</span>
                  </div>
                  <div className="mt-3">{renderListingActions(item, true)}</div>
                </article>
              );
            }) : null}
            {!listingsLoading && !listingsError && filteredMyListings.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Không có tin phù hợp bộ lọc.</p>
            ) : null}
          </div>
          <div className="mt-4 hidden overflow-x-auto md:block">
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
                  const detailPath = userListingPath(item);
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
                        {renderListingActions(item)}
                      </td>
                    </tr>
                  );
                })}
                {!listingsLoading && !listingsError && filteredMyListings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">Không có tin phù hợp bộ lọc.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        {editingDraft ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-0 sm:p-4">
            <div ref={editDialogRef} role="dialog" aria-modal="true" aria-labelledby="edit-listing-title" tabIndex={-1} className="h-full max-h-full w-full max-w-4xl overflow-y-auto border border-slate-200 bg-white p-4 shadow-xl outline-none sm:h-auto sm:max-h-[92vh] sm:rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <h3 id="edit-listing-title" className="text-lg font-semibold text-slate-900">Sửa tin #{editingDraft.id}</h3>
                <button type="button" className="min-h-11 min-w-11 rounded border border-slate-300 text-sm font-semibold text-slate-700" onClick={() => setEditingDraft(null)} disabled={savingEdit} aria-label="Đóng cửa sổ sửa tin">X</button>
              </div>
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
                              setEditingDraft((prev) => (prev ? { ...prev, address: formatListingDisplayAddress(item.label) } : prev));
                              setEditAddressSuggestions([]);
                            }}
                          >
                            {formatListingDisplayAddress(item.label)}
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
              <div className="sticky bottom-0 -mx-4 mt-4 flex justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
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





































