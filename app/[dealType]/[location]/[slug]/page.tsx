import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeaderNav } from '@/components/header-nav';
import { ListingDetailActions } from '@/components/listing-detail-actions';
import { ListingImageGallery } from '@/components/listing-image-gallery';
import { SellerRatingPanel } from '@/components/seller-rating-panel';
import { fetchJsonOr } from '@/lib/api';
import { listingStatusLabel, packageBadgeLabel, packageBadgeClassName } from '@/lib/listing-labels';
import { formatAreaM2, formatCurrencyVnd } from '@/lib/listing-presenter';
import { buildListingPath, categoryPathByDealType, dealTypeFromCategorySegment, resolveDealType } from '@/lib/listing-route';
import { getSiteUrl, normalizeSeoText, toAbsoluteUrl } from '@/lib/seo';
import type { ListingItem } from '@/lib/types';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

type ListingImage = { url?: string; webpUrl?: string };
type ListingDetail = Omit<ListingItem, 'city' | 'district'> & {
  images?: ListingImage[];
  city?: string | { name?: string };
  district?: string | { name?: string };
  ward?: { name?: string };
  propertyType?: string;
  dealType?: string;
  DealType?: string;
  houseDirection?: string;
  HouseDirection?: string;
  askingPrice?: number;
  frontage?: number;
  roadWidth?: number;
  floors?: number;
  contact?: {
    fullName?: string;
    phone?: string | null;
    role?: string;
    verified?: boolean;
    accountCreatedAt?: string;
    userId?: number;
  };
};

function toLocation(detail: ListingDetail): string {
  const ward = detail.ward?.name;
  const district = typeof detail.district === 'string' ? detail.district : detail.district?.name;
  const city = typeof detail.city === 'string' ? detail.city : detail.city?.name;
  return [ward, district, city].filter(Boolean).join(', ') || detail.address || 'Đang cập nhật địa chỉ';
}

function districtName(detail: ListingDetail): string {
  return typeof detail.district === 'string' ? detail.district : detail.district?.name ?? 'Đà Nẵng';
}

function hasCoordinates(detail: ListingDetail): boolean {
  const lat = Number(detail.lat);
  const lng = Number(detail.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001;
}

function buildMapQuery(detail: ListingDetail): string {
  if (hasCoordinates(detail)) {
    return `${Number(detail.lat)},${Number(detail.lng)}`;
  }

  const text = [detail.address, detail.ward?.name, districtName(detail), 'Đà Nẵng']
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');

  if (text) return text;
  return toLocation(detail);
}

function resolveImages(detail: ListingDetail): string[] {
  const remote = (detail.images ?? [])
    .map((img) => {
      const webp = typeof img.webpUrl === 'string' ? img.webpUrl.trim() : '';
      const original = typeof img.url === 'string' ? img.url.trim() : '';
      return webp || original || '';
    })
    .filter((img): img is string => img.length > 0);

  if (remote.length > 0) return remote;
  if (detail.coverImage) return [detail.coverImage];
  return [];
}

function buildSeoDescription(detail: ListingDetail): string {
  const location = toLocation(detail);
  const summary = (detail.description ?? '').replace(/\s+/g, ' ').trim();
  const prefix = `${detail.title}. Giá ${formatCurrencyVnd(Number(detail.price))}, diện tích ${formatAreaM2(Number(detail.area))}, ${location}.`;
  return normalizeSeoText(`${prefix} ${summary}`).slice(0, 300);
}

function formatHouseDirection(direction?: string): string {
  const key = (direction ?? '').trim().toLowerCase();
  if (!key) return 'Đang cập nhật';

  const labels: Record<string, string> = {
    dong: 'Đông',
    tay: 'Tây',
    nam: 'Nam',
    bac: 'Bắc',
    'dong bac': 'Đông Bắc',
    'dong-bac': 'Đông Bắc',
    'tay bac': 'Tây Bắc',
    'tay-bac': 'Tây Bắc',
    'dong nam': 'Đông Nam',
    'dong-nam': 'Đông Nam',
    'tay nam': 'Tây Nam',
    'tay-nam': 'Tây Nam',
  };

  return labels[key] ?? direction ?? 'Đang cập nhật';
}

function formatAccountAge(createdAt?: string): string {
  if (!createdAt) return 'Tham gia gần đây';
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 'Tham gia gần đây';
  const diffMs = Math.max(0, Date.now() - created);
  const dayMs = 24 * 60 * 60 * 1000;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;
  if (diffMs >= yearMs) {
    const years = Math.floor(diffMs / yearMs);
    return `Tham gia từ ${years} năm trước`;
  }
  if (diffMs >= monthMs) {
    const months = Math.floor(diffMs / monthMs);
    return `Tham gia từ ${months} tháng trước`;
  }
  const days = Math.max(1, Math.floor(diffMs / dayMs));
  return `Tham gia từ ${days} ngày trước`;
}

async function getListingBySlug(slug: string): Promise<ListingDetail | null> {
  return fetchJsonOr<ListingDetail | null>(`/listings/${slug}`, null, { cache: 'no-store' });
}

export async function generateMetadata({ params }: { params: { dealType: string; location: string; slug: string } }): Promise<Metadata> {
  const listing = await getListingBySlug(params.slug);

  if (!listing) {
    return {
      title: 'Tin đăng không tồn tại | Mua bán nhà đất Đà Nẵng',
      description: 'Tin đăng không tồn tại hoặc đã ngừng hiển thị.',
      robots: { index: false, follow: false },
    };
  }

  const images = resolveImages(listing);
  const primaryImage = images[0];
  const description = buildSeoDescription(listing);
  const wardName = listing.ward?.name;
  const dealTypeHint = (listing.dealType ?? listing.DealType ?? '').toString();
  const canonicalDealType = resolveDealType(listing.title, dealTypeHint);
  const seoCategoryLabel = canonicalDealType === 'cho-thue' ? 'Cho thuê nhà đất Đà Nẵng' : 'Mua bán nhà đất Đà Nẵng';
  const path = buildListingPath({ slug: listing.slug, title: listing.title, district: districtName(listing), ...(wardName ? { ward: wardName } : {}), ...(dealTypeHint ? { categoryHint: dealTypeHint } : {}) });
  const absoluteUrl = toAbsoluteUrl(path);
  const districtLabel = districtName(listing);
  const title = normalizeSeoText(`${listing.title} - ${districtLabel} | ${seoCategoryLabel}`);
  const keywordPool = [
    'nhà đất Đà Nẵng',
    seoCategoryLabel.toLowerCase(),
    districtLabel,
    wardName ?? '',
    listing.propertyType ?? '',
    normalizeSeoText(listing.title),
  ].filter(Boolean);

  return {
    title,
    description,
    keywords: keywordPool,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      title,
      description,
      url: absoluteUrl,
      images: images.slice(0, 3).map((url) => ({ url })),
    },
    twitter: {
      card: 'summary_large_image',
      title: listing.title,
      description,
      ...(primaryImage ? { images: [primaryImage] } : {}),
    },
  };
}

export default async function ListingDetailPage({ params }: { params: { dealType: string; location: string; slug: string } }) {
  const listing = await getListingBySlug(params.slug);
  if (!listing) {
    return (
      <main>
        <HeaderNav />
        <div className="mx-auto max-w-4xl px-6 py-12">Tin đăng không tồn tại hoặc chưa đồng bộ.</div>
      </main>
    );
  }

  const wardName = listing.ward?.name;
  const dealTypeHint = (listing.dealType ?? listing.DealType ?? '').toString();
  const path = buildListingPath({ slug: listing.slug, title: listing.title, district: districtName(listing), ...(wardName ? { ward: wardName } : {}), ...(dealTypeHint ? { categoryHint: dealTypeHint } : {}) });
  const expected = `/${params.dealType}/${params.location}/${params.slug}`;
  if (path !== expected) {
    redirect(path);
  }

  const dealType = resolveDealType(listing.title, (listing.dealType ?? listing.DealType ?? '').toString());
  const gallery = resolveImages(listing);
  const descriptionText = (listing.description ?? '').replace(/\r\n?/g, '\n');
  const mapQuery = buildMapQuery(listing);
  const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&hl=vi&z=16&output=embed`;
  const mapExternalUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
  const phone = listing.contact?.phone ?? '0900 000 000';
  const contactName = listing.contact?.fullName ?? 'Người đăng tin';
  const isVerifiedSeller = Boolean(listing.contact?.verified);
  const sellerLabel = isVerifiedSeller ? 'Người bán đã xác thực' : 'Người bán mới';
  const accountAgeText = formatAccountAge(listing.contact?.accountCreatedAt);
  const sellerUserId = Number(listing.contact?.userId ?? 0);
  const canonicalCategoryPath = categoryPathByDealType(params.dealType);
  const canonicalDealType = dealTypeFromCategorySegment(params.dealType);
  const completedLabel = canonicalDealType === 'cho-thue' ? 'Đã cho thuê' : 'Đã bán';
  const packageBadgeText = packageBadgeLabel(listing.packageType);
  const showVipBadge = packageBadgeText !== '';
  const categoryLabel = canonicalDealType === 'cho-thue' ? 'Cho thuê nhà đất' : 'Mua bán nhà đất';
  const locationLabel = districtName(listing);
  const siteUrl = getSiteUrl();
  const listingAbsoluteUrl = toAbsoluteUrl(path);

  const jsonLdListing = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: listing.title,
    description: buildSeoDescription(listing),
    url: listingAbsoluteUrl,
    ...(gallery.length > 0 ? { image: gallery } : {}),
    datePosted: listing.created_at,
    offers: { '@type': 'Offer', priceCurrency: 'VND', price: Number(listing.price), availability: 'https://schema.org/InStock' },
    address: { '@type': 'PostalAddress', streetAddress: listing.address, addressLocality: toLocation(listing) },
  };
  const jsonLdBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'NhadatDN', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: categoryLabel, item: toAbsoluteUrl(canonicalCategoryPath) },
      { '@type': 'ListItem', position: 3, name: locationLabel, item: toAbsoluteUrl(`${canonicalCategoryPath}/${params.location}`) },
      { '@type': 'ListItem', position: 4, name: listing.title, item: listingAbsoluteUrl },
    ],
  };

  return (
    <main className="min-h-screen bg-[#f2f3f5] pb-12">
      <HeaderNav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([jsonLdListing, jsonLdBreadcrumb]).replace(/</g, '\\u003c'),
        }}
      />

      <article className="mx-auto w-full max-w-[1220px] px-3 py-4 sm:px-5">
        <p className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-700 hover:underline">NhadatDN</Link>
          <span>&gt;</span>
          <Link href={canonicalCategoryPath} className="hover:text-slate-700 hover:underline">{categoryLabel}</Link>
          <span>&gt;</span>
          <Link href={`${canonicalCategoryPath}/${params.location}`} className="hover:text-slate-700 hover:underline">{locationLabel}</Link>
          <span>&gt;</span>
          <span className="font-semibold text-slate-700">{listing.title}</span>
        </p>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <header className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-lg font-bold leading-tight text-slate-900 sm:text-xl">{listing.title}</h1>
                <ListingDetailActions slug={listing.slug} title={listing.title} path={path} price={Number(listing.price)} area={Number(listing.area)} address={toLocation(listing)} {...(gallery[0] ? { image: gallery[0] } : {})} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-3xl font-extrabold text-[var(--brand-primary-hover)]">{formatCurrencyVnd(Number(listing.price))}</span>
                {showVipBadge ? <span className={packageBadgeClassName(listing.packageType)}>{packageBadgeText}</span> : null}
                <span className="rounded bg-cyan-100 px-2 py-1 text-xs font-semibold text-[var(--brand-primary-hover)]">{listingStatusLabel(listing.status, dealType)}</span>
              </div>
              <p className="text-sm text-slate-600">Địa chỉ: {toLocation(listing)}</p>
            </header>

            <ListingImageGallery images={gallery} title={listing.title} />

            <section className="rounded-xl border border-slate-100 p-3">
              <h2 className="mb-3 text-base font-bold text-slate-900">Thông tin bất động sản</h2>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between border-b border-dashed border-slate-200 py-2 sm:col-span-2"><dt className="text-slate-500">Loại hình bất động sản</dt><dd className="font-medium text-slate-900">{listing.propertyType || 'Đang cập nhật'}</dd></div>
                <div className="flex justify-between border-b border-dashed border-slate-200 py-2"><dt className="text-slate-500">Diện tích</dt><dd className="font-medium text-slate-900">{formatAreaM2(Number(listing.area))}</dd></div>
                <div className="flex justify-between border-b border-dashed border-slate-200 py-2"><dt className="text-slate-500">Chiều ngang</dt><dd className="font-medium text-slate-900">{listing.frontage ? `${listing.frontage} m` : '-- m'}</dd></div>
                <div className="flex justify-between border-b border-dashed border-slate-200 py-2"><dt className="text-slate-500">Đường vào</dt><dd className="font-medium text-slate-900">{listing.roadWidth ? `${listing.roadWidth} m` : '-- m'}</dd></div>
                <div className="flex justify-between border-b border-dashed border-slate-200 py-2"><dt className="text-slate-500">Hướng nhà đất</dt><dd className="font-medium text-slate-900">{formatHouseDirection(listing.houseDirection ?? listing.HouseDirection)}</dd></div>
                <div className="flex justify-between border-b border-dashed border-slate-200 py-2"><dt className="text-slate-500">Số phòng ngủ</dt><dd className="font-medium text-slate-900">{listing.bedrooms || '--'}</dd></div>
                <div className="flex justify-between border-b border-dashed border-slate-200 py-2"><dt className="text-slate-500">Số phòng toilet</dt><dd className="font-medium text-slate-900">{listing.bathrooms || '--'}</dd></div>
                <div className="flex justify-between border-b border-dashed border-slate-200 py-2"><dt className="text-slate-500">Số tầng</dt><dd className="font-medium text-slate-900">{listing.floors || '--'}</dd></div>
              </dl>
            </section>

            <section className="rounded-xl border border-slate-100 p-3">
              <h2 className="mb-3 text-base font-bold text-slate-900">Mô tả chi tiết</h2>
              <p className="whitespace-pre-line break-words text-sm leading-6 text-slate-700">
                {descriptionText.trim() ? descriptionText : 'Thông tin đang cập nhật...'}
              </p>
            </section>

            <section className="rounded-xl border border-slate-100 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">Xem trên bản đồ</h2>
                <a
                  href={mapExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open in Maps
                </a>
              </div>
              <iframe
                title={`Bản đồ vị trí ${listing.title}`}
                src={mapEmbedUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-[280px] w-full rounded-lg border border-slate-200"
              />
            </section>
          </section>

          <aside className="h-fit rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 lg:sticky lg:top-5">
            <div className="mb-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand-primary)] text-sm font-bold text-white">
                  {contactName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'ND'}
                </span>
                <div>
                  <p className="text-base font-bold leading-tight text-slate-900">{contactName}</p>
                  <p className="text-xs text-emerald-600">{sellerLabel}</p>
                  <p className="text-xs text-slate-500">{accountAgeText}</p>
                </div>
              </div>
              {sellerUserId > 0 ? <SellerRatingPanel sellerUserId={sellerUserId} completedLabel={completedLabel} /> : null}
            </div>
            <a
              href={`https://zalo.me/${phone.replace(/\D+/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-sky-100 text-[10px] font-bold text-sky-700">Zalo</span>
              <span>Chat qua Zalo</span>
            </a>
            <a
              href={`tel:${phone.replace(/\s+/g, '')}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#10979b] to-[var(--brand-primary)] px-3 py-3 text-sm font-bold text-white shadow-sm"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.2 11.2 0 0 0 3.52.56 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.3 21 3 13.7 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.22.2 2.4.56 3.52a1 1 0 0 1-.25 1.02l-2.2 2.25z" />
              </svg>
              <span>{phone} • Hiện số</span>
            </a>
            {sellerUserId > 0 ? (
              <Link
                href={{ pathname: canonicalCategoryPath, query: { posterId: String(sellerUserId), posterName: contactName } }}
                className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-[var(--brand-primary)]/30 bg-[rgba(40,189,191,0.08)] px-3 py-2.5 text-sm font-semibold text-[var(--brand-primary-hover)] hover:bg-[rgba(40,189,191,0.14)]"
              >
                Xem tất cả tin của người đăng
              </Link>
            ) : null}
          </aside>
        </div>
      </article>
    </main>
  );
}













