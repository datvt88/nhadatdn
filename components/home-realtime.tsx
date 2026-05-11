'use client';

import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListingShowcase } from './listing-showcase';
import { API_BASE } from '../lib/api';
import { buildPagePath } from '../lib/pagination-seo';
import type { ListingItem, SearchResponse } from '../lib/types';

type WardOption = { name: string; slug: string };
type DistrictOption = { name: string; slug: string; sortOrder: number; wards?: WardOption[] };
type DanangCatalog = {
  citySlug: string;
  cityName: string;
  districts: DistrictOption[];
};
type KeywordSuggestion = {
  id: string;
  label: string;
  queryText: string;
  districtSlug: string;
  districtName?: string;
  wardName?: string;
  kind: 'district' | 'ward' | 'street';
  source: 'catalog' | 'map';
};
type AddressSuggestResponse = {
  items?: Array<{
    label?: string;
    lat?: string;
    lng?: string;
    districtSlug?: string;
    districtName?: string;
    wardName?: string;
    keyword?: string;
  }>;
};
type PropertyTypeOption = { value: string; label: string };

const PAGE_SIZE = 20;
const REMOTE_SUGGESTION_MIN_CHARS = 2;
const SUGGESTION_LIMIT = 8;

const PROPERTY_TYPE_OPTIONS: PropertyTypeOption[] = [
  { value: '', label: 'Tất cả loại hình' },
  { value: 'Nhà mặt tiền', label: 'Nhà mặt tiền' },
  { value: 'Nhà kiệt, hẻm', label: 'Nhà kiệt, hẻm' },
  { value: 'Biệt thự, nhà liền kề', label: 'Biệt thự, nhà liền kề' },
  { value: 'Căn hộ chung cư', label: 'Căn hộ chung cư' },
  { value: 'Nhà trọ, phòng trọ', label: 'Nhà trọ, phòng trọ' },
  { value: 'Cửa hàng, kho, xưởng', label: 'Cửa hàng, kho, xưởng' },
  { value: 'Nhà hàng, khách sạn', label: 'Nhà hàng, khách sạn' },
  { value: 'Đất thổ cư', label: 'Đất thổ cư' },
  { value: 'Đất nền, đất dự án', label: 'Đất nền, đất dự án' },
  { value: 'Đất nông nghiệp', label: 'Đất nông nghiệp' },
  { value: 'Trang trại, khu sinh thái', label: 'Trang trại, khu sinh thái' },
  { value: 'Các loại khác', label: 'Các loại khác' },
];

function normalizeVietnameseKeyword(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchParams({
  keyword,
  district,
  priceMin,
  priceMax,
  areaMin,
  areaMax,
  propertyType,
  page,
}: {
  keyword: string;
  district: string;
  priceMin: string;
  priceMax: string;
  areaMin: string;
  areaMax: string;
  propertyType: string;
  page: number;
}): URLSearchParams {
  const query = new URLSearchParams({ pageSize: String(PAGE_SIZE), page: String(page), city: 'da-nang' });
  if (keyword.trim()) query.set('q', keyword.trim());
  if (district.trim()) query.set('district', district.trim());
  if (priceMin.trim()) query.set('price_min', priceMin.trim());
  if (priceMax.trim()) query.set('price_max', priceMax.trim());
  if (areaMin.trim()) query.set('area_min', areaMin.trim());
  if (areaMax.trim()) query.set('area_max', areaMax.trim());
  if (propertyType.trim()) query.set('propertyType', propertyType.trim());
  return query;
}

function resolveDistrictSlug(value: string, districts: DistrictOption[]): string {
  const raw = value.trim();
  if (!raw) return '';
  if (districts.some((item) => item.slug === raw)) return raw;

  const normalizedRaw = normalizeVietnameseKeyword(raw);
  const match = districts.find((item) => {
    if (!item?.slug) return false;
    if (normalizeVietnameseKeyword(item.slug) === normalizedRaw) return true;
    return normalizeVietnameseKeyword(item.name) === normalizedRaw;
  });
  return match?.slug ?? raw;
}

function uniqueKeywords(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeVietnameseKeyword(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function dedupeSuggestions(items: KeywordSuggestion[]): KeywordSuggestion[] {
  const out: KeywordSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const dedupeKey = `${normalizeVietnameseKeyword(item.label)}|${item.districtSlug}|${item.kind}`;
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(item);
  }
  return out;
}

function formatLocalSuggestionLabel(name: string): string {
  return `Phường ${name}, TP Đà Nẵng`;
}

function extractSuggestionQueryText(label: string): string {
  const firstSegment = label.split(',')[0]?.trim() ?? '';
  return firstSegment
    .replace(/^(đường|street)\s+/i, '')
    .replace(/^(phường|xã|quận|huyện|thành phố|tp)\s+/i, '')
    .trim();
}

function compactSuggestionLabel(label: string): string {
  return label
    .replace(/\bThành phố Đà Nẵng\b/gi, 'TP Đà Nẵng')
    .replace(/\bDa Nang City\b/gi, 'TP Đà Nẵng')
    .replace(/\bĐà Nẵng Municipality\b/gi, 'TP Đà Nẵng')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferDistrictFromSuggestionLabel(
  label: string,
  districts: DistrictOption[],
): { districtSlug: string; districtName: string; wardName?: string } | null {
  const normalizedLabel = normalizeVietnameseKeyword(label);
  if (!normalizedLabel) return null;

  for (const item of districts) {
    const districtName = item.name.trim();
    if (!districtName) continue;

    if (normalizedLabel.includes(normalizeVietnameseKeyword(districtName))) {
      return { districtSlug: item.slug, districtName };
    }

    const wards = Array.isArray(item.wards) ? item.wards : [];
    for (const ward of wards) {
      const wardName = ward?.name?.trim();
      if (!wardName) continue;
      if (normalizedLabel.includes(normalizeVietnameseKeyword(wardName))) {
        return { districtSlug: item.slug, districtName, wardName };
      }
    }
  }

  return null;
}

function buildCatalogSuggestions(keyword: string, districts: DistrictOption[]): KeywordSuggestion[] {
  const normalizedKeyword = normalizeVietnameseKeyword(keyword);
  if (!normalizedKeyword) return [];

  const suggestions: KeywordSuggestion[] = [];
  for (const item of districts) {
    const districtName = item.name.trim();
    if (!districtName) continue;
    const normalizedDistrictName = normalizeVietnameseKeyword(districtName);
    if (normalizedDistrictName.includes(normalizedKeyword)) {
      suggestions.push({
        id: `catalog-${item.slug}`,
        label: formatLocalSuggestionLabel(districtName),
        queryText: '',
        districtSlug: item.slug,
        districtName,
        kind: 'ward',
        source: 'catalog',
      });
    }

    const wards = Array.isArray(item.wards) ? item.wards : [];
    for (const ward of wards) {
      const wardName = ward?.name?.trim();
      if (!wardName) continue;
      const normalizedWardName = normalizeVietnameseKeyword(wardName);
      if (!normalizedWardName.includes(normalizedKeyword)) continue;
      suggestions.push({
        id: `catalog-${item.slug}-${ward.slug || wardName}`,
        label: formatLocalSuggestionLabel(wardName),
        queryText: '',
        districtSlug: item.slug,
        districtName,
        wardName,
        kind: 'ward',
        source: 'catalog',
      });
    }
  }

  suggestions.sort((left, right) => {
    const leftStarts = normalizeVietnameseKeyword(left.label).startsWith(normalizedKeyword);
    const rightStarts = normalizeVietnameseKeyword(right.label).startsWith(normalizedKeyword);
    if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
    return left.label.localeCompare(right.label, 'vi');
  });

  return dedupeSuggestions(suggestions).slice(0, SUGGESTION_LIMIT);
}

export function HomeRealtime({
  initialListings,
  initialTotal,
  initialDistricts = [],
  initialPage = 1,
}: {
  initialListings: ListingItem[];
  initialTotal: number;
  initialDistricts?: DistrictOption[];
  initialPage?: number;
}) {
  const [listings, setListings] = useState<ListingItem[]>(initialListings);
  const [total, setTotal] = useState<number>(initialTotal);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [keyword, setKeyword] = useState('');
  const [district, setDistrict] = useState('');
  const [districts, setDistricts] = useState<DistrictOption[]>(initialDistricts);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [loading, setLoading] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<KeywordSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [selectedSuggestion, setSelectedSuggestion] = useState<KeywordSuggestion | null>(null);
  const [suggestionNavigationActive, setSuggestionNavigationActive] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const hasExtraFilters = useMemo(
    () => Boolean(priceMin || priceMax || areaMin || areaMax || propertyType),
    [areaMax, areaMin, priceMax, priceMin, propertyType],
  );
  const hasActiveFilters = useMemo(
    () => Boolean(keyword.trim() || district.trim() || priceMin || priceMax || areaMin || areaMax || propertyType),
    [areaMax, areaMin, district, keyword, priceMax, priceMin, propertyType],
  );
  const districtSlug = useMemo(() => resolveDistrictSlug(district, districts), [district, districts]);
  const showcaseListings = hasActiveFilters ? listings : initialListings;
  const showcaseTotal = hasActiveFilters ? total : initialTotal;
  const showcaseCurrentPage = hasActiveFilters ? currentPage : initialPage;

  const keywordSuggestions = useMemo(() => {
    return dedupeSuggestions([
      ...buildCatalogSuggestions(keyword, districts),
      ...remoteSuggestions,
    ]).slice(0, SUGGESTION_LIMIT);
  }, [districts, keyword, remoteSuggestions]);

  useEffect(() => {
    if (initialDistricts.length > 0) {
      setDistricts(initialDistricts);
      return;
    }
    let active = true;
    const loadCatalog = async () => {
      const res = await fetch(`${API_BASE}/locations/danang`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as DanangCatalog;
      if (!active) return;
      setDistricts(Array.isArray(data.districts) && data.districts.length > 0 ? data.districts : initialDistricts);
    };
    void loadCatalog();
    return () => {
      active = false;
    };
  }, [initialDistricts]);

  useEffect(() => {
    const normalizedKeyword = normalizeVietnameseKeyword(keyword);
    if (!normalizedKeyword) {
      setRemoteSuggestions([]);
      setSuggestionsLoading(false);
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      setSuggestionNavigationActive(false);
      return;
    }

    setSuggestionsOpen(true);
    if (normalizedKeyword.length < REMOTE_SUGGESTION_MIN_CHARS) {
      setRemoteSuggestions([]);
      setSuggestionsLoading(false);
      setActiveSuggestionIndex(-1);
      setSuggestionNavigationActive(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setSuggestionsLoading(true);

    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: keyword.trim(), limit: String(SUGGESTION_LIMIT) });
        const res = await fetch(`${API_BASE}/locations/address-suggest?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) {
          if (active) setRemoteSuggestions([]);
          return;
        }
        const payload = (await res.json()) as AddressSuggestResponse;
        if (!active) return;
        const nextSuggestions = Array.isArray(payload.items)
          ? payload.items
              .map((item, index) => {
                const label = compactSuggestionLabel(String(item.label ?? '').trim());
                if (!label) return null;
                const inferred = inferDistrictFromSuggestionLabel(label, districts);
                return {
                  id: `map-${index}-${normalizeVietnameseKeyword(label)}`,
                  label,
                  queryText: String(item.keyword ?? '').trim() || extractSuggestionQueryText(label),
                  districtSlug: String(item.districtSlug ?? '').trim() || inferred?.districtSlug || '',
                  districtName: String(item.districtName ?? '').trim() || inferred?.districtName || '',
                  wardName: String(item.wardName ?? '').trim() || inferred?.wardName || '',
                  kind: 'street' as const,
                  source: 'map' as const,
                };
              })
              .filter(Boolean) as KeywordSuggestion[]
          : [];
        setRemoteSuggestions(dedupeSuggestions(nextSuggestions));
      } catch {
        if (active) {
          setRemoteSuggestions([]);
        }
      } finally {
        if (active) {
          setSuggestionsLoading(false);
          setActiveSuggestionIndex(-1);
          setSuggestionNavigationActive(false);
        }
      }
    }, 220);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [districts, keyword]);

  const applySuggestion = useCallback((item: KeywordSuggestion) => {
    setSelectedSuggestion(item);
    setKeyword(item.label);
    if (item.districtSlug) {
      setDistrict(item.districtSlug);
    }
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
    setSuggestionNavigationActive(false);
  }, []);

  const fetchListings = useCallback(async (targetPage: number, suggestion?: KeywordSuggestion | null) => {
    const chosenSuggestion = suggestion ?? selectedSuggestion;
    const keywordCandidates = chosenSuggestion
      ? uniqueKeywords(chosenSuggestion.queryText ? [chosenSuggestion.queryText] : [''])
      : uniqueKeywords([keyword.trim(), normalizeVietnameseKeyword(keyword)]);
    const effectiveDistrictSlug = chosenSuggestion?.districtSlug || districtSlug;

    setLoading(true);
    try {
      const runSearch = async (kw: string) => {
        const params = buildSearchParams({
          keyword: kw,
          district: effectiveDistrictSlug,
          priceMin,
          priceMax,
          areaMin,
          areaMax,
          propertyType,
          page: targetPage,
        });
        const res = await fetch(`${API_BASE}/search?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) {
          return { items: [] as ListingItem[], total: 0 };
        }
        const payload = (await res.json()) as SearchResponse;
        return {
          items: Array.isArray(payload.items) ? payload.items : [],
          total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : 0,
        };
      };

      let result = await runSearch(keywordCandidates[0] ?? '');
      if (result.items.length === 0 && result.total === 0 && keywordCandidates.length > 1) {
        result = await runSearch(keywordCandidates[1] ?? '');
      }
      setListings(result.items);
      setTotal(result.total);
      setCurrentPage(targetPage);
    } catch {
      setListings([]);
      setTotal(0);
      setCurrentPage(targetPage);
    } finally {
      setLoading(false);
    }
  }, [areaMax, areaMin, districtSlug, keyword, priceMax, priceMin, propertyType, selectedSuggestion]);

  const onSubmitFilters = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuggestionsOpen(false);
    setSuggestionNavigationActive(false);
    router.replace((pathname || '/') as Route);
    void fetchListings(1);
  }, [fetchListings, pathname, router]);

  const onPageChange = useCallback((page: number) => {
    if (page === currentPage || loading) return;
    void fetchListings(page);
  }, [currentPage, fetchListings, loading]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#eef8f8_0%,_#f6fbfb_35%,_#ffffff_100%)] pb-16">
      <section className="mx-auto w-full max-w-7xl px-4 pb-8 pt-8 sm:px-6 sm:pt-10 lg:px-8 lg:pt-14">
        <header className="text-center">
          <h1 className="text-balance text-[2.2rem] font-extrabold leading-[1.1] text-slate-900 sm:text-5xl lg:text-6xl">
            Mua bán nhà đất Đà Nẵng
          </h1>
          <p className="mx-auto mt-2 max-w-4xl text-base text-slate-600 sm:mt-4 sm:text-xl">
            Tìm kiếm bất động sản Đà Nẵng nhanh và cập nhật mới nhất
          </p>
        </header>

        <form className="mx-auto mt-6 w-full max-w-6xl" onSubmit={onSubmitFilters}>
          <div className="grid grid-cols-1 gap-2.5 md:mt-1 md:grid-cols-[1fr_240px_auto] md:gap-3">
            <div className="relative">
              <label className="group flex h-12 items-center gap-3 rounded-full border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-[var(--brand-primary)] sm:h-14 sm:px-5">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[var(--brand-primary)]" aria-hidden="true">
                  <path d="M10 2a8 8 0 105.293 14.293l4.707 4.707 1.414-1.414-4.707-4.707A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z" />
                </svg>
                <input
                  role="combobox"
                  aria-label="Tìm kiếm bất động sản Đà Nẵng"
                  aria-autocomplete="list"
                  aria-expanded={suggestionsOpen && keywordSuggestions.length > 0}
                  aria-haspopup="listbox"
                  aria-controls="home-keyword-suggestions"
                  aria-activedescendant={suggestionNavigationActive && activeSuggestionIndex >= 0 ? `home-keyword-suggestion-${activeSuggestionIndex}` : undefined}
                  placeholder="Từ khóa"
                  className="h-full w-full bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400 sm:text-lg"
                  value={keyword}
                  onFocus={() => {
                    if (keyword.trim()) setSuggestionsOpen(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setSuggestionsOpen(false), 120);
                  }}
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    setSelectedSuggestion(null);
                    setSuggestionsOpen(true);
                    setActiveSuggestionIndex(-1);
                    setSuggestionNavigationActive(false);
                  }}
                  onKeyDown={(event) => {
                    if (!suggestionsOpen || keywordSuggestions.length === 0) return;
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setSuggestionNavigationActive(true);
                      setActiveSuggestionIndex((prev) => (prev + 1) % keywordSuggestions.length);
                      return;
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setSuggestionNavigationActive(true);
                      setActiveSuggestionIndex((prev) => (prev <= 0 ? keywordSuggestions.length - 1 : prev - 1));
                      return;
                    }
                    if (event.key === 'Escape') {
                      setSuggestionsOpen(false);
                      setActiveSuggestionIndex(-1);
                      setSuggestionNavigationActive(false);
                      return;
                    }
                    if (event.key === 'Enter' && suggestionNavigationActive && activeSuggestionIndex >= 0 && keywordSuggestions[activeSuggestionIndex]) {
                      event.preventDefault();
                      const suggestion = keywordSuggestions[activeSuggestionIndex];
                      applySuggestion(suggestion);
                      router.replace((pathname || '/') as Route);
                      void fetchListings(1, suggestion);
                    }
                  }}
                />
              </label>

              {suggestionsOpen && (keywordSuggestions.length > 0 || suggestionsLoading) ? (
                <div
                  id="home-keyword-suggestions"
                  role="listbox"
                  aria-label="Gợi ý tìm kiếm bất động sản Đà Nẵng"
                  className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl"
                >
                  <div className="max-h-80 overflow-y-auto py-2">
                    {keywordSuggestions.map((item, index) => {
                      const isActive = index === activeSuggestionIndex;
                      return (
                        <button
                          key={item.id}
                          id={`home-keyword-suggestion-${index}`}
                          role="option"
                          aria-selected={isActive}
                          type="button"
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${isActive ? 'bg-[rgba(40,189,191,0.10)]' : 'bg-white hover:bg-slate-50'}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => applySuggestion(item)}
                        >
                          <span className="mt-1 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[rgba(40,189,191,0.12)] text-[11px] font-bold uppercase tracking-wide text-[var(--brand-primary)]">
                            {item.kind === 'street' ? 'Đg' : 'Px'}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-800 sm:text-[15px]">{item.label}</span>
                            <span className="block text-xs text-slate-500">
                              {item.kind === 'street'
                                ? 'Gợi ý địa chỉ Đà Nẵng theo dữ liệu bản đồ'
                                : 'Gợi ý phường/xã Đà Nẵng'}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {suggestionsLoading ? (
                      <div className="px-4 py-3 text-sm text-slate-500">Đang tải gợi ý địa chỉ Đà Nẵng...</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <select
              aria-label="Lọc theo phường/xã"
              className="h-12 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[var(--brand-primary)] sm:h-14 sm:px-5 sm:text-base"
              value={district}
              onChange={(event) => {
                setDistrict(event.target.value);
                setSelectedSuggestion(null);
              }}
            >
              <option value="">Toàn bộ phường/xã</option>
              {districts.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>

            <button
              className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--brand-primary)] px-6 text-base font-bold text-white shadow-md transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-70 sm:h-14 sm:px-8 sm:text-lg md:min-w-[96px]"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Đang lọc...' : 'Lọc'}
            </button>
          </div>

          <div className="mx-auto mt-2.5 w-full max-w-6xl">
            <p className="text-xs text-slate-500">
              Gợi ý nhanh: nhập tên đường, phường/xã trong Đà Nẵng. Ví dụ: “Hải Châu”, “Phan Đăng Lưu”, “2 Tháng 9”.
            </p>
          </div>

          <div className="mx-auto mt-3 grid w-full max-w-6xl grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
            <input aria-label="Giá tối thiểu" placeholder="Giá từ" className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[var(--brand-primary)] sm:h-11 sm:text-[15px]" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} />
            <input aria-label="Giá tối đa" placeholder="Giá đến" className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[var(--brand-primary)] sm:h-11 sm:text-[15px]" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} />
            <input aria-label="Diện tích tối thiểu" placeholder="DT từ (m2)" className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[var(--brand-primary)] sm:h-11 sm:text-[15px]" value={areaMin} onChange={(event) => setAreaMin(event.target.value)} />
            <input aria-label="Diện tích tối đa" placeholder="DT đến (m2)" className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[var(--brand-primary)] sm:h-11 sm:text-[15px]" value={areaMax} onChange={(event) => setAreaMax(event.target.value)} />
            <select
              aria-label="Lọc theo loại hình bất động sản"
              className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[var(--brand-primary)] sm:h-11 sm:text-[15px]"
              value={propertyType}
              onChange={(event) => setPropertyType(event.target.value)}
            >
              {PROPERTY_TYPE_OPTIONS.map((item) => (
                <option key={item.value || 'all'} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
        </form>

        {hasExtraFilters ? <p className="mt-3 text-center text-sm text-slate-500">Đang áp dụng bộ lọc nâng cao.</p> : null}
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <ListingShowcase
          key={hasActiveFilters ? 'filtered-homepage-results' : `homepage-page-${initialPage}`}
          listings={showcaseListings}
          total={showcaseTotal}
          currentPage={showcaseCurrentPage}
          pageSize={PAGE_SIZE}
          loading={loading}
          onPageChange={onPageChange}
          useLinkPagination={!hasActiveFilters}
          buildPageHref={(page) => buildPagePath(pathname || '/', page)}
        />
      </section>
    </main>
  );
}
