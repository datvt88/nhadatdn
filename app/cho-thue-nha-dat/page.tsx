import type { Metadata } from 'next';
import Link from 'next/link';
import { HeaderNav } from '../../components/header-nav';
import { SearchListingFeed } from '../../components/search-listing-feed';
import { fetchJsonOr } from '../../lib/api';
import type { SearchResponse } from '../../lib/types';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cho thuê nhà đất Đà Nẵng',
  description: 'Danh mục cho thuê nhà đất Đà Nẵng theo phường/xã mới, cập nhật tin mới liên tục và bộ lọc tìm kiếm realtime.',
  keywords: ['cho thuê nhà đất Đà Nẵng', 'nhà đất cho thuê Đà Nẵng', 'bất động sản Đà Nẵng'],
  alternates: { canonical: '/cho-thue-nha-dat' },
  openGraph: {
    title: 'Cho thuê nhà đất Đà Nẵng',
    description: 'Danh mục cho thuê nhà đất Đà Nẵng theo phường/xã mới, cập nhật tin mới liên tục và bộ lọc tìm kiếm realtime.',
    url: '/cho-thue-nha-dat',
    type: 'website',
  },
};

export default async function RentCategoryPage({
  searchParams,
}: {
  searchParams?: { posterId?: string; posterName?: string };
}) {
  const posterId = String(searchParams?.posterId ?? '').trim();
  const posterName = String(searchParams?.posterName ?? '').trim();
  const hasPosterFilter = /^\d+$/.test(posterId);
  const endpoint = hasPosterFilter
    ? `/search?city=da-nang&pageSize=24&dealType=cho-thue&posterId=${encodeURIComponent(posterId)}`
    : '/search?city=da-nang&pageSize=24&dealType=cho-thue';
  const payload = await fetchJsonOr<SearchResponse>(
    endpoint,
    { took: 0, total: 0, items: [] },
    { cache: 'no-store' },
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#eef8f8_0%,_#f6fbfb_35%,_#ffffff_100%)]">
      <HeaderNav />
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
          <SearchListingFeed initial={payload} initialQuery={{ city: 'da-nang', pageSize: 24, dealType: 'cho-thue', ...(hasPosterFilter ? { posterId } : {}) }} />
        </div>
      </section>
    </main>
  );
}
