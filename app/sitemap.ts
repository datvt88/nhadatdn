import type { MetadataRoute } from 'next';
import { fetchJsonOr } from '../lib/api';
import { buildListingPath } from '../lib/listing-route';
import { getSiteUrl, toAbsoluteUrl } from '../lib/seo';
import type { ListingItem, SearchResponse } from '../lib/types';

// Sitemap tu lam moi moi 30 phut thay vi build mot lan roi dong bang.
// Truoc day sitemap sinh luc build; neu backend/tunnel down luc do thi fetchJsonOr
// nuot loi va bake vinh vien mot sitemap rong.
const SITEMAP_REVALIDATE_SECONDS = 1800;
export const revalidate = SITEMAP_REVALIDATE_SECONDS;

type DistrictOption = { name: string; slug: string; sortOrder: number };
type DanangCatalog = { citySlug: string; cityName: string; districts: DistrictOption[] };

// Backend kep cung pageSize toi da 100 (store.SearchListings), nen phai lat trang
// thay vi goi mot lan pageSize=500 - neu khong sitemap se bi cat cut o tin thu 100.
const SITEMAP_PAGE_SIZE = 100;
const SITEMAP_MAX_PAGES = 50; // tran an toan: 5.000 tin moi loai

async function fetchLatestListings(dealType: 'can-ban' | 'cho-thue'): Promise<ListingItem[]> {
  const collected: ListingItem[] = [];

  for (let page = 1; page <= SITEMAP_MAX_PAGES; page += 1) {
    const payload = await fetchJsonOr<SearchResponse>(
      `/search?city=da-nang&dealType=${dealType}&page=${page}&pageSize=${SITEMAP_PAGE_SIZE}`,
      { took: 0, total: 0, items: [] },
      { next: { revalidate: SITEMAP_REVALIDATE_SECONDS } },
    );

    const items = payload.items ?? [];
    collected.push(...items);

    if (items.length < SITEMAP_PAGE_SIZE) break;
    if (typeof payload.total === 'number' && collected.length >= payload.total) break;
  }

  return collected;
}

async function fetchDistricts(): Promise<DistrictOption[]> {
  const payload = await fetchJsonOr<DanangCatalog>(
    '/locations/danang',
    { citySlug: 'da-nang', cityName: 'Đà Nẵng', districts: [] },
    { next: { revalidate: SITEMAP_REVALIDATE_SECONDS } },
  );
  return payload.districts ?? [];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const now = new Date();
  const [districts, saleListings, rentListings] = await Promise.all([
    fetchDistricts(),
    fetchLatestListings('can-ban'),
    fetchLatestListings('cho-thue'),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: `${siteUrl}/mua-ban-nha-dat`, lastModified: now, changeFrequency: 'hourly', priority: 0.95 },
    { url: `${siteUrl}/cho-thue-nha-dat`, lastModified: now, changeFrequency: 'hourly', priority: 0.95 },
    { url: `${siteUrl}/dang-tin-nha-dat`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
  ];

  const districtEntries: MetadataRoute.Sitemap = districts.flatMap((district) => [
    {
      url: `${siteUrl}/mua-ban-nha-dat/nha-dat-${district.slug}`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.85,
    },
    {
      url: `${siteUrl}/cho-thue-nha-dat/nha-dat-${district.slug}`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.85,
    },
  ]);

  const allListings = [...saleListings, ...rentListings];
  const seen = new Set<string>();
  const listingEntries: MetadataRoute.Sitemap = [];

  for (const item of allListings) {
    const path = buildListingPath({
      slug: item.slug,
      title: item.title,
      district: item.district || 'Đà Nẵng',
      categoryHint: (item.dealType ?? item.DealType ?? '').toString(),
    });
    const absolute = toAbsoluteUrl(path);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    const lastModified = item.created_at ? new Date(item.created_at) : now;
    listingEntries.push({
      url: absolute,
      lastModified: Number.isNaN(lastModified.getTime()) ? now : lastModified,
      changeFrequency: 'daily',
      priority: item.packageType === 'VIP' ? 0.9 : 0.75,
    });
  }

  return [...staticEntries, ...districtEntries, ...listingEntries];
}

