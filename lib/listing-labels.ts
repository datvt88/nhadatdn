export type DealType = 'can-ban' | 'can-mua' | 'cho-thue';

export function normalizePackageType(value?: string): 'VIP' | 'NORMAL' {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === 'VIP') return 'VIP';
  return 'NORMAL';
}

export function packageBadgeLabel(value?: string): string {
  return normalizePackageType(value) === 'VIP' ? 'Tin VIP' : '';
}

export function packageBadgeClassName(value?: string): string {
  return normalizePackageType(value) === 'VIP' ? 'badge-package badge-package-vip' : '';
}

export function shouldShowVipBadge(value?: string): boolean {
  return normalizePackageType(value) === 'VIP';
}

export function listingStatusLabel(status: string | undefined, dealType: DealType): string {
  const normalized = (status ?? '').trim().toUpperCase();
  if (normalized === 'SOLD') return dealType === 'can-mua' ? 'Đã mua' : 'Đã bán';
  if (normalized === 'RENTED') return 'Đã cho thuê';
  if (dealType === 'cho-thue') return 'Đang cho thuê';
  if (dealType === 'can-mua') return 'Đang cần mua';
  return 'Đang bán';
}
