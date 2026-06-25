'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HeaderNav } from '../../components/header-nav';
import { API_BASE } from '../../lib/api';
import { authHeaders, readAuthUser, writeAuthUser, type AuthUser } from '../../lib/auth-session';
import { buildListingPath } from '../../lib/listing-route';
import { formatListingPrice } from '../../lib/listing-presenter';

type LoginPayload = { user: AuthUser; sessionToken?: string };
type PostResult = { id: number; slug: string; beanCost: number; beanBalance: number };
type UploadResult = { items?: Array<{ url?: string; name?: string; size?: number }> };
type UploadedImage = { url: string; size: number };
type WardItem = { id: number; name: string; slug: string };
type DistrictItem = { id: number; name: string; slug: string; sortOrder: number; wards: WardItem[] };
type DanangCatalog = { cityId: number; cityName: string; citySlug: string; districts: DistrictItem[] };
type AddressSuggestion = { label: string; lat?: number; lng?: number };
type StatusTone = 'error' | 'success' | 'info';
type SessionPayload = { user?: AuthUser; sessionToken?: string; error?: string };
type FieldKey =
  | 'title'
  | 'description'
  | 'price'
  | 'area'
  | 'bedrooms'
  | 'bathrooms'
  | 'floors'
  | 'frontage'
  | 'roadWidth'
  | 'districtId'
  | 'address'
  | 'posterName'
  | 'contactPhone'
  | 'images';
type FieldErrors = Partial<Record<FieldKey, string>>;
type SubmitSuccess = { id: number; slug: string; beanCost: number; beanBalance: number; path: string };

const HOUSE_DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Tây Bắc', 'Đông Bắc', 'Tây Nam', 'Đông Nam'] as const;
const PROPERTY_TYPES = ['Nhà mặt tiền', 'Nhà kiệt, hẻm', 'Biệt thự, nhà liền kề', 'Căn hộ chung cư', 'Nhà trọ, phòng trọ', 'Cửa hàng, kho, xưởng', 'Nhà hàng, khách sạn', 'Đất thổ cư', 'Đất nền, đất dự án', 'Đất nông nghiệp', 'Trang trại, khu sinh thái', 'Các loại khác'] as const;
const LISTING_SYNC_KEY = 'nhadatdn.listings.updatedAt';
const LISTING_SYNC_EVENT = 'nhadatdn-listings-updated';
const LOCATION_NAME_VI_MAP: Record<string, string> = {
  'Hai Chau': 'Hải Châu',
  'Hoa Cuong': 'Hòa Cường',
  'Thanh Khe': 'Thanh Khê',
  'An Khe': 'An Khê',
  'An Hai': 'An Hải',
  'Son Tra': 'Sơn Trà',
  'Ngu Hanh Son': 'Ngũ Hành Sơn',
  'Hoa Khanh': 'Hòa Khánh',
  'Hai Van': 'Hải Vân',
  'Lien Chieu': 'Liên Chiểu',
  'Cam Le': 'Cẩm Lệ',
  'Hoa Xuan': 'Hòa Xuân',
  'Hoa Vang': 'Hòa Vang',
  'Hoa Tien': 'Hòa Tiến',
  'Ba Na': 'Bà Nà',
  'Dac khu Hoang Sa': 'Đặc khu Hoàng Sa',
};

function requiredBean(packageType: string): number {
  if (packageType === 'VIP') return 50;
  if (packageType === 'NORMAL') return 5;
  return 0;
}

function normalizeDecimalInput(raw: string): string {
  const cleaned = raw
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
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = parsePositiveDecimal(trimmed);
  return value ?? undefined;
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
  return raw.replace(/[^0-9]/g, '');
}

function stripOrderPrefix(value: string): string {
  return value.replace(/^\s*\d+\.\s*/, '').trim();
}

function normalizeLocationLabel(raw: string): string {
  const cleaned = stripOrderPrefix(raw);
  return LOCATION_NAME_VI_MAP[cleaned] ?? cleaned;
}

function normalizeCityLabel(raw?: string): string {
  const cleaned = stripOrderPrefix((raw ?? '').trim());
  if (!cleaned) return 'Đà Nẵng';
  if (cleaned.toLowerCase() === 'da nang') return 'Đà Nẵng';
  return LOCATION_NAME_VI_MAP[cleaned] ?? cleaned;
}

function normalizeLocationKey(raw: string): string {
  return normalizeLocationLabel(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(phuong|xa|quan|huyen|thanh pho|tp)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferLocationFromAddress(catalog: DanangCatalog, districtId: string, wardId: string, address: string): { district: DistrictItem | null; ward: WardItem | null } {
  const currentDistrict = catalog.districts.find((item) => item.id === Number(districtId)) ?? null;
  const currentWard = currentDistrict?.wards.find((item) => item.id === Number(wardId)) ?? null;
  const addressKey = normalizeLocationKey(address);

  if (addressKey) {
    const candidates = catalog.districts
      .flatMap((district) => district.wards.map((ward) => ({ district, ward, key: normalizeLocationKey(ward.name) })))
      .filter((item) => item.key.length > 0)
      .sort((a, b) => b.key.length - a.key.length);
    const matchedWard = candidates.find((item) => addressKey.includes(item.key));
    if (matchedWard) return { district: matchedWard.district, ward: matchedWard.ward };

    const matchedDistrict = [...catalog.districts]
      .map((district) => ({ district, key: normalizeLocationKey(district.name) }))
      .filter((item) => item.key.length > 0)
      .sort((a, b) => b.key.length - a.key.length)
      .find((item) => addressKey.includes(item.key));
    if (matchedDistrict) {
      return { district: matchedDistrict.district, ward: matchedDistrict.district.wards[0] ?? null };
    }
  }

  if (currentDistrict && currentWard) return { district: currentDistrict, ward: currentWard };
  const firstDistrict = catalog.districts[0] ?? null;
  return { district: firstDistrict, ward: firstDistrict?.wards[0] ?? null };
}


function fieldClass(errors: FieldErrors, key: FieldKey, extra = ''): string {
  const base = 'rounded border px-3 py-2';
  const tone = errors[key] ? 'border-red-500 bg-red-50 text-red-700 placeholder:text-red-400' : 'border-slate-300';
  return `${base} ${tone} ${extra}`.trim();
}

async function fetchApiWithFallback(path: string, init?: RequestInit): Promise<Response> {
  const primary = `${API_BASE}${path}`;
  const canFallback = typeof window !== 'undefined' && !API_BASE.startsWith('/api');

  try {
    const res = await fetch(primary, init);
    if (!canFallback || res.ok) return res;
    if (res.status !== 404 && res.status < 500) return res;
  } catch {
    if (!canFallback) throw new Error('request failed');
  }

  return fetch(`/api${path}`, init);
}

async function fetchDanangCatalog(): Promise<DanangCatalog | null> {
  try {
    const res = await fetchApiWithFallback('/locations/danang', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as DanangCatalog;
    if (!Array.isArray(data.districts) || data.districts.length === 0) return null;
    return data;
  } catch {
    return null;
  }
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

async function uploadImagesWithFallback(
  path: string,
  form: FormData,
  headers: Record<string, string>,
): Promise<Response> {
  const candidates = buildUploadApiCandidates(path);
  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (const target of candidates) {
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: form,
      });

      if (res.ok) return res;
      if (res.status === 413) {
        return res;
      }
      lastResponse = res;
      lastError = new Error(`upload failed with status ${res.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('upload request failed');
}

function mapServerErrorToField(message: string): FieldErrors {
  const lower = message.toLowerCase();
  const errors: FieldErrors = {};

  if (lower.includes('title')) errors.title = 'Tiêu đề chưa hợp lệ.';
  if (lower.includes('description')) errors.description = 'Mô tả chưa hợp lệ.';
  if (lower.includes('price') || lower.includes('gia')) errors.price = 'Giá chưa hợp lệ.';
  if (lower.includes('area') || lower.includes('dien tich')) errors.area = 'Diện tích chưa hợp lệ.';
  if (lower.includes('district') || lower.includes('ward') || lower.includes('phuong') || lower.includes('xa')) errors.districtId = 'Danh mục phường/xã chưa hợp lệ.';
  if (lower.includes('address') || lower.includes('dia chi')) errors.address = 'Địa chỉ chưa hợp lệ.';
  if (lower.includes('phone')) errors.contactPhone = 'Số điện thoại liên hệ chưa hợp lệ.';
  if (lower.includes('image') || lower.includes('anh')) errors.images = 'Danh sách ảnh chưa hợp lệ.';

  return errors;
}

function isExpiredSessionError(errorText: string | undefined): boolean {
  const lower = String(errorText ?? '').trim().toLowerCase();
  if (!lower) return false;
  return lower.includes('invalid or expired session') || lower.includes('unauthorized') || lower.includes('session');
}

export default function PostListingDanangPage() {
  const [status, setStatus] = useState<{ tone: StatusTone; message: string } | null>(null);
  const [user, setUser] = useState<AuthUser | null>(() => readAuthUser());
  const [identifier, setIdentifier] = useState('testuser@nhadatdn.local');
  const [password, setPassword] = useState('Test@123456');
  const [packageType, setPackageType] = useState<'NORMAL' | 'VIP'>('NORMAL');
  const [dealType, setDealType] = useState<'can-ban' | 'can-mua' | 'cho-thue'>('can-ban');
  const [houseDirection, setHouseDirection] = useState('');
  const [catalog, setCatalog] = useState<DanangCatalog | null>(null);
  const [districtId, setDistrictId] = useState('');
  const [wardId, setWardId] = useState('');
  const [posterName, setPosterName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [address, setAddress] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitSuccess, setSubmitSuccess] = useState<SubmitSuccess | null>(null);
  const [formKey, setFormKey] = useState(0);

  const beanCost = useMemo(() => requiredBean(packageType), [packageType]);
  const parsedPricePreview = useMemo(() => parsePositiveDecimal(priceInput, 2), [priceInput]);
  const priceUnitLabel = dealType === 'cho-thue' ? 'tr/tháng' : 'Tỷ';

  useEffect(() => {
    setPosterName(user?.fullName ?? '');
    setContactPhone(user?.phone ?? '');
  }, [user?.fullName, user?.phone]);

  useEffect(() => {
    let active = true;
    if (!user) {
      return () => {};
    }

    const syncSession = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          cache: 'no-store',
          credentials: 'include',
          headers: authHeaders(user),
        });
        const payload = (await res.json().catch(() => ({}))) as SessionPayload;
        if (!active) return;
        if (!res.ok || !payload.user) {
          if (isExpiredSessionError(payload.error)) {
            writeAuthUser(null);
            setUser(null);
            setStatus({ tone: 'info', message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để đăng tin.' });
          }
          return;
        }
        const nextUser: AuthUser = {
          ...user,
          ...payload.user,
          ...(typeof payload.sessionToken === 'string' && payload.sessionToken.trim() !== '' ? { sessionToken: payload.sessionToken } : {}),
        };
        writeAuthUser(nextUser);
        setUser(nextUser);
      } catch {
        return;
      }
    };

    void syncSession();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      const data = await fetchDanangCatalog();
      if (!active) return;
      if (!data) {
        setStatus((prev) => prev ?? { tone: 'error', message: 'Không tải được danh mục phường/xã. Hệ thống sẽ thử tải lại khi đăng tin.' });
        return;
      }
      setCatalog(data);
      if (Array.isArray(data.districts) && data.districts.length > 0) {
        const firstDistrict = data.districts[0];
        setDistrictId(String(firstDistrict!.id));
        if (firstDistrict && Array.isArray(firstDistrict.wards) && firstDistrict.wards.length > 0) {
          setWardId(String(firstDistrict.wards[0]!.id));
        }
      }
    };
    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  const selectedDistrict = useMemo(() => {
    const id = Number(districtId);
    return catalog?.districts.find((item) => item.id === id) ?? null;
  }, [catalog, districtId]);

  const selectedWard = useMemo(() => {
    const id = Number(wardId);
    return selectedDistrict?.wards.find((item) => item.id === id) ?? null;
  }, [selectedDistrict, wardId]);

  useEffect(() => {
    if (!selectedDistrict) return;
    const firstWard = selectedDistrict.wards[0];
    setWardId(firstWard ? String(firstWard.id) : '');
  }, [selectedDistrict]);

  function clearFieldError(key: FieldKey) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function resetFormForNewPost() {
    setSubmitSuccess(null);
    setStatus(null);
    setFieldErrors({});
    setUploadedImages([]);
    setPriceInput('');
    setAddress('');
    setAddressSuggestions([]);
    setHouseDirection('');
    setPackageType('NORMAL');
    setDealType('can-ban');
    setFormKey((prev) => prev + 1);
  }

  useEffect(() => {
    const keyword = address.trim();
    if (keyword.length < 2) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setAddressLoading(true);
        const query = encodeURIComponent(keyword);
        const res = await fetchApiWithFallback(`/locations/address-suggest?q=${query}&limit=6`, { cache: 'no-store' });
        if (!res.ok) {
          if (active) setAddressSuggestions([]);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { items?: AddressSuggestion[] };
        if (!active) return;
        const items = Array.isArray(data.items)
          ? data.items.filter((item) => typeof item?.label === 'string' && item.label.trim().length > 0)
          : [];
        setAddressSuggestions(items.slice(0, 6));
      } catch {
        if (active) setAddressSuggestions([]);
      } finally {
        if (active) setAddressLoading(false);
      }
    }, 280);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [address]);
  async function login() {
    setStatus(null);
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });

    const payload = (await res.json().catch(() => ({}))) as Partial<LoginPayload> & { error?: string };
    if (!res.ok || !payload.user) {
      setStatus({ tone: 'error', message: `Đăng nhập thất bại: ${String(payload.error ?? 'Sai thông tin đăng nhập')}` });
      return;
    }

    const nextUser: AuthUser = {
      ...payload.user,
      ...(typeof payload.sessionToken === 'string' && payload.sessionToken.trim() !== '' ? { sessionToken: payload.sessionToken } : {}),
    };
    setUser(nextUser);
    writeAuthUser(nextUser);
    setStatus({ tone: 'success', message: `Đăng nhập thành công: ${payload.user.fullName}` });
  }

  async function ensureActiveSession(currentUser: AuthUser | null, reason: 'upload' | 'submit'): Promise<AuthUser | null> {
    if (!currentUser) {
      setStatus({ tone: 'error', message: 'Vui lòng đăng nhập trước khi đăng tin.' });
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
          setStatus({
            tone: 'error',
            message:
              reason === 'upload'
                ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trước khi tải ảnh.'
                : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trước khi đăng tin.',
          });
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

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (uploading) {
      setStatus({ tone: 'info', message: 'Hệ thống đang tải ảnh trước đó. Vui lòng chờ hoàn tất rồi thử lại.' });
      return;
    }
    const incoming = Array.from(files);
    if (uploadedImages.length + incoming.length > 10) {
      setFieldErrors((prev) => ({ ...prev, images: 'Tối đa 10 ảnh cho mỗi tin đăng.' }));
      setStatus({ tone: 'error', message: 'Tối đa 10 ảnh cho mỗi tin đăng.' });
      return;
    }

    const currentTotalSize = uploadedImages.reduce((sum, item) => sum + item.size, 0);
    const incomingTotalSize = incoming.reduce((sum, file) => sum + file.size, 0);
    if (currentTotalSize + incomingTotalSize > 50 * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, images: 'Tổng dung lượng ảnh vượt quá 50MB.' }));
      setStatus({ tone: 'error', message: 'Tổng dung lượng ảnh vượt quá 50MB.' });
      return;
    }

    const form = new FormData();
    incoming.forEach((file) => form.append('images', file));

    const activeUser = await ensureActiveSession(user, 'upload');
    if (!activeUser) {
      setFieldErrors((prev) => ({ ...prev, images: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }));
      return;
    }

    setUploading(true);
    let res: Response;
    try {
      res = await uploadImagesWithFallback('/uploads/images', form, authHeaders(activeUser));
    } catch {
      setUploading(false);
      setFieldErrors((prev) => ({ ...prev, images: 'Không kết nối được dịch vụ upload ảnh.' }));
      setStatus({ tone: 'error', message: 'Upload ảnh thất bại: không kết nối được backend.' });
      return;
    }
    setUploading(false);

    const payload = (await res.json().catch(() => ({}))) as UploadResult & { error?: string };
    if (!res.ok) {
      setFieldErrors((prev) => ({ ...prev, images: 'Upload ảnh thất bại, vui lòng thử lại.' }));
      setStatus({ tone: 'error', message: `Upload ảnh thất bại: ${String((payload as { error?: string }).error ?? 'không rõ lỗi')}` });
      return;
    }

    const nextItems = (payload.items ?? [])
      .map((item) => ({ url: String(item.url ?? ''), size: Number(item.size ?? 0) }))
      .filter((item) => item.url.length > 0);

    setUploadedImages((prev) => [...prev, ...nextItems].slice(0, 10));
    clearFieldError('images');
    setStatus({ tone: 'success', message: `Upload thành công ${nextItems.length} ảnh.` });
  }

  function removeImage(url: string) {
    setUploadedImages((prev) => prev.filter((item) => item.url !== url));
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (uploading) return;
    setDragActive(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (uploading) return;
    void uploadFiles(event.dataTransfer.files);
  }

  async function handleSubmit(formData: FormData) {
    if (!user) {
      setStatus({ tone: 'error', message: 'Vui lòng đăng nhập trước khi đăng tin.' });
      return;
    }
    const activeUser = await ensureActiveSession(user, 'submit');
    if (!activeUser) {
      return;
    }
    let activeCatalog = catalog;
    if (!activeCatalog) {
      setStatus({ tone: 'info', message: 'Đang tải lại danh mục phường/xã Đà Nẵng...' });
      activeCatalog = await fetchDanangCatalog();
      if (activeCatalog) {
        setCatalog(activeCatalog);
      }
    }
    if (!activeCatalog) {
      setStatus({ tone: 'error', message: 'Không tải được danh mục phường/xã. Vui lòng kiểm tra kết nối backend và thử lại.' });
      return;
    }

    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '');
    const area = parsePositiveDecimal(String(formData.get('area') ?? ''));
    const price = parsePositiveDecimal(priceInput, 2);
    const bedrooms = parseNonNegativeInt(String(formData.get('bedrooms') ?? ''));
    const bathrooms = parseNonNegativeInt(String(formData.get('bathrooms') ?? ''));
    const floorsRaw = String(formData.get('floors') ?? '');
    const floors = floorsRaw.trim() === '' ? undefined : parseNonNegativeInt(floorsRaw);
    const frontage = parseOptionalDecimal(String(formData.get('frontage') ?? ''));
    const roadWidth = parseOptionalDecimal(String(formData.get('roadWidth') ?? ''));
    const finalAddress = address.trim();
    const contactPhoneNormalized = normalizePhone(contactPhone);

    const inferredLocation = inferLocationFromAddress(activeCatalog, districtId, wardId, finalAddress);
    const cityId = Number(activeCatalog.cityId);
    const districtValue = Number(inferredLocation.district?.id ?? 0);
    const wardValue = Number(inferredLocation.ward?.id ?? 0);

    const nextErrors: FieldErrors = {};
    if (!title) nextErrors.title = 'Vui lòng nhập tiêu đề.';
    if (!description) nextErrors.description = 'Vui lòng nhập mô tả.';
    if (price === null) nextErrors.price = 'Giá không hợp lệ. Nhập tối đa 2 số sau phẩy, ví dụ: 1.85 hoặc 2,82.';
    if (area === null) nextErrors.area = 'Diện tích không hợp lệ.';
    if (bedrooms === null) nextErrors.bedrooms = 'Số phòng ngủ không hợp lệ.';
    if (bathrooms === null) nextErrors.bathrooms = 'Số phòng toilet không hợp lệ.';
    if (floors === null) nextErrors.floors = 'Số tầng phải là số nguyên không âm.';
    if (!cityId || !districtValue || !wardValue) nextErrors.districtId = 'Vui lòng chọn đầy đủ phường/xã.';
    if (!finalAddress) nextErrors.address = 'Vui lòng nhập địa chỉ.';
    if (!posterName.trim()) nextErrors.posterName = 'Vui lòng nhập tên người đăng.';
    if (contactPhoneNormalized.length < 8) nextErrors.contactPhone = 'Số điện thoại liên hệ chưa hợp lệ.';
    if (uploadedImages.length === 0) nextErrors.images = 'Vui lòng tải lên ít nhất 1 ảnh.';

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus({ tone: 'error', message: 'Vui lòng kiểm tra các ô màu đỏ và thử lại.' });
      return;
    }

    setDistrictId(String(districtValue));
    setWardId(String(wardValue));

    const payload = {
      title,
      description,
      price,
      area,
      bedrooms,
      bathrooms,
      cityId,
      districtId: districtValue,
      wardId: wardValue,
      address: finalAddress,
      packageType,
      dealType,
      propertyType: String(formData.get('propertyType') ?? ''),
      houseDirection,
      frontage,
      roadWidth,
      floors,
      contactName: posterName.trim(),
      contactPhone: contactPhone.trim(),
      images: uploadedImages.map((item) => ({ url: item.url })),
    };

    const res = await fetch(`${API_BASE}/listings`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...authHeaders(activeUser) },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as Partial<PostResult> & { error?: string };
    if (!res.ok) {
      const backendError = String(data.error ?? 'không rõ lỗi');
      const mapped = mapServerErrorToField(backendError);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...mapped }));
      }
      setStatus({ tone: 'error', message: `Đăng tin thất bại: ${backendError}` });
      return;
    }

    const newBalance = Number(data.beanBalance ?? activeUser.beanBalance - beanCost);
    setUser((prev) => {
      if (!prev) return prev;
      const nextUser = { ...prev, beanBalance: newBalance };
      writeAuthUser(nextUser);
      return nextUser;
    });

    const listingSlug = String(data.slug ?? '').trim();
    const detailPath = listingSlug
      ? buildListingPath({
          slug: listingSlug,
          categoryHint: dealType,
          ...(inferredLocation.district?.name ? { district: inferredLocation.district.name } : {}),
          ...(inferredLocation.ward?.name ? { ward: inferredLocation.ward.name } : {}),
        })
      : '/';

    setSubmitSuccess({
      id: Number(data.id ?? 0),
      slug: listingSlug,
      beanCost: Number(data.beanCost ?? beanCost),
      beanBalance: newBalance,
      path: detailPath,
    });
    setFieldErrors({});
    setStatus({ tone: 'success', message: `Đăng tin thành công. Chi phí ${data.beanCost} Bean, còn ${newBalance} Bean.` });

    if (typeof window !== 'undefined') {
      const stamp = String(Date.now());
      window.localStorage.setItem(LISTING_SYNC_KEY, stamp);
      window.dispatchEvent(new Event(LISTING_SYNC_EVENT));
    }
  }

  return (
    <main className="min-h-screen bg-[#f2f3f5] pb-12">
      <HeaderNav />
      <section className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Đăng tin bất động sản Đà Nẵng</h1>

        {!user ? (
          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Đăng nhập để đăng tin</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input className="rounded border px-3 py-2" placeholder="Email hoặc số điện thoại" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              <input className="rounded border px-3 py-2" placeholder="Mật khẩu" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => void login()} className="rounded bg-slate-900 px-4 py-2 text-white">
                Đăng nhập
              </button>
            </div>
            <div className="mt-3">
              <Link href="/dang-ky" className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Đăng ký tài khoản
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm text-slate-700">
              <p>
                Người đăng: <span className="font-semibold">{user.fullName}</span> | Bean: <span className="font-semibold">{user.beanBalance}</span>
              </p>
              <p className="mt-1">Liên hệ mặc định: <span className="font-semibold">{user.phone || 'Chưa cập nhật số điện thoại'}</span></p>
            </section>

            {submitSuccess ? (
              <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-emerald-800">Đăng tin thành công</h2>
                <p className="mt-2 text-sm text-emerald-800">
                  Tin #{submitSuccess.id} đã được tạo. Chi phí <span className="font-semibold">{submitSuccess.beanCost} Bean</span>, số dư còn <span className="font-semibold">{submitSuccess.beanBalance} Bean</span>.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href={submitSuccess.path as Route} className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                    Xem tin vừa đăng
                  </Link>
                  <button type="button" onClick={resetFormForNewPost} className="rounded border border-emerald-500 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                    Đăng tin mới
                  </button>
                </div>
              </section>
            ) : (
              <form key={formKey} action={handleSubmit} className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold">Thông tin tin đăng</h2>

                <div className="grid gap-1">
                  <input name="title" placeholder="Tiêu đề" className={fieldClass(fieldErrors, 'title')} onInput={() => clearFieldError('title')} />
                  {fieldErrors.title ? <p className="text-xs text-red-600">{fieldErrors.title}</p> : null}
                </div>

                <select className="rounded border px-3 py-2" value={dealType} onChange={(event) => setDealType(event.target.value as 'can-ban' | 'can-mua' | 'cho-thue')}>
                  <option value="can-ban">Cần bán</option>
                  <option value="can-mua">Cần Mua</option>
                  <option value="cho-thue">Cho thuê</option>
                </select>

                <div className="grid gap-1">
                  <textarea name="description" placeholder="Mô tả" className={`${fieldClass(fieldErrors, 'description')} min-h-24`} onInput={() => clearFieldError('description')} />
                  {fieldErrors.description ? <p className="text-xs text-red-600">{fieldErrors.description}</p> : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <div className={`${fieldClass(fieldErrors, 'price', 'flex items-center gap-2 px-0 py-0')} overflow-hidden`}>
                      <input
                        name="price"
                        placeholder={dealType === 'cho-thue' ? 'Giá thuê (ví dụ: 15.5)' : 'Giá bán (ví dụ: 1.85 hoặc 2,82)'}
                        className="w-full border-0 bg-transparent px-3 py-2 outline-none"
                        value={priceInput}
                        onChange={(event) => {
                          setPriceInput(event.target.value);
                          clearFieldError('price');
                        }}
                      />
                      <span className="whitespace-nowrap pr-3 text-sm font-semibold text-slate-600">{priceUnitLabel}</span>
                    </div>
                    {fieldErrors.price ? <p className="text-xs text-red-600">{fieldErrors.price}</p> : null}
                  </div>

                  <div className="grid gap-1">
                    <input name="area" placeholder="Diện tích m2" className={fieldClass(fieldErrors, 'area')} onInput={() => clearFieldError('area')} />
                    {fieldErrors.area ? <p className="text-xs text-red-600">{fieldErrors.area}</p> : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="grid gap-1">
                    <input name="bedrooms" placeholder="Số phòng ngủ" className={fieldClass(fieldErrors, 'bedrooms')} onInput={() => clearFieldError('bedrooms')} />
                    {fieldErrors.bedrooms ? <p className="text-xs text-red-600">{fieldErrors.bedrooms}</p> : null}
                  </div>
                  <div className="grid gap-1">
                    <input name="bathrooms" placeholder="Số phòng toilet" className={fieldClass(fieldErrors, 'bathrooms')} onInput={() => clearFieldError('bathrooms')} />
                    {fieldErrors.bathrooms ? <p className="text-xs text-red-600">{fieldErrors.bathrooms}</p> : null}
                  </div>
                  <div className="grid gap-1">
                    <input name="floors" placeholder="Số tầng" className={fieldClass(fieldErrors, 'floors')} onInput={() => clearFieldError('floors')} />
                    {fieldErrors.floors ? <p className="text-xs text-red-600">{fieldErrors.floors}</p> : null}
                  </div>
                  <select name="propertyType" className="rounded border px-3 py-2">
                    {PROPERTY_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1">
                    <input name="frontage" placeholder="Chiều ngang (m)" className={fieldClass(fieldErrors, 'frontage')} onInput={() => clearFieldError('frontage')} />
                    {fieldErrors.frontage ? <p className="text-xs text-red-600">{fieldErrors.frontage}</p> : null}
                  </div>
                  <div className="grid gap-1">
                    <input name="roadWidth" placeholder="Đường vào (m)" className={fieldClass(fieldErrors, 'roadWidth')} onInput={() => clearFieldError('roadWidth')} />
                    {fieldErrors.roadWidth ? <p className="text-xs text-red-600">{fieldErrors.roadWidth}</p> : null}
                  </div>
                  <select className="rounded border px-3 py-2" value={houseDirection} onChange={(event) => setHouseDirection(event.target.value)}>
                    <option value="">Hướng nhà đất</option>
                    {HOUSE_DIRECTIONS.map((dir) => (
                      <option key={dir} value={dir}>{dir}</option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={normalizeCityLabel(catalog?.cityName)} readOnly className="rounded border bg-slate-50 px-3 py-2" />
                  <div className="grid gap-1">
                    <select
                      className={fieldClass(fieldErrors, 'districtId')}
                      value={districtId}
                      onChange={(event) => {
                        setDistrictId(event.target.value);
                        clearFieldError('districtId');
                      }}
                    >
                      {catalog?.districts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {normalizeLocationLabel(item.name)}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.districtId ? <p className="text-xs text-red-600">{fieldErrors.districtId}</p> : null}
                  </div>
                </div>

                <div className="relative grid gap-1">
                  <input
                    name="address"
                    value={address}
                    placeholder="Địa chỉ (Đà Nẵng)"
                    className={fieldClass(fieldErrors, 'address')}
                    onChange={(event) => {
                      setAddress(event.target.value);
                      clearFieldError('address');
                      clearFieldError('districtId');
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setAddressSuggestions([]), 120);
                    }}
                    autoComplete="off"
                  />
                  {fieldErrors.address ? <p className="text-xs text-red-600">{fieldErrors.address}</p> : null}
                  {addressLoading && address.trim().length >= 2 ? (
                    <p className="text-xs text-slate-500">Đang gợi ý địa chỉ Đà Nẵng...</p>
                  ) : null}
                  {addressSuggestions.length > 0 ? (
                    <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-auto rounded border border-slate-200 bg-white shadow-md">
                      {addressSuggestions.map((item, index) => (
                        <li key={`${item.label}-${index}`}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                            onClick={() => {
                              setAddress(item.label);
                              if (catalog) {
                                const inferred = inferLocationFromAddress(catalog, districtId, wardId, item.label);
                                if (inferred.district) setDistrictId(String(inferred.district.id));
                                if (inferred.ward) setWardId(String(inferred.ward.id));
                              }
                              setAddressSuggestions([]);
                              clearFieldError('address');
                              clearFieldError('districtId');
                            }}
                          >
                            {item.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <input type="hidden" value={wardId} readOnly />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <input
                      name="posterName"
                      placeholder="Người đăng tin"
                      value={posterName}
                      onChange={(event) => {
                        setPosterName(event.target.value);
                        clearFieldError('posterName');
                      }}
                      className={fieldClass(fieldErrors, 'posterName')}
                    />
                    {fieldErrors.posterName ? <p className="text-xs text-red-600">{fieldErrors.posterName}</p> : null}
                  </div>
                  <div className="grid gap-1">
                    <p className="text-xs font-medium text-slate-600">Số điện thoại liên hệ</p>
                    <input
                      name="contactPhone"
                      placeholder="Số điện thoại liên hệ"
                      value={contactPhone}
                      onChange={(event) => {
                        setContactPhone(event.target.value);
                        clearFieldError('contactPhone');
                      }}
                      className={fieldClass(fieldErrors, 'contactPhone')}
                    />
                    {fieldErrors.contactPhone ? <p className="text-xs text-red-600">{fieldErrors.contactPhone}</p> : null}
                  </div>
                </div>

                <div className={`rounded border p-3 ${fieldErrors.images ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}>
                  <p className="mb-2 text-sm font-semibold">Ảnh tin đăng (tối đa 10 ảnh, tổng tối đa 50MB)</p>
                  <div
                    className={`rounded-lg border-2 border-dashed p-4 text-center transition ${
                      dragActive ? 'border-brand-500 bg-sky-50' : 'border-slate-300 bg-slate-50'
                    } ${uploading ? 'cursor-not-allowed opacity-70' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => void uploadFiles(event.target.files)}
                      disabled={uploading}
                      className="hidden"
                    />
                    <p className="text-sm text-slate-700">Kéo thả ảnh vào đây hoặc</p>
                    <button
                      type="button"
                      className="mt-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      Chọn ảnh từ máy
                    </button>
                  </div>
                  {uploading ? <p className="mt-2 text-xs text-slate-500">Đang tải ảnh...</p> : null}
                  {fieldErrors.images ? <p className="mt-2 text-xs text-red-600">{fieldErrors.images}</p> : null}
                  {uploadedImages.length > 0 ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {uploadedImages.map((image) => (
                        <div key={image.url} className="relative rounded border border-slate-200 p-1">
                          <div className="relative h-20 w-full"><Image src={image.url} alt="uploaded" fill className="rounded object-cover" sizes="120px" unoptimized /></div>
                          <button type="button" className="mt-1 w-full rounded bg-slate-100 px-2 py-1 text-xs" onClick={() => removeImage(image.url)}>Xóa</button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <select name="packageType" className="rounded border px-3 py-2" value={packageType} onChange={(event) => setPackageType(event.target.value as 'NORMAL' | 'VIP')}>
                    <option value="NORMAL">Đăng tin thường (-5 Bean)</option>
                    <option value="VIP">Đăng tin VIP (-50 Bean)</option>
                  </select>
                  <button className="rounded bg-brand-700 px-5 py-2 text-white" type="submit">
                    Đăng tin
                  </button>
                </div>

                <p className="text-sm text-slate-600">
                  Gói hiện tại sẽ trừ <span className="font-semibold">{beanCost} Bean</span>.
                  {priceInput.trim() ? <span className="ml-2 text-slate-700">Giá sẽ hiển thị: <span className="font-semibold">{parsedPricePreview !== null ? formatListingPrice(parsedPricePreview, dealType) : "Giá chưa hợp lệ"}</span></span> : null}
                </p>
              </form>
            )}
          </>
        )}

        {status ? (
          <p className={`mt-4 text-sm ${status.tone === 'error' ? 'text-red-600' : status.tone === 'success' ? 'text-emerald-700' : 'text-slate-700'}`}>
            {status.message}
          </p>
        ) : null}
      </section>
    </main>
  );
}






















