import type { Metadata } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { HeaderNav } from '../../components/header-nav';
import { SearchListingFeed } from '../../components/search-listing-feed';
import { fetchJsonOr } from '../../lib/api';
import { buildPagePath, parsePositivePage } from '../../lib/pagination-seo';
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
  const canonical = buildPagePath('/mua-ban-nha-dat', currentPage, pageQuery);

  return {
    title: 'Mua bán nhà đất Đà Nẵng',
    description: 'Danh mục mua bán nhà đất Đà Nẵng cập nhật theo phường/xã mới, lọc realtime và thông tin chi tiết rõ ràng.',
    keywords: ['mua bán nhà đất Đà Nẵng', 'nhà đất Đà Nẵng', 'bất động sản Đà Nẵng'],
    alternates: { canonical },
    openGraph: {
      title: 'Mua bán nhà đất Đà Nẵng',
      description: 'Danh mục mua bán nhà đất Đà Nẵng cập nhật theo phường/xã mới, lọc realtime và thông tin chi tiết rõ ràng.',
      url: canonical,
      type: 'website',
    },
  };
}

export default async function SaleCategoryPage({
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
    ? `/search?city=da-nang&page=${currentPage}&pageSize=20&dealType=can-ban&posterId=${encodeURIComponent(posterId)}`
    : `/search?city=da-nang&page=${currentPage}&pageSize=20&dealType=can-ban`;
  const payload = await fetchJsonOr<SearchResponse>(
    endpoint,
    { took: 0, total: 0, items: [] },
    { cache: 'no-store' },
  );
  const totalPages = Math.max(1, Math.ceil(Math.max(Number(payload.total ?? 0), (payload.items ?? []).length) / 20));
  const prevHref = currentPage > 1 ? toAbsoluteUrl(buildPagePath('/mua-ban-nha-dat', currentPage - 1, pageQuery)) : null;
  const nextHref = currentPage < totalPages ? toAbsoluteUrl(buildPagePath('/mua-ban-nha-dat', currentPage + 1, pageQuery)) : null;

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
          <span className="font-semibold text-slate-700">Mua bán nhà đất Đà Nẵng</span>
        </nav>

        <header className="rounded-2xl border border-[var(--brand-primary)]/20 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Mua bán nhà đất Đà Nẵng</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
            Danh mục tin bán nhà đất tại Đà Nẵng, ưu tiên nội dung mới nhất và hiển thị theo phường/xã.
            Bộ lọc realtime giúp tìm nhanh theo giá, diện tích và nhu cầu ở thực hoặc đầu tư.
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
            initialQuery={{ city: 'da-nang', pageSize: 20, dealType: 'can-ban', ...(hasPosterFilter ? { posterId } : {}) }}
            mode="page"
            initialPage={currentPage}
            basePath="/mua-ban-nha-dat"
            pageQuery={pageQuery}
          />
        </div>
      </section>
    </main>
  );
}
