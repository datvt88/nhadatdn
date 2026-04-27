import type { Metadata } from 'next';
import { HeaderNav } from '../components/header-nav';
import { HomeRealtime } from '../components/home-realtime';
import { fetchJsonOr } from '../lib/api';
import { buildPagePath, parsePositivePage } from '../lib/pagination-seo';
import { buildListingPath } from '../lib/listing-route';
import { getSiteUrl, normalizeSeoText, toAbsoluteUrl } from '../lib/seo';
import type { ListingItem, SearchResponse } from '../lib/types';

type WardOption = { name: string; slug: string };
type DistrictOption = { name: string; slug: string; sortOrder: number; wards?: WardOption[] };
type DanangCatalog = { citySlug: string; cityName: string; districts: DistrictOption[] };

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: { page?: string };
}): Promise<Metadata> {
  return {
    title: 'Mua bán nhà đất Đà Nẵng',
    description:
      'Mua bán nhà đất Đà Nẵng cập nhật liên tục: lọc theo phường/xã, giá, diện tích, loại hình và xem tin mới nhất theo thời gian thực.',
    keywords: [
      'nhà đất Đà Nẵng',
      'mua bán nhà đất Đà Nẵng',
      'bất động sản Đà Nẵng',
      'tin đăng nhà đất Đà Nẵng',
      'nhà đất Hải Châu',
      'nhà đất Sơn Trà',
    ],
    openGraph: {
      title: 'Mua bán nhà đất Đà Nẵng',
      description:
        'Tìm nhanh nhà đất Đà Nẵng theo phường/xã mới nhất, giá, diện tích và loại hình. Dữ liệu cập nhật realtime.',
      url: toAbsoluteUrl('/'),
      type: 'website',
      images: [{ url: toAbsoluteUrl('/logo-nhadatdn.svg'), width: 512, height: 512, alt: 'Mua bán nhà đất Đà Nẵng' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Mua bán nhà đất Đà Nẵng',
      description:
        'Tìm nhanh nhà đất Đà Nẵng theo phường/xã mới nhất, giá, diện tích và loại hình. Dữ liệu cập nhật realtime.',
      images: [toAbsoluteUrl('/logo-nhadatdn.svg')],
    },
  };
}

async function getDistrictCatalog(): Promise<DistrictOption[]> {
  const payload = await fetchJsonOr<DanangCatalog>(
    '/locations/danang',
    { citySlug: 'da-nang', cityName: 'Da Nang', districts: [] },
    { cache: 'no-store' },
  );
  return Array.isArray(payload.districts) ? payload.districts : [];
}

async function getHomepageListings(page: number): Promise<SearchResponse> {
  return fetchJsonOr<SearchResponse>(
    `/search?city=da-nang&page=${page}&pageSize=20`,
    { took: 0, total: 0, items: [] },
    { cache: 'no-store' },
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const currentPage = parsePositivePage(searchParams?.page);
  const [listingPayload, districts] = await Promise.all([
    getHomepageListings(currentPage),
    getDistrictCatalog(),
  ]);

  const listings = Array.isArray(listingPayload.items) ? listingPayload.items : [];
  const total = Number.isFinite(Number(listingPayload.total)) ? Number(listingPayload.total) : listings.length;
  const totalPages = Math.max(1, Math.ceil(Math.max(total, listings.length) / 20));
  const siteUrl = getSiteUrl();
  const canonicalPath = buildPagePath('/', currentPage);
  const canonicalUrl = toAbsoluteUrl(canonicalPath);
  const prevHref = currentPage > 1 ? toAbsoluteUrl(buildPagePath('/', currentPage - 1)) : null;
  const nextHref = currentPage < totalPages ? toAbsoluteUrl(buildPagePath('/', currentPage + 1)) : null;
  const latestForSeo = listings.slice(0, 12);

  const webSiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'NhadatDN',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/mua-ban-nha-dat?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Tin nhà đất Đà Nẵng mới nhất',
    itemListElement: latestForSeo.map((item, index) => ({
      '@type': 'ListItem',
      position: (currentPage - 1) * 20 + index + 1,
      url: toAbsoluteUrl(
        buildListingPath({
          slug: item.slug,
          title: item.title,
          district: item.district || 'Đà Nẵng',
          categoryHint: (item.dealType ?? item.DealType ?? '').toString(),
        }),
      ),
      name: normalizeSeoText(item.title || 'Tin nhà đất Đà Nẵng'),
    })),
  };

  const jsonLdString = JSON.stringify([webSiteJsonLd, itemListJsonLd]).replace(/</g, '\u003c');

  return (
    <>
      <head>
        <link rel="canonical" href={canonicalUrl} />
        {prevHref ? <link rel="prev" href={prevHref} /> : null}
        {nextHref ? <link rel="next" href={nextHref} /> : null}
      </head>
      <HeaderNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString }} />
      <HomeRealtime
        initialListings={listings}
        initialTotal={total}
        initialDistricts={districts}
        initialPage={currentPage}
      />
    </>
  );
}
