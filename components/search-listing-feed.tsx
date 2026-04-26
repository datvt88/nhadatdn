'use client';

import { useMemo, useState } from 'react';
import { API_BASE } from '../lib/api';
import { resolveDealType, type DealType } from '../lib/listing-route';
import type { ListingItem, SearchResponse } from '../lib/types';
import { sortVipFirstNewest } from '../lib/listing-sort';
import { ListingGrid } from './listing-grid';

function mergeUniqueListings(current: ListingItem[], incoming: ListingItem[]): ListingItem[] {
  const seen = new Set(current.map((item) => item.id));
  const extra = incoming.filter((item) => !seen.has(item.id));
  return [...current, ...extra];
}

function filterByDealType(items: ListingItem[], dealType?: DealType): ListingItem[] {
  if (!dealType) return items;
  return items.filter((item) => {
    const hint = (item.dealType ?? item.DealType ?? '').toString();
    return resolveDealType(item.title, hint) === dealType;
  });
}

export function SearchListingFeed({
  initial,
  initialQuery,
  mode = 'cursor',
}: {
  initial: SearchResponse;
  initialQuery: { q?: string; city?: string; district?: string; posterId?: string; pageSize?: number; dealType?: DealType };
  mode?: 'cursor' | 'page';
}) {
  const pageSize = Math.max(1, initialQuery.pageSize ?? 20);
  const initialItems = sortVipFirstNewest(filterByDealType(initial.items ?? [], initialQuery.dealType));
  const [items, setItems] = useState<ListingItem[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | undefined>(initial.nextCursor);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(() => Math.max(Number(initial.total ?? 0), initialItems.length));
  const [loading, setLoading] = useState(false);

  const hasDealTypeFilter = Boolean(initialQuery.dealType);
  const hasMore = Boolean(nextCursor);
  const totalPages = Math.max(1, Math.ceil(Math.max(total, items.length) / pageSize));
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startItem = total > 0 ? (safeCurrentPage - 1) * pageSize + 1 : 0;
  const endItem = total > 0 ? Math.min(startItem + items.length - 1, total) : items.length;
  const pageWindow = Array.from({ length: totalPages }, (_, idx) => idx + 1).filter((page) => {
    if (totalPages <= 7) return true;
    return page === 1 || page === totalPages || Math.abs(page - safeCurrentPage) <= 1;
  });

  const summary = useMemo(() => {
    const shown = items.length;
    if (shown <= 0) return 'Không có kết quả';
    if (mode === 'page') return `Hiển thị ${startItem}-${endItem} / ${total} tin`;
    if (hasDealTypeFilter) return `Đang hiển thị ${shown} tin`;
    return `Đang hiển thị ${shown}/${total} tin`;
  }, [endItem, hasDealTypeFilter, items.length, mode, startItem, total]);

  async function loadMore() {
    if (!nextCursor || loading) return;

    const params = new URLSearchParams();
    if (initialQuery.q?.trim()) params.set('q', initialQuery.q.trim());
    if (initialQuery.city?.trim()) params.set('city', initialQuery.city.trim());
    if (initialQuery.district?.trim()) params.set('district', initialQuery.district.trim());
    if (initialQuery.posterId?.trim()) params.set('posterId', initialQuery.posterId.trim());
    if (initialQuery.pageSize) params.set('pageSize', String(initialQuery.pageSize));
    if (initialQuery.dealType) params.set('dealType', initialQuery.dealType);
    params.set('cursor', nextCursor);

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/search?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return;

      const payload = (await res.json()) as SearchResponse;
      const filteredIncoming = filterByDealType(payload.items ?? [], initialQuery.dealType);
      setItems((prev) => sortVipFirstNewest(mergeUniqueListings(prev, filteredIncoming)));
      setNextCursor(payload.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  async function loadPage(targetPage: number) {
    if (loading || targetPage === safeCurrentPage || targetPage < 1 || targetPage > totalPages) return;

    const params = new URLSearchParams();
    if (initialQuery.q?.trim()) params.set('q', initialQuery.q.trim());
    if (initialQuery.city?.trim()) params.set('city', initialQuery.city.trim());
    if (initialQuery.district?.trim()) params.set('district', initialQuery.district.trim());
    if (initialQuery.posterId?.trim()) params.set('posterId', initialQuery.posterId.trim());
    if (initialQuery.dealType) params.set('dealType', initialQuery.dealType);
    params.set('page', String(targetPage));
    params.set('pageSize', String(pageSize));

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/search?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return;

      const payload = (await res.json()) as SearchResponse;
      const filteredItems = sortVipFirstNewest(filterByDealType(payload.items ?? [], initialQuery.dealType));
      setItems(filteredItems);
      setTotal(Math.max(Number(payload.total ?? 0), filteredItems.length));
      setCurrentPage(targetPage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-xl border border-[var(--brand-primary)]/20 bg-[rgba(40,189,191,0.08)] px-3 py-2 text-sm text-slate-600">
        <p>{summary}</p>
        <p>{initial.took} ms</p>
      </div>

      <ListingGrid listings={items} />

      {mode === 'page' && totalPages > 1 ? (
        <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="Phân trang danh mục">
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void loadPage(safeCurrentPage - 1)}
            disabled={safeCurrentPage <= 1 || loading}
          >
            Trước
          </button>
          {pageWindow.map((page, index) => {
            const previous = pageWindow[index - 1];
            const gapBefore = typeof previous === 'number' && page - previous > 1;
            return (
              <span key={`page-${page}`} className="contents">
                {gapBefore ? <span className="px-1 text-slate-400">…</span> : null}
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                    page === safeCurrentPage
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]'
                  }`}
                  onClick={() => void loadPage(page)}
                  disabled={page === safeCurrentPage || loading}
                  aria-current={page === safeCurrentPage ? 'page' : undefined}
                >
                  {page}
                </button>
              </span>
            );
          })}
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void loadPage(safeCurrentPage + 1)}
            disabled={safeCurrentPage >= totalPages || loading}
          >
            Sau
          </button>
        </nav>
      ) : null}

      {mode === 'cursor' && hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            className="rounded-full bg-[var(--brand-primary)] px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? 'Đang tải...' : 'Xem thêm'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
