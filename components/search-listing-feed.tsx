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
}: {
  initial: SearchResponse;
  initialQuery: { q?: string; city?: string; district?: string; posterId?: string; pageSize?: number; dealType?: DealType };
}) {
  const [items, setItems] = useState<ListingItem[]>(() => sortVipFirstNewest(filterByDealType(initial.items ?? [], initialQuery.dealType))); 
  const [nextCursor, setNextCursor] = useState<string | undefined>(initial.nextCursor);
  const [loading, setLoading] = useState(false);

  const hasDealTypeFilter = Boolean(initialQuery.dealType);
  const total = hasDealTypeFilter ? items.length : (initial.total ?? items.length);
  const hasMore = Boolean(nextCursor);

  const summary = useMemo(() => {
    const shown = items.length;
    if (shown <= 0) return 'Không có kết quả';
    if (hasDealTypeFilter) return `Đang hiển thị ${shown} tin`;
    return `Đang hiển thị ${shown}/${total} tin`;
  }, [items.length, total, hasDealTypeFilter]);

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-xl border border-[var(--brand-primary)]/20 bg-[rgba(40,189,191,0.08)] px-3 py-2 text-sm text-slate-600">
        <p>{summary}</p>
        <p>{initial.took} ms</p>
      </div>

      <ListingGrid listings={items} />

      {hasMore ? (
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


