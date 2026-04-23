'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListingShowcase } from './listing-showcase';
import { API_BASE } from '../lib/api';
import type { ListingItem, SearchResponse } from '../lib/types';

type WardOption = { name: string; slug: string };
type DistrictOption = { name: string; slug: string; sortOrder: number; wards?: WardOption[] };
type DanangCatalog = {
  citySlug: string;
  cityName: string;
  districts: DistrictOption[];
};
type KeywordSuggestion = {
  label: string;
  districtSlug: string;
};
type PropertyTypeOption = { value: string; label: string };

const LISTING_SYNC_KEY = 'nhadatdn.listings.updatedAt';
const LISTING_SYNC_EVENT = 'nhadatdn-listings-updated';
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
  dealType,
}: {
  keyword: string;
  district: string;
  priceMin: string;
  priceMax: string;
  areaMin: string;
  areaMax: string;
  propertyType: string;
  dealType: 'can-ban' | 'cho-thue';
}): URLSearchParams {
  const query = new URLSearchParams({ pageSize: '20', city: 'da-nang', dealType });
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

export function HomeRealtime({
  initialSaleListings,
  initialRentListings,
  initialDistricts = [],
}: {
  initialSaleListings: ListingItem[];
  initialRentListings: ListingItem[];
  initialDistricts?: DistrictOption[];
}) {
  const [saleListings, setSaleListings] = useState<ListingItem[]>(initialSaleListings);
  const [rentListings, setRentListings] = useState<ListingItem[]>(initialRentListings);
  const [keyword, setKeyword] = useState('');
  const [district, setDistrict] = useState('');
  const [districts, setDistricts] = useState<DistrictOption[]>(initialDistricts);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshTimerRef = useRef<number | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const hasExtraFilters = useMemo(
    () => Boolean(priceMin || priceMax || areaMin || areaMax || propertyType),
    [areaMax, areaMin, priceMax, priceMin, propertyType],
  );
  const districtSlug = useMemo(() => resolveDistrictSlug(district, districts), [district, districts]);

  const keywordSuggestions = useMemo(() => {
    const dictionary = new Map<string, KeywordSuggestion>();
    for (const item of districts) {
      const districtLabel = item.name.trim();
      if (districtLabel) {
        const dedupeKey = normalizeVietnameseKeyword(districtLabel);
        if (dedupeKey && !dictionary.has(dedupeKey)) {
          dictionary.set(dedupeKey, { label: districtLabel, districtSlug: item.slug });
        }
      }
      const wards = Array.isArray(item.wards) ? item.wards : [];
      for (const ward of wards) {
        const wardLabel = ward?.name?.trim();
        if (!wardLabel) continue;
        const dedupeKey = normalizeVietnameseKeyword(wardLabel);
        if (dedupeKey && !dictionary.has(dedupeKey)) {
          dictionary.set(dedupeKey, { label: wardLabel, districtSlug: item.slug });
        }
      }
    }
    const all = Array.from(dictionary.values());
    const q = normalizeVietnameseKeyword(keyword);
    if (!q) return all.slice(0, 12);
    return all
      .filter((row) => normalizeVietnameseKeyword(row.label).includes(q))
      .slice(0, 12);
  }, [districts, keyword]);

  useEffect(() => {
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

  const fetchListings = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const keywordCandidates = uniqueKeywords([keyword, normalizeVietnameseKeyword(keyword)]);

    setLoading(true);
    try {
      const runSearch = async (kw: string) => {
        const saleParams = buildSearchParams({ keyword: kw, district: districtSlug, priceMin, priceMax, areaMin, areaMax, propertyType, dealType: 'can-ban' });
        const rentParams = buildSearchParams({ keyword: kw, district: districtSlug, priceMin, priceMax, areaMin, areaMax, propertyType, dealType: 'cho-thue' });
        const [saleRes, rentRes] = await Promise.all([
          fetch(`${API_BASE}/search?${saleParams.toString()}`, { cache: 'no-store', signal: controller.signal }),
          fetch(`${API_BASE}/search?${rentParams.toString()}`, { cache: 'no-store', signal: controller.signal }),
        ]);
        const saleItems = saleRes.ok ? (((await saleRes.json()) as SearchResponse).items ?? []) : [];
        const rentItems = rentRes.ok ? (((await rentRes.json()) as SearchResponse).items ?? []) : [];
        return {
          saleItems: Array.isArray(saleItems) ? saleItems : [],
          rentItems: Array.isArray(rentItems) ? rentItems : [],
        };
      };

      let result = await runSearch(keywordCandidates[0] ?? '');
      if (result.saleItems.length === 0 && result.rentItems.length === 0 && keywordCandidates.length > 1) {
        result = await runSearch(keywordCandidates[1]);
      }
      setSaleListings(result.saleItems);
      setRentListings(result.rentItems);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setSaleListings([]);
        setRentListings([]);
      }
    } finally {
      setLoading(false);
    }
  }, [areaMax, areaMin, districtSlug, keyword, priceMax, priceMin, propertyType]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchListings();
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [fetchListings]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          void fetchListings();
        }
      }, 30000);
    };

    scheduleRefresh();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchListings();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === LISTING_SYNC_KEY) {
        void fetchListings();
      }
    };

    const onListingsUpdated = () => {
      void fetchListings();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onListingsUpdated);
    window.addEventListener('storage', onStorage);
    window.addEventListener(LISTING_SYNC_EVENT, onListingsUpdated);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onListingsUpdated);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LISTING_SYNC_EVENT, onListingsUpdated);
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = null;
    };
  }, [fetchListings]);

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

        <div className="mx-auto mt-6 grid w-full max-w-6xl grid-cols-1 gap-2.5 md:mt-7 md:grid-cols-[1fr_240px_auto] md:gap-3">
          <label className="group flex h-12 items-center gap-3 rounded-full border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-[var(--brand-primary)] sm:h-14 sm:px-5">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[var(--brand-primary)]" aria-hidden="true">
              <path d="M10 2a8 8 0 105.293 14.293l4.707 4.707 1.414-1.414-4.707-4.707A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z" />
            </svg>
            <input
              aria-label="Tìm kiếm bất động sản Đà Nẵng"
              placeholder="Từ khóa"
              className="h-full w-full bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400 sm:text-lg"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>

          <select
            aria-label="Lọc theo phường/xã"
            className="h-12 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[var(--brand-primary)] sm:h-14 sm:px-5 sm:text-base"
            value={district}
            onChange={(event) => setDistrict(event.target.value)}
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
            type="button"
            onClick={() => void fetchListings()}
            disabled={loading}
          >
            {loading ? 'Đang lọc...' : 'Lọc'}
          </button>
        </div>

        <div className="mx-auto mt-2.5 w-full max-w-6xl">
          <p className="text-xs text-slate-500">Gợi ý nhanh: nhập tên đường, phường/xã mới của Đà Nẵng để lọc chính xác hơn.</p>
          <div className="mt-1.5 max-h-20 overflow-y-auto pr-1 sm:max-h-24">
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {keywordSuggestions.map((item) => (
              <button
                key={`${item.districtSlug}-${item.label}`}
                type="button"
                className="rounded-full border border-[var(--brand-primary)]/20 bg-white px-2.5 py-1 text-[12px] text-slate-600 transition hover:border-[var(--brand-primary)]/40 hover:bg-[rgba(40,189,191,0.08)] sm:px-3 sm:text-xs"
                onClick={() => {
                  setKeyword(item.label);
                  setDistrict(item.districtSlug);
                }}
              >
                {item.label}
              </button>
            ))}
            </div>
          </div>
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

        {hasExtraFilters ? <p className="mt-3 text-center text-sm text-slate-500">Đang áp dụng bộ lọc nâng cao realtime.</p> : null}

      </section>

      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <ListingShowcase saleListings={saleListings} rentListings={rentListings} />
      </section>
    </main>
  );
}






