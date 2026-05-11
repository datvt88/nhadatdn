import type { Metadata } from 'next';
import Head from 'next/head';
import { HeaderNav } from '../components/header-nav';
import { HomeRealtime } from '../components/home-realtime';
import { fetchJsonOr } from '../lib/api';
import { resolveListingCreatedAt, resolveSeoImageUrls } from '../lib/listing-presenter';
import { buildPagePath, parsePositivePage } from '../lib/pagination-seo';
import { buildListingPath } from '../lib/listing-route';
import { getSiteUrl, normalizeSeoText, toAbsoluteUrl } from '../lib/seo';
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
  return {
    title: 'Mua bÃ¡n nhÃ  Ä‘áº¥t ÄÃ  Náºµng',
    description:
      'Mua bÃ¡n nhÃ  Ä‘áº¥t ÄÃ  Náºµng cáº­p nháº­t liÃªn tá»¥c: lá»c theo phÆ°á»ng/xÃ£, giÃ¡, diá»‡n tÃ­ch, loáº¡i hÃ¬nh vÃ  xem tin má»›i nháº¥t theo thá»i gian thá»±c.',
    keywords: [
      'nhÃ  Ä‘áº¥t ÄÃ  Náºµng',
      'mua bÃ¡n nhÃ  Ä‘áº¥t ÄÃ  Náºµng',
      'báº¥t Ä‘á»™ng sáº£n ÄÃ  Náºµng',
      'tin Ä‘Äƒng nhÃ  Ä‘áº¥t ÄÃ  Náºµng',
      'nhÃ  Ä‘áº¥t Háº£i ChÃ¢u',
      'nhÃ  Ä‘áº¥t SÆ¡n TrÃ ',
    ],
    openGraph: {
      title: 'Mua bÃ¡n nhÃ  Ä‘áº¥t ÄÃ  Náºµng',
      description:
        'TÃ¬m nhanh nhÃ  Ä‘áº¥t ÄÃ  Náºµng theo phÆ°á»ng/xÃ£ má»›i nháº¥t, giÃ¡, diá»‡n tÃ­ch vÃ  loáº¡i hÃ¬nh. Dá»¯ liá»‡u cáº­p nháº­t realtime.',
      url: toAbsoluteUrl('/'),
      type: 'website',
      images: [{ url: toAbsoluteUrl('/logo-nhadatdn.svg'), width: 512, height: 512, alt: 'Mua bÃ¡n nhÃ  Ä‘áº¥t ÄÃ  Náºµng' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Mua bÃ¡n nhÃ  Ä‘áº¥t ÄÃ  Náºµng',
      description:
        'TÃ¬m nhanh nhÃ  Ä‘áº¥t ÄÃ  Náºµng theo phÆ°á»ng/xÃ£ má»›i nháº¥t, giÃ¡, diá»‡n tÃ­ch vÃ  loáº¡i hÃ¬nh. Dá»¯ liá»‡u cáº­p nháº­t realtime.',
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
  const publisherSchema = {
    '@type': 'Organization',
    name: 'NhadatDN',
    url: siteUrl,
    logo: {
      '@type': 'ImageObject',
      url: toAbsoluteUrl('/logo-nhadatdn.svg'),
    },
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Tin nhÃ  Ä‘áº¥t ÄÃ  Náºµng má»›i nháº¥t',
    itemListElement: latestForSeo.map((item, index) => {
      const image = resolveSeoImageUrls(item)[0];
      const itemUrl = toAbsoluteUrl(
        buildListingPath({
          slug: item.slug,
          title: item.title,
          district: item.district || 'ÄÃ  Náºµng',
          categoryHint: (item.dealType ?? item.DealType ?? '').toString(),
        }),
      );
      const publishedAt = resolveListingCreatedAt(item);
      return {
        '@type': 'ListItem',
        position: (currentPage - 1) * 20 + index + 1,
        url: itemUrl,
        name: normalizeSeoText(item.title || 'Tin nhÃ  Ä‘áº¥t ÄÃ  Náºµng'),
        item: {
          '@type': 'RealEstateListing',
          name: normalizeSeoText(item.title || 'Tin nhÃ  Ä‘áº¥t ÄÃ  Náºµng'),
          url: itemUrl,
          publisher: publisherSchema,
          mainEntityOfPage: { '@type': 'WebPage', '@id': itemUrl },
          ...(image ? { image } : {}),
          ...(publishedAt ? { datePublished: publishedAt, datePosted: publishedAt } : {}),
        },
      };
    }),
  };

  const jsonLdString = JSON.stringify([webSiteJsonLd, itemListJsonLd]).replace(/</g, '\u003c');

  return (
    <>
      <Head>
        <link rel="canonical" href={canonicalUrl} />
        {prevHref ? <link rel="prev" href={prevHref} /> : null}
        {nextHref ? <link rel="next" href={nextHref} /> : null}
      </Head>
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
