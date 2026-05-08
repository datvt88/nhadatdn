import Link from 'next/link';
import type { Route } from 'next';
import type { ListingItem } from '../lib/types';
import { ListingCard } from './listing-card';

function sectionTitle(id: string, label: string) {
  return (
    <h2 id={id} className="mb-5 flex items-center gap-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
      <span className="h-10 w-1.5 rounded-full bg-[var(--brand-primary)]" aria-hidden="true" />
      {label}
    </h2>
  );
}

type ListingShowcaseProps = {
  listings: ListingItem[];
  total: number;
  currentPage: number;
  pageSize: number;
  loading?: boolean;
  onPageChange?: (page: number) => void;
  useLinkPagination?: boolean;
  buildPageHref?: (page: number) => string;
};

export function ListingShowcase({
  listings,
  total,
  currentPage,
  pageSize,
  loading = false,
  onPageChange,
  useLinkPagination = false,
  buildPageHref,
}: ListingShowcaseProps) {
  if (listings.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
        Chưa có tin đăng phù hợp bộ lọc. Vui lòng thử điều kiện khác.
      </section>
    );
  }

  const totalPages = Math.max(1, Math.ceil(Math.max(total, listings.length) / Math.max(pageSize, 1)));
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startItem = total > 0 ? (safeCurrentPage - 1) * pageSize + 1 : 0;
  const endItem = total > 0 ? Math.min(startItem + listings.length - 1, total) : listings.length;
  const pages = Array.from({ length: totalPages }, (_, idx) => idx + 1).filter((page) => {
    if (totalPages <= 7) return true;
    return page === 1 || page === totalPages || Math.abs(page - safeCurrentPage) <= 1;
  });

  return (
    <div className="space-y-6">
      <section>
        {sectionTitle('homepage-latest', 'Bất động sản nổi bật mới nhất')}
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            Hiển thị <span className="font-semibold text-slate-900">{startItem}</span>
            {' - '}
            <span className="font-semibold text-slate-900">{endItem}</span>
            {' / '}
            <span className="font-semibold text-slate-900">{total}</span> tin
          </p>
          <p className="text-xs text-slate-500 sm:text-sm">
            {loading ? 'Đang cập nhật kết quả...' : `Trang ${safeCurrentPage}/${totalPages}`}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>

        {totalPages > 1 ? (
          <nav className="mt-6 flex flex-wrap items-center justify-center gap-2" aria-label="Phân trang trang chủ">
            {useLinkPagination && buildPageHref ? (
              <Link
                prefetch={false}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                href={buildPageHref(safeCurrentPage - 1) as Route}
                rel="prev"
                aria-disabled={safeCurrentPage <= 1}
                tabIndex={safeCurrentPage <= 1 ? -1 : undefined}
                style={safeCurrentPage <= 1 ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
              >
                Trước
              </Link>
            ) : (
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onPageChange?.(safeCurrentPage - 1)}
                disabled={safeCurrentPage <= 1 || loading}
              >
                Trước
              </button>
            )}
            {pages.map((page, index) => {
              const prev = pages[index - 1];
              const gapBefore = typeof prev === 'number' && page - prev > 1;
              return (
                <span key={`page-${page}`} className="contents">
                  {gapBefore ? <span className="px-1 text-slate-400">…</span> : null}
                  {useLinkPagination && buildPageHref ? (
                    <Link
                      prefetch={false}
                      className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                        page === safeCurrentPage
                          ? 'bg-[var(--brand-primary)] text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]'
                      }`}
                      href={buildPageHref(page) as Route}
                      aria-current={page === safeCurrentPage ? 'page' : undefined}
                      aria-disabled={page === safeCurrentPage}
                      tabIndex={page === safeCurrentPage ? -1 : undefined}
                      style={page === safeCurrentPage ? { pointerEvents: 'none' } : undefined}
                    >
                      {page}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                        page === safeCurrentPage
                          ? 'bg-[var(--brand-primary)] text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]'
                      }`}
                      onClick={() => onPageChange?.(page)}
                      disabled={page === safeCurrentPage || loading}
                      aria-current={page === safeCurrentPage ? 'page' : undefined}
                    >
                      {page}
                    </button>
                  )}
                </span>
              );
            })}
            {useLinkPagination && buildPageHref ? (
              <Link
                prefetch={false}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                href={buildPageHref(safeCurrentPage + 1) as Route}
                rel="next"
                aria-disabled={safeCurrentPage >= totalPages}
                tabIndex={safeCurrentPage >= totalPages ? -1 : undefined}
                style={safeCurrentPage >= totalPages ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
              >
                Sau
              </Link>
            ) : (
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onPageChange?.(safeCurrentPage + 1)}
                disabled={safeCurrentPage >= totalPages || loading}
              >
                Sau
              </button>
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
