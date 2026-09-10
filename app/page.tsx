import type { Metadata } from 'next';
import { HeaderNav } from '../components/header-nav';
import { HomeRealtime } from '../components/home-realtime';
import { fetchJsonOr } from '../lib/api';
import { resolveListingCreatedAt, resolveSeoImageUrls } from '../lib/listing-presenter';
import { buildPagePath, parsePositivePage } from '../lib/pagination-seo';
import { buildListingPath } from '../lib/listing-route';
import { normalizeSeoText, toAbsoluteUrl } from '../lib/seo';
import { organizationRef } from '../lib/site-schema';
import type { SearchResponse } from '../lib/types';

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
  const homepageTitle = 'Mua bán nhà đất Đà Nẵng | Kết nối chính chủ, có sổ đỏ';
  // Canonical phai khai bao o day. Truoc day trang chu dat <link rel="canonical">
  // qua `next/head`, ma API do khong co tac dung trong App Router - ket qua la
  // trang chu chay tren production hoan toan khong co the canonical nao.
  const currentPage = parsePositivePage(searchParams?.page);
  const canonical = buildPagePath('/', currentPage);
  return {
    title: homepageTitle,
    alternates: { canonical },
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
      title: homepageTitle,
      description:
        'Tìm nhanh nhà đất Đà Nẵng theo phường/xã mới nhất, giá, diện tích và loại hình. Dữ liệu cập nhật realtime.',
      url: toAbsoluteUrl('/'),
      type: 'website',
      images: [{ url: toAbsoluteUrl('/logo-nhadatdn.svg'), width: 512, height: 512, alt: 'Mua bán nhà đất Đà Nẵng' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: homepageTitle,
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
  const latestForSeo = listings.slice(0, 12);

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Tin nhà đất Đà Nẵng mới nhất',
    itemListElement: latestForSeo.map((item, index) => {
      const image = resolveSeoImageUrls(item)[0];
      const itemUrl = toAbsoluteUrl(
        buildListingPath({
          slug: item.slug,
          title: item.title,
          district: item.district || 'Đà Nẵng',
          categoryHint: (item.dealType ?? item.DealType ?? '').toString(),
        }),
      );
      const publishedAt = resolveListingCreatedAt(item);
      return {
        '@type': 'ListItem',
        position: (currentPage - 1) * 20 + index + 1,
        url: itemUrl,
        name: normalizeSeoText(item.title || 'Tin nhà đất Đà Nẵng'),
        item: {
          '@type': 'RealEstateListing',
          name: normalizeSeoText(item.title || 'Tin nhà đất Đà Nẵng'),
          url: itemUrl,
          publisher: organizationRef(),
          mainEntityOfPage: { '@type': 'WebPage', '@id': itemUrl },
          ...(image ? { image } : {}),
          ...(publishedAt ? { datePublished: publishedAt, datePosted: publishedAt } : {}),
        },
      };
    }),
  };

  const jsonLdString = JSON.stringify(itemListJsonLd).replace(/</g, '\u003c');

  return (
    <>
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
