import type { Metadata } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { HeaderNav } from '../../components/header-nav';
import { SearchListingFeed } from '../../components/search-listing-feed';
import { fetchJsonOr } from '../../lib/api';
import { resolveListingCreatedAt, resolveSeoImageUrls } from '../../lib/listing-presenter';
import { buildPagePath, parsePositivePage } from '../../lib/pagination-seo';
import { buildListingPath } from '../../lib/listing-route';
import { normalizeSeoText } from '../../lib/seo';
import { toAbsoluteUrl } from '../../lib/seo';
import type { SearchResponse } from '../../lib/types';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: { posterId?: string; page?: string };
}): Promise<Metadata> {
  const posterId = String(searchParams?.posterId ?? '').trim();
  const hasPosterFilter = /^\d+$/.test(posterId);
  const currentPage = parsePositivePage(searchParams?.page);
  const pageQuery = hasPosterFilter ? { posterId } : undefined;
  const canonical = buildPagePath('/cho-thue-nha-dat', currentPage, pageQuery);

  return {
    title: 'Cho thuê nhà đất Đà Nẵng',
    description: 'Danh mục cho thuê nhà đất Đà Nẵng theo phường/xã mới, cập nhật tin mới liên tục và bộ lọc tìm kiếm realtime.',
    keywords: ['cho thuê nhà đất Đà Nẵng', 'nhà đất cho thuê Đà Nẵng', 'bất động sản Đà Nẵng'],
    alternates: { canonical },
    openGraph: {
      title: 'Cho thuê nhà đất Đà Nẵng',
      description: 'Danh mục cho thuê nhà đất Đà Nẵng theo phường/xã mới, cập nhật tin mới liên tục và bộ lọc tìm kiếm realtime.',
      url: canonical,
      type: 'website',
    },
  };
}

export default async function RentCategoryPage({
  searchParams,
}: {
  searchParams?: { posterId?: string; posterName?: string; page?: string };
}) {
  const posterId = String(searchParams?.posterId ?? '').trim();
  const posterName = String(searchParams?.posterName ?? '').trim();
  const currentPage = parsePositivePage(searchParams?.page);
  const hasPosterFilter = /^\d+$/.test(posterId);
  const pageQuery = hasPosterFilter ? { posterId } : undefined;
  const endpoint = hasPosterFilter
    ? `/search?city=da-nang&page=${currentPage}&pageSize=20&dealType=cho-thue&posterId=${encodeURIComponent(posterId)}`
    : `/search?city=da-nang&page=${currentPage}&pageSize=20&dealType=cho-thue`;
  const payload = await fetchJsonOr<SearchResponse>(
    endpoint,
    { took: 0, total: 0, items: [] },
    { cache: 'no-store' },
  );
  const latestForSeo = (payload.items ?? []).slice(0, 20);
  const totalPages = Math.max(1, Math.ceil(Math.max(Number(payload.total ?? 0), (payload.items ?? []).length) / 20));
  const prevHref = currentPage > 1 ? toAbsoluteUrl(buildPagePath('/cho-thue-nha-dat', currentPage - 1, pageQuery)) : null;
  const nextHref = currentPage < totalPages ? toAbsoluteUrl(buildPagePath('/cho-thue-nha-dat', currentPage + 1, pageQuery)) : null;
  const publisherSchema = {
    '@type': 'Organization',
    name: 'NhadatDN',
    url: toAbsoluteUrl('/'),
    logo: {
      '@type': 'ImageObject',
      url: toAbsoluteUrl('/logo-nhadatdn.svg'),
    },
  };
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Danh sách cho thuê nhà đất Đà Nẵng',
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
        name: normalizeSeoText(item.title || 'Tin cho thuê nhà đất Đà Nẵng'),
        item: {
          '@type': 'RealEstateListing',
          name: normalizeSeoText(item.title || 'Tin cho thuê nhà đất Đà Nẵng'),
          url: itemUrl,
          publisher: publisherSchema,
          mainEntityOfPage: { '@type': 'WebPage', '@id': itemUrl },
          ...(image ? { image } : {}),
          ...(publishedAt ? { datePublished: publishedAt, datePosted: publishedAt } : {}),
        },
      };
    }),
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#eef8f8_0%,_#f6fbfb_35%,_#ffffff_100%)]">
      <Head>
        {prevHref ? <link rel="prev" href={prevHref} /> : null}
        {nextHref ? <link rel="next" href={nextHref} /> : null}
      </Head>
      <HeaderNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd).replace(/</g, '\\u003c') }} />
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="hover:text-[var(--brand-primary-hover)] hover:underline">NhadatDN</Link>
          <span>&gt;</span>
          <span className="font-semibold text-slate-700">Cho thuê nhà đất Đà Nẵng</span>
        </nav>

        <header className="rounded-2xl border border-[var(--brand-primary)]/20 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Cho thuê nhà đất Đà Nẵng</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
            Danh mục tin cho thuê nhà đất tại Đà Nẵng với dữ liệu cập nhật liên tục theo từng phường/xã.
            Tập trung nội dung rõ thông tin, phù hợp nhu cầu ở, kinh doanh và đầu tư khai thác.
          </p>
          {hasPosterFilter ? (
            <p className="mt-2 text-sm font-semibold text-[var(--brand-primary-hover)]">
              Đang lọc theo người đăng: {posterName || `User #${posterId}`}
            </p>
          ) : null}
        </header>

        <div className="mt-6">
          <SearchListingFeed
            initial={payload}
            initialQuery={{ city: 'da-nang', pageSize: 20, dealType: 'cho-thue', ...(hasPosterFilter ? { posterId } : {}) }}
            mode="page"
            initialPage={currentPage}
            basePath="/cho-thue-nha-dat"
            pageQuery={pageQuery}
          />
        </div>
      </section>
    </main>
  );
}
