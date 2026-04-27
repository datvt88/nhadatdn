import type { Metadata } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { HeaderNav } from '../../../components/header-nav';
import { SearchListingFeed } from '../../../components/search-listing-feed';
import { fetchJsonOr } from '../../../lib/api';
import { buildPagePath, parsePositivePage } from '../../../lib/pagination-seo';
import { categoryPathByDealType, dealTypeFromCategorySegment, slugifyVietnamese, type DealType } from '../../../lib/listing-route';
import { toAbsoluteUrl } from '../../../lib/seo';
import type { SearchResponse } from '../../../lib/types';

export const revalidate = 60;

type DistrictItem = { name: string; slug: string };
type DanangCatalog = { districts: DistrictItem[] };

function isSupportedCategorySegment(value: string): boolean {
  return value === 'mua-ban' || value === 'cho-thue' || value === 'mua-ban-nha-dat' || value === 'cho-thue-nha-dat';
}

function normalizeLocationCore(location: string): string {
  const cleaned = location.trim().toLowerCase();
  if (cleaned.startsWith('nha-dat-')) {
    return cleaned.slice('nha-dat-'.length);
  }
  return cleaned;
}

function toCanonicalLocationSegment(districtName: string): string {
  return `nha-dat-${slugifyVietnamese(districtName)}`;
}

async function getCatalog(): Promise<DanangCatalog | null> {
  return fetchJsonOr<DanangCatalog | null>('/locations/danang', null, { next: { revalidate: 300 } });
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { dealType: string; location: string };
  searchParams?: { page?: string };
}): Promise<Metadata> {
  const incomingCategorySegment = params.dealType.trim().toLowerCase();
  if (!isSupportedCategorySegment(incomingCategorySegment)) {
    return {
      title: 'Không tìm thấy danh mục',
      robots: { index: false, follow: false },
    };
  }

  const catalog = await getCatalog();
  if (!catalog || !Array.isArray(catalog.districts)) {
    return {
      title: 'Danh mục nhà đất Đà Nẵng',
      robots: { index: false, follow: false },
    };
  }

  const locationCore = normalizeLocationCore(params.location);
  const district = catalog.districts.find((item) => slugifyVietnamese(item.name) === locationCore);
  if (!district) {
    return {
      title: 'Không tìm thấy khu vực',
      robots: { index: false, follow: false },
    };
  }

  const dealType: DealType = dealTypeFromCategorySegment(incomingCategorySegment);
  const title = dealType === 'cho-thue' ? `Cho thuê nhà đất ${district.name}, Đà Nẵng` : `Mua bán nhà đất ${district.name}, Đà Nẵng`;
  const description =
    dealType === 'cho-thue'
      ? `Tổng hợp tin cho thuê nhà đất tại ${district.name}, Đà Nẵng. Dữ liệu cập nhật mới và bộ lọc realtime theo nhu cầu.`
      : `Tổng hợp tin mua bán nhà đất tại ${district.name}, Đà Nẵng. Dữ liệu cập nhật mới và bộ lọc realtime theo nhu cầu.`;
  const currentPage = parsePositivePage(searchParams?.page);
  const canonical = buildPagePath(
    `${categoryPathByDealType(incomingCategorySegment)}/${toCanonicalLocationSegment(district.name)}`,
    currentPage,
  );

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
    },
  };
}

export default async function DealTypeLocationPage({
  params,
  searchParams,
}: {
  params: { dealType: string; location: string };
  searchParams?: { page?: string };
}) {
  const incomingCategorySegment = params.dealType.trim().toLowerCase();
  if (!isSupportedCategorySegment(incomingCategorySegment)) {
    notFound();
  }

  const dealType: DealType = dealTypeFromCategorySegment(incomingCategorySegment);
  const canonicalCategoryPath = categoryPathByDealType(incomingCategorySegment);

  const catalog = await getCatalog();
  if (!catalog || !Array.isArray(catalog.districts)) {
    notFound();
  }

  const locationCore = normalizeLocationCore(params.location);
  const district = catalog.districts.find((item) => slugifyVietnamese(item.name) === locationCore);
  if (!district) {
    notFound();
  }

  const canonicalLocationSegment = toCanonicalLocationSegment(district.name);
  const expectedPath = `${canonicalCategoryPath}/${canonicalLocationSegment}`;
  const currentPage = parsePositivePage(searchParams?.page);
  const incomingPath = `/${incomingCategorySegment}/${params.location.trim().toLowerCase()}`;
  if (incomingPath !== expectedPath) {
    redirect(expectedPath);
  }

  const payload = await fetchJsonOr<SearchResponse>(
    `/search?city=da-nang&district=${encodeURIComponent(district.slug)}&page=${currentPage}&pageSize=20&dealType=${dealType}`,
    { took: 0, total: 0, items: [] },
    { next: { revalidate: 30 } },
  );
  const totalPages = Math.max(1, Math.ceil(Math.max(Number(payload.total ?? 0), (payload.items ?? []).length) / 20));
  const prevHref = currentPage > 1 ? toAbsoluteUrl(buildPagePath(expectedPath, currentPage - 1)) : null;
  const nextHref = currentPage < totalPages ? toAbsoluteUrl(buildPagePath(expectedPath, currentPage + 1)) : null;

  const heading = dealType === 'cho-thue' ? `Cho thuê nhà đất ${district.name}, Đà Nẵng` : `Mua bán nhà đất ${district.name}, Đà Nẵng`;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#eef8f8_0%,_#f6fbfb_35%,_#ffffff_100%)]">
      <Head>
        {prevHref ? <link rel="prev" href={prevHref} /> : null}
        {nextHref ? <link rel="next" href={nextHref} /> : null}
      </Head>
      <HeaderNav />
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="hover:text-[var(--brand-primary-hover)] hover:underline">NhadatDN</Link>
          <span>&gt;</span>
          <Link href={canonicalCategoryPath} className="hover:text-[var(--brand-primary-hover)] hover:underline">
            {dealType === 'cho-thue' ? 'Cho thuê nhà đất Đà Nẵng' : 'Mua bán nhà đất Đà Nẵng'}
          </Link>
          <span>&gt;</span>
          <span className="font-semibold text-slate-700">{district.name}</span>
        </nav>

        <header className="rounded-2xl border border-[var(--brand-primary)]/20 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">{heading}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
            Danh mục nhà đất tại {district.name}, Đà Nẵng với dữ liệu cập nhật realtime.
            Tối ưu lọc theo nhu cầu để tìm tin phù hợp nhanh hơn.
          </p>
        </header>

        <div className="mt-6">
          <SearchListingFeed
            initial={payload}
            initialQuery={{ city: 'da-nang', district: district.slug, pageSize: 20, dealType }}
            mode="page"
            initialPage={currentPage}
            basePath={expectedPath}
          />
        </div>
      </section>
    </main>
  );
}
