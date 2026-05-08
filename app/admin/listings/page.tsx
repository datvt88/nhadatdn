'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HeaderNav } from '../../../components/header-nav';
import { API_BASE } from '../../../lib/api';
import { authHeaders, hasAdminAccess, readAuthUser, subscribeAuthUser, writeAuthUser } from '../../../lib/auth-session';
import { listingStatusLabel, packageBadgeLabel, packageBadgeClassName, shouldShowVipBadge, type DealType } from '../../../lib/listing-labels';
import { resolveDealType } from '../../../lib/listing-route';

type ListingItem = {
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

type AdminListingImage = {
  id: number;
  url: string;
  webpUrl?: string | null;
  sortOrder: number;
};

type AdminListingDetail = {
  id: number;
  slug: string;
  title: string;
  description: string;
  price: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  address: string;
  status: string;
  packageType: string;
  userId: number;
  contactName: string;
  contactPhone: string;
  dealType?: string;
  propertyType?: string;
  districtName?: string;
  wardName?: string;
  createdAt: string;
  images: AdminListingImage[];
};

type ModerationSuggestion = {
  action: string;
  reason: string;
  confidence: number;
  suggestedDealType?: string;
  suggestedPropertyType?: string;
  suggestedStatus?: string;
  source: string;
};

type ModerationReviewResponse = {
  listing: ListingItem;
  suggestion: ModerationSuggestion;
  warning?: string;
  error?: string;
};

type ViewStatus = 'all' | 'active-sale' | 'sold' | 'active-rent' | 'rented';
type CleanupTarget = 'listings' | 'listing_moderation_actions' | 'outbox_events' | 'user_verifications' | 'bean_blockchain_events' | 'bean_transactions';

type ListingDisplayConfig = {
  vipWeight: number;
  normalWeight: number;
  freeWeight: number;
  updatedAt: string | null;
};

type ListingLifecycleConfig = {
  expireDays: number;
  updatedAt: string | null;
};

type AdminCleanupResult = {
  target: string;
  cutoffAt: string;
  listingStatus?: string;
  dealType?: string;
  matchedListings?: number;
  matchedImages?: number;
  deletedListings?: number;
  deletedImages?: number;
  failedImageDeletes?: number;
  affectedRows?: number;
  error?: string;
};

const statuses = ['DRAFT', 'ACTIVE', 'SOLD', 'RENTED', 'EXPIRED', 'ARCHIVED'] as const;
const moderationActions = ['NO_ACTION', 'RECATEGORIZE', 'SET_STATUS', 'ARCHIVE', 'REMOVE'] as const;
const propertyTypeOptions = ['Nhà mặt tiền', 'Nhà kiệt, hẻm', 'Biệt thự, nhà liền kề', 'Căn hộ chung cư', 'Nhà trọ, phòng trọ', 'Cửa hàng, kho, xưởng', 'Nhà hàng, khách sạn', 'Đất thổ cư', 'Đất nền, đất dự án', 'Đất nông nghiệp', 'Trang trại, khu sinh thái', 'Các loại khác'] as const;
const moderationDealTypeOptions = [
  { value: 'can-ban', label: 'Cần bán' },
  { value: 'can-mua', label: 'Cần mua' },
  { value: 'cho-thue', label: 'Cho thuê' },
] as const;

const propertyTypeSet = new Set<string>(propertyTypeOptions);

function titleFromSlug(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function displayListingTitle(item: ListingItem): string {
  const title = (item.title ?? '').trim();
  if (title) return title;
  return titleFromSlug(item.slug);
}

function normalizeDealTypeValue(item: ListingItem): 'can-ban' | 'can-mua' | 'cho-thue' {
  const value = (item.dealType ?? '').trim().toLowerCase();
  if (value === 'cho-thue' || value === 'can-mua' || value === 'can-ban') return value;
  if (value === 'mua-ban') return 'can-ban';
  return resolveDealType(item.title, item.dealType);
}

function normalizePropertyTypeValue(value?: string): string {
  const normalized = (value ?? '').trim();
  if (propertyTypeSet.has(normalized)) return normalized;
  return 'Các loại khác';
}

function toViewStatus(item: ListingItem): ViewStatus {
  if (item.status === 'SOLD') return 'sold';
  if (item.status === 'RENTED') return 'rented';
  return normalizeDealTypeValue(item) === 'cho-thue' ? 'active-rent' : 'active-sale';
}

function inDateRange(item: ListingItem, fromDate: string, toDate: string): boolean {
  const time = new Date(item.createdAt).getTime();
  if (!Number.isFinite(time)) return false;
  if (fromDate && time < new Date(`${fromDate}T00:00:00`).getTime()) return false;
  if (toDate && time > new Date(`${toDate}T23:59:59`).getTime()) return false;
  return true;
}

export default function AdminListingsPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [actorRole, setActorRole] = useState('');
  const [items, setItems] = useState<ListingItem[]>([]);
  const [message, setMessage] = useState('');
  const [editDetail, setEditDetail] = useState<AdminListingDetail | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const [statusById, setStatusById] = useState<Record<number, string>>({});
  const [dealTypeById, setDealTypeById] = useState<Record<number, string>>({});
  const [propertyTypeById, setPropertyTypeById] = useState<Record<number, string>>({});

  const [viewStatus, setViewStatus] = useState<ViewStatus>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [posterIdFilter, setPosterIdFilter] = useState('');

  const [displayConfig, setDisplayConfig] = useState<ListingDisplayConfig>({ vipWeight: 300, normalWeight: 200, freeWeight: 100, updatedAt: null });
  const [lifecycleConfig, setLifecycleConfig] = useState<ListingLifecycleConfig>({ expireDays: 90, updatedAt: null });
  const [savingDisplayConfig, setSavingDisplayConfig] = useState(false);
  const [savingLifecycleConfig, setSavingLifecycleConfig] = useState(false);

  const [cleanupTarget, setCleanupTarget] = useState<CleanupTarget>('listings');
  const [cleanupOlderThanDays, setCleanupOlderThanDays] = useState('180');
  const [cleanupBeforeDate, setCleanupBeforeDate] = useState('');
  const [cleanupListingStatus, setCleanupListingStatus] = useState('');
  const [cleanupDealType, setCleanupDealType] = useState('');
  const [cleanupPreview, setCleanupPreview] = useState<AdminCleanupResult | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  const [reviewListingId, setReviewListingId] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<ModerationReviewResponse | null>(null);
  const [moderationAction, setModerationAction] = useState('NO_ACTION');
  const [moderationReason, setModerationReason] = useState('');
  const [moderationDealType, setModerationDealType] = useState('can-ban');
  const [moderationPropertyType, setModerationPropertyType] = useState('Các loại khác');
  const [moderationStatus, setModerationStatus] = useState('ACTIVE');

  useEffect(() => {
    const sync = () => {
      const user = readAuthUser();
      setActorRole(user?.role ?? '');
      setHydrated(true);
    };
    sync();
    return subscribeAuthUser(sync);
  }, []);

  useEffect(() => {
    if (hydrated && !hasAdminAccess(actorRole)) {
      router.replace('/dang-nhap?next=/admin/listings');
    }
  }, [hydrated, actorRole, router]);

  async function loadListings() {
    const user = readAuthUser();
    if (!hasAdminAccess(actorRole) || !user?.sessionToken) return;
    const res = await fetch(`${API_BASE}/admin/listings?limit=500`, { headers: authHeaders(user), cache: 'no-store' });
    const payload = (await res.json().catch(() => ({}))) as { items?: ListingItem[]; error?: string };
    if (res.status === 401) {
      writeAuthUser(null);
      router.replace('/dang-nhap?next=/admin/listings');
      return;
    }
    if (!res.ok) {
      setMessage(`Lỗi tải listings: ${String(payload.error ?? 'unknown')}`);
      return;
    }
    const list = payload.items ?? [];
    setItems(list);
    const statusesDefault: Record<number, string> = {};
    const dealsDefault: Record<number, string> = {};
    const propertyDefault: Record<number, string> = {};
    list.forEach((item) => {
      statusesDefault[item.id] = item.status;
      dealsDefault[item.id] = normalizeDealTypeValue(item);
      propertyDefault[item.id] = normalizePropertyTypeValue(item.propertyType);
    });
    setStatusById(statusesDefault);
    setDealTypeById(dealsDefault);
    setPropertyTypeById(propertyDefault);
  }

  async function loadDisplayConfig() {
    const res = await fetch(`${API_BASE}/admin/listings/display-config`, { headers: authHeaders(readAuthUser()), cache: 'no-store' });
    const payload = (await res.json().catch(() => ({}))) as ListingDisplayConfig & { error?: string };
    if (res.ok) setDisplayConfig({ vipWeight: payload.vipWeight ?? 300, normalWeight: payload.normalWeight ?? 200, freeWeight: payload.freeWeight ?? 100, updatedAt: payload.updatedAt ?? null });
    else setMessage(`Lỗi tải cấu hình hiển thị: ${String(payload.error ?? 'unknown')}`);
  }

  async function loadLifecycleConfig() {
    const res = await fetch(`${API_BASE}/admin/listings/lifecycle-config`, { headers: authHeaders(readAuthUser()), cache: 'no-store' });
    const payload = (await res.json().catch(() => ({}))) as ListingLifecycleConfig & { error?: string };
    if (res.ok) setLifecycleConfig({ expireDays: payload.expireDays ?? 90, updatedAt: payload.updatedAt ?? null });
    else setMessage(`Lỗi tải cấu hình vòng đời: ${String(payload.error ?? 'unknown')}`);
  }

  useEffect(() => {
    if (hydrated && hasAdminAccess(actorRole)) {
      void loadListings();
      void loadDisplayConfig();
      void loadLifecycleConfig();
    }
  }, [hydrated, actorRole]);

  async function saveDisplayConfig() {
    setSavingDisplayConfig(true);
    const res = await fetch(`${API_BASE}/admin/listings/display-config`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...authHeaders(readAuthUser()) },
      body: JSON.stringify({ vipWeight: displayConfig.vipWeight, normalWeight: displayConfig.normalWeight }),
    });
    const payload = (await res.json().catch(() => ({}))) as ListingDisplayConfig & { error?: string };
    setSavingDisplayConfig(false);
    if (!res.ok) return setMessage(`Lỗi lưu cấu hình hiển thị: ${String(payload.error ?? 'unknown')}`);
    setDisplayConfig({ vipWeight: payload.vipWeight ?? displayConfig.vipWeight, normalWeight: payload.normalWeight ?? displayConfig.normalWeight, freeWeight: payload.freeWeight ?? displayConfig.freeWeight, updatedAt: payload.updatedAt ?? null });
    setMessage('Đã lưu cấu hình ưu tiên hiển thị.');
  }

  async function saveLifecycleConfig() {
    setSavingLifecycleConfig(true);
    const res = await fetch(`${API_BASE}/admin/listings/lifecycle-config`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...authHeaders(readAuthUser()) },
      body: JSON.stringify({ expireDays: lifecycleConfig.expireDays }),
    });
    const payload = (await res.json().catch(() => ({}))) as ListingLifecycleConfig & { error?: string };
    setSavingLifecycleConfig(false);
    if (!res.ok) return setMessage(`Lỗi lưu vòng đời: ${String(payload.error ?? 'unknown')}`);
    setLifecycleConfig({ expireDays: payload.expireDays ?? lifecycleConfig.expireDays, updatedAt: payload.updatedAt ?? null });
    setMessage('Đã lưu vòng đời tin (không tự xóa dữ liệu).');
  }

  function cleanupPayload() {
    const parsed = Number.parseInt(cleanupOlderThanDays, 10);
    const olderThanDays = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    return {
      target: cleanupTarget,
      olderThanDays,
      beforeDate: cleanupBeforeDate || undefined,
      listingStatus: cleanupListingStatus || undefined,
      dealType: cleanupDealType || undefined,
    };
  }

  async function previewCleanup() {
    setCleanupLoading(true);
    const res = await fetch(`${API_BASE}/admin/listings/cleanup-preview`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders(readAuthUser()) }, body: JSON.stringify(cleanupPayload()) });
    const payload = (await res.json().catch(() => ({}))) as AdminCleanupResult;
    setCleanupLoading(false);
    if (!res.ok) return setMessage(`Lỗi xem trước cleanup: ${String(payload.error ?? 'unknown')}`);
    setCleanupPreview(payload);
    setMessage('Đã xem trước dữ liệu cần xóa.');
  }

  async function executeCleanup() {
    if (!window.confirm('Xác nhận xóa dữ liệu theo bộ lọc hiện tại?')) return;
    setCleanupLoading(true);
    const res = await fetch(`${API_BASE}/admin/listings/cleanup-execute`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders(readAuthUser()) }, body: JSON.stringify(cleanupPayload()) });
    const payload = (await res.json().catch(() => ({}))) as AdminCleanupResult;
    setCleanupLoading(false);
    if (!res.ok) return setMessage(`Lỗi xóa dữ liệu: ${String(payload.error ?? 'unknown')}`);
    setCleanupPreview(payload);
    setMessage('Đã xóa dữ liệu theo bộ lọc.');
    await loadListings();
  }

  async function updateStatus(id: number) {
    const status = statusById[id] ?? 'ACTIVE';
    const res = await fetch(`${API_BASE}/admin/listings/${id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', ...authHeaders(readAuthUser()) }, body: JSON.stringify({ status }) });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setMessage(`Lỗi cập nhật trạng thái #${id}: ${String(payload.error ?? 'unknown')}`);
    setMessage(`Đã cập nhật trạng thái #${id}.`);
    await loadListings();
  }

  async function recategorize(item: ListingItem) {
    const listingId = item.id;
    const res = await fetch(`${API_BASE}/admin/listings/${listingId}/moderate`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders(readAuthUser()) },
      body: JSON.stringify({ action: 'RECATEGORIZE', reason: 'Admin cập nhật danh mục', source: 'MANUAL', suggestedDealType: dealTypeById[listingId] ?? normalizeDealTypeValue(item), suggestedPropertyType: propertyTypeById[listingId] ?? normalizePropertyTypeValue(item.propertyType) }),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setMessage(`Lỗi lưu danh mục #${listingId}: ${String(payload.error ?? 'unknown')}`);
    setMessage(`Đã lưu danh mục #${listingId}.`);
    await loadListings();
  }

  async function reviewListingByAI(listingId: number) {
    setReviewLoading(true);
    const res = await fetch(`${API_BASE}/admin/moderation/review`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders(readAuthUser()) }, body: JSON.stringify({ listingId }) });
    const payload = (await res.json().catch(() => ({}))) as ModerationReviewResponse;
    setReviewLoading(false);
    if (!res.ok) return setMessage(`Lỗi AI review: ${String(payload.error ?? 'unknown')}`);
    setReviewResult(payload);
    setModerationAction(payload.suggestion.action || 'NO_ACTION');
    setModerationReason(payload.suggestion.reason || '');
    setModerationDealType(payload.suggestion.suggestedDealType || 'can-ban');
    setModerationPropertyType(payload.suggestion.suggestedPropertyType || 'Các loại khác');
    setModerationStatus(payload.suggestion.suggestedStatus || 'ACTIVE');
  }

  async function applyModeration() {
    if (!reviewResult) return;
    const res = await fetch(`${API_BASE}/admin/listings/${reviewResult.listing.id}/moderate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(readAuthUser()) },
      body: JSON.stringify({ action: moderationAction, reason: moderationReason, source: 'MANUAL', suggestedDealType: moderationDealType, suggestedPropertyType: moderationPropertyType, suggestedStatus: moderationStatus }),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setMessage(`Lỗi apply moderation: ${String(payload.error ?? 'unknown')}`);
    setMessage('Đã áp dụng moderation.');
    await loadListings();
  }

  async function exportListings() {
    const params = new URLSearchParams();
    params.set('viewStatus', viewStatus);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    if (posterIdFilter.trim()) params.set('posterId', posterIdFilter.trim());
    const res = await fetch(`${API_BASE}/admin/listings/export?${params.toString()}`, { headers: authHeaders(readAuthUser()) });
    if (!res.ok) return setMessage('Lỗi export CSV');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'google-ads-real-estate-admin-listings.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function openEditListing(listingID: number) {
    setEditLoading(true);
    const res = await fetch(`${API_BASE}/admin/listings/${listingID}`, { headers: authHeaders(readAuthUser()), cache: 'no-store' });
    const payload = (await res.json().catch(() => ({}))) as AdminListingDetail & { error?: string };
    setEditLoading(false);
    if (!res.ok) {
      setMessage(`Lỗi tải chi tiết #${listingID}: ${String(payload.error ?? 'unknown')}`);
      return;
    }
    setEditDetail(payload);
  }

  async function saveEditListing() {
    if (!editDetail) return;
    setEditSaving(true);
    const body = {
      title: editDetail.title,
      description: editDetail.description,
      price: Number(editDetail.price),
      area: Number(editDetail.area),
      bedrooms: Number(editDetail.bedrooms),
      bathrooms: Number(editDetail.bathrooms),
      address: editDetail.address,
      contactName: editDetail.contactName,
      contactPhone: editDetail.contactPhone,
      dealType: editDetail.dealType ?? 'can-ban',
      propertyType: editDetail.propertyType ?? 'Các loại khác',
    };
    const res = await fetch(`${API_BASE}/admin/listings/${editDetail.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...authHeaders(readAuthUser()) },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setEditSaving(false);
    if (!res.ok) {
      setMessage(`Lỗi lưu tin #${editDetail.id}: ${String(payload.error ?? 'unknown')}`);
      return;
    }
    setMessage(`Đã cập nhật tin #${editDetail.id}.`);
    await loadListings();
    await openEditListing(editDetail.id);
  }

  async function deleteListingByAdmin(listingID: number) {
    if (!window.confirm(`Xác nhận xóa tin #${listingID} khỏi database?`)) return;
    const res = await fetch(`${API_BASE}/admin/listings/${listingID}`, {
      method: 'DELETE',
      headers: authHeaders(readAuthUser()),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(`Lỗi xóa tin #${listingID}: ${String(payload.error ?? 'unknown')}`);
      return;
    }
    setMessage(`Đã xóa tin #${listingID}.`);
    if (editDetail?.id === listingID) {
      setEditDetail(null);
    }
    await loadListings();
  }

  async function deleteListingImageByAdmin(listingID: number, imageID: number) {
    if (!window.confirm(`Xác nhận xóa ảnh #${imageID} của tin #${listingID}?`)) return;
    const res = await fetch(`${API_BASE}/admin/listings/${listingID}/images/${imageID}`, {
      method: 'DELETE',
      headers: authHeaders(readAuthUser()),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(`Lỗi xóa ảnh #${imageID}: ${String(payload.error ?? 'unknown')}`);
      return;
    }
    setMessage(`Đã xóa ảnh #${imageID}.`);
    await openEditListing(listingID);
    await loadListings();
  }

  async function setCoverImageByAdmin(listingID: number, imageID: number) {
    const res = await fetch(`${API_BASE}/admin/listings/${listingID}/images/${imageID}/cover`, {
      method: 'PATCH',
      headers: authHeaders(readAuthUser()),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(`Lỗi đặt ảnh đại diện #${imageID}: ${String(payload.error ?? 'unknown')}`);
      return;
    }
    setMessage(`Đã đặt ảnh #${imageID} làm ảnh đại diện.`);
    await openEditListing(listingID);
    await loadListings();
  }
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (viewStatus !== 'all' && toViewStatus(item) !== viewStatus) return false;
      if (posterIdFilter.trim() && String(item.userId) !== posterIdFilter.trim()) return false;
      return inDateRange(item, fromDate, toDate);
    });
  }, [items, viewStatus, posterIdFilter, fromDate, toDate]);

  if (!hydrated) return null;

  return (
    <main className="min-h-screen bg-slate-100 pb-8">
      <HeaderNav />
      <section className="admin-neo mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Quản lý tin đăng và kiểm duyệt AI</h1>

        <div className="mt-4 flex flex-wrap gap-3">
          <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={() => void loadListings()}>Tải danh sách tin</button>
            <button className="rounded border border-slate-300 px-4 py-2" onClick={() => void exportListings()}>Xuất CSV Google Ads</button>
        </div>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Cấu hình ưu tiên hiển thị trang chủ</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input type="number" className="rounded border px-2 py-2" value={displayConfig.vipWeight} onChange={(e) => setDisplayConfig((p) => ({ ...p, vipWeight: Number.parseInt(e.target.value, 10) || 0 }))} />
            <input type="number" className="rounded border px-2 py-2" value={displayConfig.normalWeight} onChange={(e) => setDisplayConfig((p) => ({ ...p, normalWeight: Number.parseInt(e.target.value, 10) || 0 }))} />
            <button className="rounded bg-[var(--brand-primary)] px-4 py-2 text-white" disabled={savingDisplayConfig} onClick={() => void saveDisplayConfig()}>{savingDisplayConfig ? 'Đang lưu...' : 'Lưu cấu hình'}</button>
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Vòng đời và cleanup dữ liệu</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input type="number" min={1} max={365} className="rounded border px-2 py-2" value={lifecycleConfig.expireDays} onChange={(e) => setLifecycleConfig((p) => ({ ...p, expireDays: Number.parseInt(e.target.value, 10) || 90 }))} />
            <button className="rounded bg-[var(--brand-primary)] px-4 py-2 text-white" disabled={savingLifecycleConfig} onClick={() => void saveLifecycleConfig()}>{savingLifecycleConfig ? 'Đang lưu...' : 'Lưu vòng đời'}</button>
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <h3 className="text-sm font-semibold">Xóa dữ liệu thủ công</h3>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <select className="rounded border px-2 py-2" value={cleanupTarget} onChange={(e) => setCleanupTarget(e.target.value as CleanupTarget)}>
                <option value="listings">Tin đăng + ảnh</option>
                <option value="listing_moderation_actions">Lịch sử kiểm duyệt</option>
                <option value="outbox_events">Outbox events</option>
                <option value="user_verifications">Mã xác thực user</option>
                <option value="bean_blockchain_events">Bean blockchain events</option>
                <option value="bean_transactions">Bean transactions</option>
              </select>
              <input className="rounded border px-2 py-2" type="number" min={1} value={cleanupOlderThanDays} onChange={(e) => setCleanupOlderThanDays(e.target.value)} />
              <input className="rounded border px-2 py-2" type="date" value={cleanupBeforeDate} onChange={(e) => setCleanupBeforeDate(e.target.value)} />
            </div>
            {cleanupTarget === 'listings' ? (
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <select className="rounded border px-2 py-2" value={cleanupListingStatus} onChange={(e) => setCleanupListingStatus(e.target.value)}>
                  <option value="">Tất cả trạng thái</option><option value="ACTIVE">ACTIVE</option><option value="SOLD">SOLD</option><option value="RENTED">RENTED</option><option value="EXPIRED">EXPIRED</option><option value="ARCHIVED">ARCHIVED</option><option value="DRAFT">DRAFT</option>
                </select>
                <select className="rounded border px-2 py-2" value={cleanupDealType} onChange={(e) => setCleanupDealType(e.target.value)}>
                  <option value="">Tất cả</option><option value="can-ban">Cần bán</option><option value="can-mua">Cần mua</option><option value="cho-thue">Cho thuê</option>
                </select>
              </div>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button className="rounded border px-3 py-2" disabled={cleanupLoading} onClick={() => void previewCleanup()}>{cleanupLoading ? 'Đang xử lý...' : 'Xem trước'}</button>
              <button className="rounded bg-rose-600 px-3 py-2 text-white" disabled={cleanupLoading} onClick={() => void executeCleanup()}>{cleanupLoading ? 'Đang xử lý...' : 'Xóa dữ liệu'}</button>
            </div>
            {cleanupPreview ? <pre className="mt-2 overflow-auto rounded bg-white p-2 text-xs">{JSON.stringify(cleanupPreview, null, 2)}</pre> : null}
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Kiểm duyệt AI</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="rounded border px-2 py-2" placeholder="Nhập listing ID" value={reviewListingId} onChange={(e) => setReviewListingId(e.target.value)} />
            <button className="rounded bg-[var(--brand-primary)] px-3 py-2 text-white" onClick={() => { const id = Number(reviewListingId); if (Number.isFinite(id) && id > 0) void reviewListingByAI(id); }}>{reviewLoading ? 'Đang phân tích...' : 'Phân tích AI'}</button>
          </div>
          {reviewResult ? (
            <div className="mt-3 rounded border p-3">
              <p className="font-medium">#{reviewResult.listing.id} - {displayListingTitle(reviewResult.listing)}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select className="rounded border px-2 py-2" value={moderationAction} onChange={(e) => setModerationAction(e.target.value)}>{moderationActions.map((a) => <option key={a} value={a}>{a}</option>)}</select>
                <textarea className="rounded border px-2 py-2" value={moderationReason} onChange={(e) => setModerationReason(e.target.value)} />
                <select className="rounded border px-2 py-2" value={moderationDealType} onChange={(e) => setModerationDealType(e.target.value)}>{moderationDealTypeOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
                <select className="rounded border px-2 py-2" value={moderationPropertyType} onChange={(e) => setModerationPropertyType(e.target.value)}>{propertyTypeOptions.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                <select className="rounded border px-2 py-2" value={moderationStatus} onChange={(e) => setModerationStatus(e.target.value)}>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </div>
              <button className="mt-2 rounded bg-slate-900 px-3 py-2 text-white" onClick={() => void applyModeration()}>Áp dụng moderation</button>
            </div>
          ) : null}
        </section>

        <div className="mt-3 grid gap-2 sm:grid-cols-6">
          <select className="rounded border px-2 py-2" value={viewStatus} onChange={(e) => setViewStatus(e.target.value as ViewStatus)}>
            <option value="all">Tất cả trạng thái</option><option value="active-sale">Đang bán</option><option value="sold">Đã bán</option><option value="active-rent">Đang cho thuê</option><option value="rented">Đã cho thuê</option>
          </select>
          <input type="date" className="rounded border px-2 py-2" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" className="rounded border px-2 py-2" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <input className="rounded border px-2 py-2" placeholder="Lọc theo User ID" value={posterIdFilter} onChange={(e) => setPosterIdFilter(e.target.value)} />
        </div>

        {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}

        {editDetail ? (
          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Sửa tin #{editDetail.id}</h2>
              <div className="flex gap-2">
                <button className="rounded border border-slate-300 px-3 py-1" onClick={() => setEditDetail(null)}>Đóng</button>
                <button className="rounded bg-[var(--brand-primary)] px-3 py-1 text-white" disabled={editSaving} onClick={() => void saveEditListing()}>{editSaving ? 'Đang lưu...' : 'Lưu chỉnh sửa'}</button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <input className="rounded border px-2 py-2" value={editDetail.title} onChange={(e) => setEditDetail((prev) => (prev ? { ...prev, title: e.target.value } : prev))} placeholder="Tiêu đề" />
              <input className="rounded border px-2 py-2" value={editDetail.address} onChange={(e) => setEditDetail((prev) => (prev ? { ...prev, address: e.target.value } : prev))} placeholder="Địa chỉ" />
              <input className="rounded border px-2 py-2" value={String(editDetail.price)} onChange={(e) => setEditDetail((prev) => (prev ? { ...prev, price: Number(e.target.value) || 0 } : prev))} placeholder="Giá" />
              <input className="rounded border px-2 py-2" value={String(editDetail.area)} onChange={(e) => setEditDetail((prev) => (prev ? { ...prev, area: Number(e.target.value) || 0 } : prev))} placeholder="Diện tích" />
              <input className="rounded border px-2 py-2" value={String(editDetail.bedrooms)} onChange={(e) => setEditDetail((prev) => (prev ? { ...prev, bedrooms: Number(e.target.value) || 0 } : prev))} placeholder="Phòng ngủ" />
              <input className="rounded border px-2 py-2" value={String(editDetail.bathrooms)} onChange={(e) => setEditDetail((prev) => (prev ? { ...prev, bathrooms: Number(e.target.value) || 0 } : prev))} placeholder="Phòng tắm" />
              <input className="rounded border px-2 py-2" value={editDetail.contactName} onChange={(e) => setEditDetail((prev) => (prev ? { ...prev, contactName: e.target.value } : prev))} placeholder="Người liên hệ" />
              <input className="rounded border px-2 py-2" value={editDetail.contactPhone} onChange={(e) => setEditDetail((prev) => (prev ? { ...prev, contactPhone: e.target.value } : prev))} placeholder="SĐT liên hệ" />
              <select className="rounded border px-2 py-2" value={editDetail.dealType ?? 'can-ban'} onChange={(e) => setEditDetail((prev) => (prev ? { ...prev, dealType: e.target.value } : prev))}>{moderationDealTypeOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
              <select className="rounded border px-2 py-2" value={editDetail.propertyType ?? 'Các loại khác'} onChange={(e) => setEditDetail((prev) => (prev ? { ...prev, propertyType: e.target.value } : prev))}>{propertyTypeOptions.map((d) => <option key={d} value={d}>{d}</option>)}</select>
              <textarea className="md:col-span-2 rounded border px-2 py-2" rows={4} value={editDetail.description} onChange={(e) => setEditDetail((prev) => (prev ? { ...prev, description: e.target.value } : prev))} placeholder="Mô tả" />
            </div>

            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Ảnh tin đăng ({editDetail.images.length})</h3>
              {editDetail.images.length === 0 ? (
                <p className="text-sm text-slate-500">Tin chưa có ảnh.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {editDetail.images.map((img) => (
                    <div key={img.id} className="rounded border border-slate-200 p-2">
                      <img src={img.webpUrl || img.url} alt={`img-${img.id}`} className="h-28 w-full rounded object-cover" />
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">ID ảnh: {img.id} • sort: {img.sortOrder}</p>
                      <div className="mt-2 flex gap-2">
                        <button className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => void setCoverImageByAdmin(editDetail.id, img.id)}>Đặt ảnh đại diện</button>
                        <button className="rounded bg-rose-600 px-2 py-1 text-xs text-white" onClick={() => void deleteListingImageByAdmin(editDetail.id, img.id)}>Xóa ảnh</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">Tiêu đề</th><th className="px-3 py-2">Giá</th><th className="px-3 py-2">Phân loại</th><th className="px-3 py-2">Loại tin</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Ngày tạo</th><th className="px-3 py-2">Trạng thái / Quản trị</th></tr></thead>
            <tbody>
              {filteredItems.map((item) => {
                const dealTypeRaw = (dealTypeById[item.id] ?? normalizeDealTypeValue(item)).trim();
                const dealType: DealType = dealTypeRaw === 'cho-thue' || dealTypeRaw === 'can-mua' ? dealTypeRaw : 'can-ban';
                const propertyType = (propertyTypeById[item.id] ?? normalizePropertyTypeValue(item.propertyType)).trim();
                return (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{item.id}</td>
                    <td className="px-3 py-2"><div className="font-medium">{displayListingTitle(item)}</div><div className="text-xs text-slate-500">/{item.slug}</div></td>
                    <td className="px-3 py-2">{item.price.toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-2 text-xs text-slate-600"><div>{dealType}</div><div>{propertyType}</div><div>{item.wardName || item.districtName || '--'}</div></td>
                    <td className="px-3 py-2">{shouldShowVipBadge(item.packageType) ? <span className={packageBadgeClassName(item.packageType)}>{packageBadgeLabel(item.packageType)}</span> : null}</td>
                    <td className="px-3 py-2">{item.userId}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-2">
                      <div className="mb-2 text-xs"><span className="rounded bg-cyan-100 px-2 py-1 font-semibold text-cyan-800">{listingStatusLabel(item.status, dealType)}</span></div>
                      <div className="mb-2 flex items-center gap-2">
                        <select className="rounded border px-2 py-1" value={statusById[item.id] ?? item.status} onChange={(e) => setStatusById((p) => ({ ...p, [item.id]: e.target.value }))}>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                        <button className="rounded bg-[var(--brand-primary)] px-3 py-1 text-white" onClick={() => void updateStatus(item.id)}>Lưu trạng thái</button>
                      </div>
                      <div className="mb-2 grid gap-2 sm:grid-cols-2">
                        <select className="rounded border px-2 py-1" value={dealTypeById[item.id] ?? normalizeDealTypeValue(item)} onChange={(e) => setDealTypeById((p) => ({ ...p, [item.id]: e.target.value }))}>{moderationDealTypeOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
                        <select className="rounded border px-2 py-1" value={propertyTypeById[item.id] ?? normalizePropertyTypeValue(item.propertyType)} onChange={(e) => setPropertyTypeById((p) => ({ ...p, [item.id]: e.target.value }))}>{propertyTypeOptions.map((d) => <option key={d} value={d}>{d}</option>)}</select>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white" onClick={() => void recategorize(item)}>Lưu danh mục</button>
                        <button className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700" onClick={() => void reviewListingByAI(item.id)}>Kiểm duyệt AI</button>
                        <button className="rounded border border-[var(--brand-primary)] px-2 py-1 text-xs font-semibold text-[var(--brand-primary-hover)]" onClick={() => void openEditListing(item.id)} disabled={editLoading}>{editLoading ? 'Đang tải...' : 'Sửa tin'}</button>
                        <button className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white" onClick={() => void deleteListingByAdmin(item.id)}>Xóa tin</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 ? <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>Không có tin phù hợp bộ lọc.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}







