import type { Metadata } from 'next';
import { HeaderNav } from '../components/header-nav';
import { HomeRealtime } from '../components/home-realtime';
import { fetchJsonOr } from '../lib/api';
import type { ListingItem, SearchResponse } from '../lib/types';

type WardOption = { name: string; slug: string };
type DistrictOption = { name: string; slug: string; sortOrder: number; wards?: WardOption[] };
type DanangCatalog = { citySlug: string; cityName: string; districts: DistrictOption[] };

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mua bán nhà đất Đà Nẵng',
  description: 'Tìm kiếm bất động sản Đà Nẵng nhanh và cập nhật mới nhất',
  keywords: ['nhà đất Đà Nẵng', 'mua bán nhà đất Đà Nẵng', 'bất động sản Đà Nẵng'],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Mua bán nhà đất Đà Nẵng',
    description: 'Tìm kiếm bất động sản Đà Nẵng nhanh và cập nhật mới nhất',
    url: '/',
    type: 'website',
  },
};

async function getDistrictCatalog(): Promise<DistrictOption[]> {
  const payload = await fetchJsonOr<DanangCatalog>(
    '/locations/danang',
    { citySlug: 'da-nang', cityName: 'Da Nang', districts: [] },
    { cache: 'no-store' },
  );
  return Array.isArray(payload.districts) ? payload.districts : [];
}

async function getHomepageListingsByDealType(dealType: 'can-ban' | 'cho-thue'): Promise<ListingItem[]> {
  const payload = await fetchJsonOr<SearchResponse>(
    `/search?city=da-nang&pageSize=20&dealType=${dealType}`,
    { took: 0, total: 0, items: [] },
    { cache: 'no-store' },
  );
  return payload.items;
}

export default async function HomePage() {
  const [saleListings, rentListings, districts] = await Promise.all([
    getHomepageListingsByDealType('can-ban'),
    getHomepageListingsByDealType('cho-thue'),
    getDistrictCatalog(),
  ]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'NhadatDN',
    url: 'https://nhadatdn.net',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://nhadatdn.net/mua-ban-nha-dat?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };
  const jsonLdString = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return (
    <>
      <HeaderNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString }} />
      <HomeRealtime initialSaleListings={saleListings} initialRentListings={rentListings} initialDistricts={districts} />
    </>
  );
}
