import type { ListingItem } from './types';

export type ListingSortMode = 'default' | 'price_asc' | 'price_desc';

function parseCreatedAt(value?: string): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getCreatedAt(item: ListingItem): number {
  const value = (item as ListingItem & { createdAt?: string; created_at?: string }).createdAt ?? (item as ListingItem & { createdAt?: string; created_at?: string }).created_at;
  return parseCreatedAt(value);
}

function isVipPackage(packageType?: string): boolean {
  return String(packageType ?? '').trim().toUpperCase() === 'VIP';
}

export function sortVipFirstNewest(items: ListingItem[]): ListingItem[] {
  return [...items].sort((a, b) => {
    const vipA = isVipPackage(a.packageType);
    const vipB = isVipPackage(b.packageType);
    if (vipA !== vipB) return vipA ? -1 : 1;

    const createdA = getCreatedAt(a);
    const createdB = getCreatedAt(b);
    if (createdA !== createdB) return createdB - createdA;

    return Number(b.id) - Number(a.id);
  });
}

export function sortListings(items: ListingItem[], mode: ListingSortMode): ListingItem[] {
  if (mode === 'default') return sortVipFirstNewest(items);

  return [...items].sort((a, b) => {
    const priceA = Number(a.price);
    const priceB = Number(b.price);
    const safePriceA = Number.isFinite(priceA) ? priceA : Number.POSITIVE_INFINITY;
    const safePriceB = Number.isFinite(priceB) ? priceB : Number.POSITIVE_INFINITY;
    const priceDiff = mode === 'price_asc' ? safePriceA - safePriceB : safePriceB - safePriceA;
    if (priceDiff !== 0) return priceDiff;

    const createdA = getCreatedAt(a);
    const createdB = getCreatedAt(b);
    if (createdA !== createdB) return createdB - createdA;

    return Number(b.id) - Number(a.id);
  });
}
