'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { useMemo, useState } from 'react';
import type { ListingItem } from '../lib/types';
import { formatAreaM2, formatListingPrice, formatPricePerM2, resolveListingCreatedAt, resolveListingImages } from '../lib/listing-presenter';
import { resolveDealType, buildListingPath } from '../lib/listing-route';
import { listingStatusLabel, packageBadgeLabel, packageBadgeClassName } from '../lib/listing-labels';
import { toAbsoluteUrl } from '../lib/seo';

function formatSlugLabel(value?: string): string {
  if (!value) return '';
  return value
    .split('-')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

export function ListingCard({
  listing,
  priorityImage = false,
}: {
  listing: ListingItem;
  priorityImage?: boolean;
}) {
  const cityLabel = formatSlugLabel(listing.city);
  const districtLabel = formatSlugLabel(listing.district);
  const location = listing.address ?? [districtLabel, cityLabel].filter(Boolean).join(', ');
  const gallery = resolveListingImages(listing);
  const [failedMap, setFailedMap] = useState<Record<string, true>>({});

  const safeGallery = useMemo(
    () =>
      gallery.filter((src) => {
        const key = src.trim();
        return key.length > 0 && !failedMap[key];
      }),
    [gallery, failedMap],
  );

  const mainImage = safeGallery[0] ?? '';
  const secondaryImages = safeGallery.filter((src, index) => index > 0 && src !== mainImage).slice(0, 3);
  const dealTypeHint = (listing.dealType ?? listing.DealType ?? '').toString();
  const dealType = resolveDealType(listing.title, dealTypeHint);
  const detailPath = buildListingPath({
    slug: listing.slug,
    title: listing.title,
    ...(listing.district ? { district: listing.district } : {}),
    ...(dealTypeHint ? { categoryHint: dealTypeHint } : {}),
  });
  const summary = (listing.description ?? '').replace(/\s+/g, ' ').trim();
  const preview = summary.length > 0 ? summary : 'Tin đăng nhà đất Đà Nẵng đang cập nhật mô tả chi tiết.';
  const pricePerM2 = dealType === 'cho-thue' ? '' : formatPricePerM2(Number(listing.price), Number(listing.area));
  const publishedAt = resolveListingCreatedAt(listing);
  const absoluteListingUrl = toAbsoluteUrl(detailPath);
  const primaryImageUrl = mainImage ? toAbsoluteUrl(mainImage) : '';
  const sellerUserId = Number(listing.userId ?? 0);
  const posterName = String(listing.posterName ?? '').trim();
  const posterAvatarUrl = String(listing.posterAvatarUrl ?? '').trim();
  const sellerPath = sellerUserId > 0 ? `/nguoi-dang/${sellerUserId}` : '';

  const hasImage = mainImage.trim().length > 0;
  const badgeText = packageBadgeLabel(listing.packageType);
  const showVipBadge = badgeText !== '';
  const isVipPackage = showVipBadge;
  const cacheVersion = String(
    (listing as ListingItem & { created_at?: string; createdAt?: string }).created_at ??
      (listing as ListingItem & { created_at?: string; createdAt?: string }).createdAt ??
      listing.id,
  );

  const markFailed = (src: string) => {
    const key = src.trim();
    if (!key) return;
    setFailedMap((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const toDisplayImageSrc = (src: string): string => {
    const trimmed = src.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
    const separator = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${separator}v=${encodeURIComponent(cacheVersion)}`;
  };

  return (
    <article
      itemScope
      itemType="https://schema.org/RealEstateListing"
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--brand-primary)]/40 hover:shadow-md ${isVipPackage ? 'listing-card-vip' : ''}`}
    >
      <meta itemProp="name" content={listing.title} />
      <meta itemProp="url" content={absoluteListingUrl} />
      {primaryImageUrl ? <meta itemProp="image" content={primaryImageUrl} /> : null}
      {publishedAt ? (
        <>
          <meta itemProp="datePublished" content={publishedAt} />
          <meta itemProp="datePosted" content={publishedAt} />
        </>
      ) : null}
      <span itemProp="publisher" itemScope itemType="https://schema.org/Organization" className="sr-only">
        <meta itemProp="name" content="NhadatDN" />
        <meta itemProp="url" content={toAbsoluteUrl('/')} />
      </span>
      {hasImage && secondaryImages.length > 0 ? (
        <div className="relative grid h-56 grid-cols-4 gap-1 overflow-hidden bg-slate-100 p-1">
          <Link href={detailPath as Route} className="relative col-span-3 row-span-3 overflow-hidden rounded-xl" aria-label={listing.title}>
            <Image
              src={toDisplayImageSrc(mainImage)}
              alt={listing.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 75vw, (max-width: 1280px) 66vw, 33vw"
              priority={priorityImage}
              loading={priorityImage ? 'eager' : 'lazy'}
              fetchPriority={priorityImage ? 'high' : 'low'}
              unoptimized
              onError={() => markFailed(mainImage)}
            />
          </Link>
          {secondaryImages.map((src, index) => (
            <Link
              key={`${listing.id}-img-${index}`}
              href={detailPath as Route}
              className="relative overflow-hidden rounded-xl"
              aria-label={`${listing.title} ${index + 2}`}
            >
              <Image
                src={toDisplayImageSrc(src)}
                alt={`${listing.title} ${index + 2}`}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 20vw, 120px"
                loading="lazy"
                fetchPriority="low"
                unoptimized
                onError={() => markFailed(src)}
              />
            </Link>
          ))}
          {showVipBadge ? (
            <span className={`pointer-events-none absolute left-3 top-3 ${packageBadgeClassName(listing.packageType)}`}>{badgeText}</span>
          ) : null}
        </div>
      ) : hasImage ? (
        <div className="relative h-56 overflow-hidden bg-slate-100 p-1">
          <Link href={detailPath as Route} className="relative block h-full overflow-hidden rounded-xl" aria-label={listing.title}>
            <Image
              src={toDisplayImageSrc(mainImage)}
              alt={listing.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
              priority={priorityImage}
              loading={priorityImage ? 'eager' : 'lazy'}
              fetchPriority={priorityImage ? 'high' : 'low'}
              unoptimized
              onError={() => markFailed(mainImage)}
            />
          </Link>
          {showVipBadge ? (
            <span className={`pointer-events-none absolute left-3 top-3 ${packageBadgeClassName(listing.packageType)}`}>{badgeText}</span>
          ) : null}
        </div>
      ) : (
        <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-xl bg-slate-100 p-1 text-sm font-medium text-slate-500">
          Chưa có ảnh tin đăng
          {showVipBadge ? (
            <span className={`pointer-events-none absolute left-3 top-3 ${packageBadgeClassName(listing.packageType)}`}>{badgeText}</span>
          ) : null}
        </div>
      )}

      <div className="space-y-3 p-4">
        <h3 className="line-clamp-2 min-h-[3.5rem] text-[1.05rem] font-bold leading-7 text-slate-900">
          <Link href={detailPath as Route} className="transition-colors hover:text-[var(--brand-primary-hover)]">
            {listing.title}
          </Link>
        </h3>

        <p className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-[clamp(1.28rem,2vw,1.5rem)] font-extrabold tracking-[-0.03em] text-[var(--brand-primary-hover)]">
          <span className="shrink-0">{formatListingPrice(Number(listing.price), dealType)}</span>
          <span className="shrink-0 text-[0.72rem] font-medium tracking-normal text-slate-500 sm:text-xs">{formatAreaM2(Number(listing.area))}</span>
          {pricePerM2 ? <span className="shrink-0 text-[0.72rem] font-semibold tracking-normal text-emerald-700 sm:text-xs">{pricePerM2}</span> : null}
        </p>

        <p className="line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-slate-600">{preview}</p>
        <p className="line-clamp-1 text-sm text-slate-600">Địa chỉ: {location || 'Đang cập nhật'}</p>
        {sellerPath && posterName ? (
          <p className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
            {posterAvatarUrl ? (
              <img src={posterAvatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" loading="lazy" decoding="async" />
            ) : null}
            <span className="min-w-0 truncate">
              Người đăng:{' '}
              <Link href={sellerPath as Route} className="font-semibold text-[var(--brand-primary-hover)] hover:underline">
                {posterName}
              </Link>
            </span>
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>
            {listing.bedrooms} PN | {listing.bathrooms} WC
          </span>
          <span className="rounded bg-[rgba(40,189,191,0.18)] px-2 py-1 font-semibold text-[var(--brand-primary-hover)]">
            {listingStatusLabel(listing.status, dealType)}
          </span>
        </div>
      </div>
    </article>
  );
}
