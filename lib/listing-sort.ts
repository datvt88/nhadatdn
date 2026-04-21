import type { ListingItem } from './types';

function parseCreatedAt(value?: string): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isVipPackage(packageType?: string): boolean {
  return String(packageType ?? '').trim().toUpperCase() === 'VIP';
}

export function sortVipFirstNewest(items: ListingItem[]): ListingItem[] {
  return [...items].sort((a, b) => {
    const vipA = isVipPackage(a.packageType);
    const vipB = isVipPackage(b.packageType);
    if (vipA !== vipB) return vipA ? -1 : 1;

    const createdA = parseCreatedAt((a as ListingItem & { createdAt?: string; created_at?: string }).createdAt ?? (a as ListingItem & { createdAt?: string; created_at?: string }).created_at);
    const createdB = parseCreatedAt((b as ListingItem & { createdAt?: string; created_at?: string }).createdAt ?? (b as ListingItem & { createdAt?: string; created_at?: string }).created_at);
    if (createdA !== createdB) return createdB - createdA;

    return Number(b.id) - Number(a.id);
  });
}

