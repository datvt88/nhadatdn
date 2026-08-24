import { toAbsoluteUrl } from './seo';
import type { ListingItem } from './types';

const IMAGE_CDN_BASE = (process.env.NEXT_PUBLIC_IMAGE_CDN_BASE ?? '').trim().replace(/\/$/, '');
const SITE_URL = toAbsoluteUrl('/');

export type ListingImageLike = { url?: unknown; webpUrl?: unknown };

function normalizeListingImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return null;

  const localAbsoluteMatch = trimmed.match(/^https?:\/\/(?:localhost|127\.0\.0\.1|host\.docker\.internal)(?::\d+)?(\/(?:uploads|uploads-r2)\/.+)$/i);
  if (localAbsoluteMatch && localAbsoluteMatch[1]) {
    return localAbsoluteMatch[1];
  }

  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/uploads-r2/')) return trimmed;
  if (trimmed.startsWith('uploads/')) return `/${trimmed}`;

  if (trimmed.startsWith('/srv/uploads/')) {
    return `/uploads/${trimmed.slice('/srv/uploads/'.length)}`;
  }
  if (trimmed.startsWith('/app/uploads/')) {
    return `/uploads/${trimmed.slice('/app/uploads/'.length)}`;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
    return trimmed;
  }

  return null;
}

function mapToCdnIfNeeded(url: string): string {
  if (!IMAGE_CDN_BASE) return url;
  if (url.startsWith('/uploads-r2/')) {
    return `${IMAGE_CDN_BASE}/${url.slice('/uploads-r2/'.length)}`;
  }
  return url;
}

function toRelativeIfSameSite(url: string): string {
  if (url.startsWith(SITE_URL)) {
    return url.slice(SITE_URL.length - 1);
  }
  return url;
}

export function resolveSeoImageUrls(input: { images?: ListingImageLike[] | undefined; coverImage?: unknown }): string[] {
  const normalized = (Array.isArray(input.images) ? input.images : [])
    .map((img) => normalizeListingImageUrl(img?.webpUrl) ?? normalizeListingImageUrl(img?.url))
    .filter((img): img is string => Boolean(img))
    .map(mapToCdnIfNeeded)
    .map(toAbsoluteUrl);

  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }

  const cover = normalizeListingImageUrl(input.coverImage ?? null);
  return cover ? [toAbsoluteUrl(mapToCdnIfNeeded(cover))] : [];
}

export function resolveListingImages(listing: ListingItem): string[] {
  return resolveSeoImageUrls({
    images: ((listing as { images?: ListingImageLike[] }).images ?? []) as ListingImageLike[],
    coverImage: listing.coverImage ?? null,
  }).map(toRelativeIfSameSite);
}

export function pickListingImage(listing: ListingItem): string {
  return resolveListingImages(listing)[0] ?? '';
}

export function resolveListingCreatedAt(listing: ListingItem | { createdAt?: unknown; created_at?: unknown }): string {
  if (typeof listing.createdAt === 'string' && listing.createdAt.trim()) return listing.createdAt.trim();
  if (typeof listing.created_at === 'string' && listing.created_at.trim()) return listing.created_at.trim();
  return '';
}

export function resolveListingUpdatedAt(listing: ListingItem | { updatedAt?: unknown; updated_at?: unknown }): string {
  if (typeof (listing as { updatedAt?: unknown }).updatedAt === 'string' && String((listing as { updatedAt?: unknown }).updatedAt).trim()) {
    return String((listing as { updatedAt?: unknown }).updatedAt).trim();
  }
  if (typeof (listing as { updated_at?: unknown }).updated_at === 'string' && String((listing as { updated_at?: unknown }).updated_at).trim()) {
    return String((listing as { updated_at?: unknown }).updated_at).trim();
  }
  return resolveListingCreatedAt(listing as ListingItem);
}

export function formatListingDisplayAddress(value?: unknown): string {
  if (typeof value !== 'string') return '';

  const seen = new Set<string>();
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => !/^(?:tổ\s*dân\s*phố|tdp)(?:\s|$)/i.test(part))
    .map((part) => {
      if (/^(?:thành\s*phố|tp\.?)\s*đà\s*nẵng$/i.test(part) || /^đà\s*nẵng$/i.test(part)) {
        return 'TP Đà Nẵng';
      }
      return part;
    })
    .filter((part) => {
      const key = part.toLocaleLowerCase('vi-VN');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(', ');
}

function formatDecimal(value: number): string {
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0$/, '$1');
}

export function formatCurrencyVnd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 Tỷ';

  // Dữ liệu webapp đang lưu giá theo đơn vị Tỷ.
  if (value <= 10_000) {
    return `${formatDecimal(value)} Tỷ`;
  }

  // Fallback cho dữ liệu legacy lưu theo VND.
  if (value >= 1_000_000_000) return `${formatDecimal(value / 1_000_000_000)} Tỷ`;
  if (value >= 1_000_000) return `${formatDecimal(value / 1_000_000)} Triệu`;
  return `${Math.round(value).toLocaleString('vi-VN')} đ`;
}

export function formatListingPrice(value: number, dealType?: string): string {
  const normalizedDealType = String(dealType ?? '').trim().toLowerCase();
  if (normalizedDealType === 'cho-thue') {
    if (!Number.isFinite(value) || value <= 0) return '0 tr/tháng';
    return `${formatDecimal(value)} tr/tháng`;
  }

  return formatCurrencyVnd(value);
}

export function formatPricePerM2(price: number, area: number): string {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(area) || area <= 0) {
    return '';
  }

  const priceInVnd = price <= 10_000 ? price * 1_000_000_000 : price;
  const millionPerM2 = priceInVnd / area / 1_000_000;
  if (!Number.isFinite(millionPerM2) || millionPerM2 <= 0) return '';
  return `~ ${formatDecimal(millionPerM2)} tr/m²`;
}

export function formatAreaM2(value: number): string {
  return `${value} m²`;
}

export function formatRelativeTime(value?: string): string {
  if (!value) return 'Mới đăng';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 'Mới đăng';
  const now = Date.now();
  const diffMs = Math.max(0, now - time);
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${Math.max(1, hours)} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}
