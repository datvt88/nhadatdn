import type { ListingItem } from '../lib/types';
import { ListingCard } from './listing-card';

export function ListingGrid({ listings }: { listings: ListingItem[] }) {
  if (listings.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Không có tin đăng phù hợp bộ lọc hiện tại.</div>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
