import type { ListingItem } from '../lib/types';
import { ListingCard } from './listing-card';
import { sortVipFirstNewest } from '../lib/listing-sort';

function sectionTitle(id: string, label: string) {
  return (
    <h2 id={id} className="mb-5 flex items-center gap-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
      <span className="h-10 w-1.5 rounded-full bg-[var(--brand-primary)]" aria-hidden="true" />
      {label}
    </h2>
  );
}

export function ListingShowcase({
  saleListings,
  rentListings,
}: {
  saleListings: ListingItem[];
  rentListings: ListingItem[];
}) {
  const newestSales = sortVipFirstNewest(saleListings).slice(0, 8);
  const newestRents = sortVipFirstNewest(rentListings).slice(0, 8);

  if (newestSales.length === 0 && newestRents.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
        Chưa có tin đăng phù hợp bộ lọc. Vui lòng thử điều kiện khác.
      </section>
    );
  }

  return (
    <div className="space-y-14">
      <section>
        {sectionTitle("sale-latest", 'Bất động sản bán mới nhất')}
        {newestSales.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {newestSales.map((listing) => (
              <ListingCard key={`sale-${listing.id}`} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Chưa có tin mua bán nhà đất trong danh sách hiện tại.</div>
        )}
      </section>

      <section>
        {sectionTitle("rent-latest", 'Bất động sản cho thuê mới nhất')}
        {newestRents.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {newestRents.map((listing) => (
              <ListingCard key={`rent-${listing.id}`} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Chưa có tin cho thuê nhà đất trong danh sách hiện tại.</div>
        )}
      </section>
    </div>
  );
}


