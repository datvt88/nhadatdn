export type ListingRouteInput = {
  slug: string;
  title?: string;
  district?: string;
  ward?: string;
  categoryHint?: string;
};

export type DealType = 'can-ban' | 'can-mua' | 'cho-thue';
export type DealTypeCategory = 'mua-ban-nha-dat' | 'cho-thue-nha-dat';

export function slugifyVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeHint(value?: string): string {
  return slugifyVietnamese((value ?? '').trim());
}

export function resolveDealType(title?: string, categoryHint?: string): DealType {
  const hint = normalizeHint(categoryHint);
  if (hint === 'cho-thue' || hint === 'cho-thue-nha-dat' || hint === 'rent') {
    return 'cho-thue';
  }
  if (hint === 'can-mua' || hint === 'buy' || hint === 'need-buy') {
    return 'can-mua';
  }
  if (hint === 'can-ban' || hint === 'mua-ban' || hint === 'mua-ban-nha-dat' || hint === 'sell') {
    return 'can-ban';
  }

  const source = slugifyVietnamese(`${title ?? ''} ${categoryHint ?? ''}`).replace(/-/g, ' ');
  if (
    source.includes('cho thue') ||
    source.includes('thue')
  ) {
    return 'cho-thue';
  }

  if (
    source.includes('can mua') ||
    source.includes('tim mua') ||
    source.includes('nhu cau mua') ||
    source.includes('muon mua')
  ) {
    return 'can-mua';
  }

  return 'can-ban';
}

export function categorySegmentByDealType(dealType: DealType): DealTypeCategory {
  return dealType === 'cho-thue' ? 'cho-thue-nha-dat' : 'mua-ban-nha-dat';
}

export function dealTypeFromCategorySegment(segment: string): DealType {
  const normalized = normalizeHint(segment);
  if (normalized === 'cho-thue' || normalized === 'cho-thue-nha-dat') {
    return 'cho-thue';
  }
  if (normalized === 'can-mua' || normalized === 'buy' || normalized === 'need-buy') {
    return 'can-mua';
  }
  return 'can-ban';
}

export function categoryPathByDealType(segmentOrDealType: string): '/mua-ban-nha-dat' | '/cho-thue-nha-dat' {
  return dealTypeFromCategorySegment(segmentOrDealType) === 'cho-thue' ? '/cho-thue-nha-dat' : '/mua-ban-nha-dat';
}

export function resolveCategoryPath(title?: string, categoryHint?: string): '/mua-ban-nha-dat' | '/cho-thue-nha-dat' {
  return categoryPathByDealType(resolveDealType(title, categoryHint));
}

export function resolveLocationSegment(district?: string, ward?: string): string {
  const source = ward || district || 'da-nang';
  const core = slugifyVietnamese(source);
  return `nha-dat-${core || 'da-nang'}`;
}

export function buildListingPath(input: ListingRouteInput): string {
  const dealType = resolveDealType(input.title, input.categoryHint);
  const category = categorySegmentByDealType(dealType);
  const location = resolveLocationSegment(input.district, input.ward);
  return `/${category}/${location}/${input.slug}`;
}
