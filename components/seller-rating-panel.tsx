'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../lib/api';
import { authHeaders, readAuthUser, subscribeAuthUser } from '../lib/auth-session';

type RatingSummary = {
  sellerUserId: number;
  averageStars: number;
  totalRatings: number;
  completedListings: number;
  myRating?: number;
};

type Props = {
  sellerUserId: number;
  completedLabel?: string;
};

const LOAD_FALLBACK_DELAY_MS = 30000;

function formatAverage(avg: number): string {
  const rounded = Math.round(avg * 10) / 10;
  return rounded.toFixed(1);
}

export function SellerRatingPanel({ sellerUserId, completedLabel = 'Đã bán' }: Props) {
  const [summary, setSummary] = useState<RatingSummary>({
    sellerUserId,
    averageStars: 0,
    totalRatings: 0,
    completedListings: 0,
  });
  const [selectedStars, setSelectedStars] = useState('5');
  const [message, setMessage] = useState('');
  const [tick, setTick] = useState(0);
  const [shouldLoadSummary, setShouldLoadSummary] = useState(false);
  const user = typeof window !== 'undefined' ? readAuthUser() : null;

  const canRate = useMemo(() => Boolean(user && user.id !== sellerUserId), [user, sellerUserId]);
  const hasRated = typeof summary.myRating === 'number';

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const passiveEvents = new Set<keyof WindowEventMap>(['pointerdown', 'touchstart', 'scroll']);
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'scroll', 'keydown'];

    const enableLoad = () => {
      if (!cancelled) {
        setShouldLoadSummary(true);
      }
    };

    events.forEach((eventName) => {
      if (passiveEvents.has(eventName)) {
        window.addEventListener(eventName, enableLoad, { once: true, passive: true });
      } else {
        window.addEventListener(eventName, enableLoad, { once: true });
      }
    });
    timeoutId = window.setTimeout(enableLoad, LOAD_FALLBACK_DELAY_MS);

    return () => {
      cancelled = true;
      if (typeof timeoutId === 'number') {
        window.clearTimeout(timeoutId);
      }
      events.forEach((eventName) => {
        window.removeEventListener(eventName, enableLoad);
      });
    };
  }, []);

  useEffect(() => {
    if (!shouldLoadSummary) return;

    let cancelled = false;
    async function loadSummary() {
      const params = new URLSearchParams();
      if (user?.id) {
        params.set('raterUserId', String(user.id));
      }
      const url = `${API_BASE}/users/${sellerUserId}/rating-summary${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      const payload = (await res.json().catch(() => ({}))) as Partial<RatingSummary>;
      if (cancelled || !res.ok) return;
      const next = {
        sellerUserId,
        averageStars: Number(payload.averageStars ?? 0),
        totalRatings: Number(payload.totalRatings ?? 0),
        completedListings: Number(payload.completedListings ?? 0),
        ...(typeof payload.myRating === 'number' ? { myRating: payload.myRating } : {}),
      };
      setSummary(next);
      if (typeof payload.myRating === 'number') {
        setSelectedStars(String(payload.myRating));
      }
    }
    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [sellerUserId, shouldLoadSummary, tick, user?.id]);

  useEffect(() => {
    return subscribeAuthUser(() => setTick((v) => v + 1));
  }, []);

  async function submitRating() {
    if (!user) {
      setMessage('Vui lòng đăng nhập để đánh giá.');
      return;
    }
    const stars = Number(selectedStars);
    const res = await fetch(`${API_BASE}/users/${sellerUserId}/rating`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(user),
      },
      body: JSON.stringify({ stars }),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage(String(payload.error ?? 'Không thể gửi đánh giá'));
      return;
    }
    setMessage(hasRated ? 'Đã cập nhật đánh giá.' : 'Đã lưu đánh giá.');
    setTick((v) => v + 1);
  }

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div className="rounded-lg bg-white px-2 py-2 text-center">
          <p className="text-2xl font-extrabold leading-none text-slate-900 sm:text-3xl">{summary.completedListings}</p>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">{completedLabel}</p>
        </div>
        <div className="rounded-lg bg-white px-2 py-2 text-center">
          <p className="inline-flex items-center gap-1 text-2xl font-extrabold leading-none text-slate-900 sm:text-3xl">
            {formatAverage(summary.averageStars)}
            <span className="text-amber-500">★</span>
          </p>
          <p className="mt-1 text-xs text-slate-600 underline underline-offset-2 sm:text-sm">{summary.totalRatings} đánh giá</p>
        </div>
      </div>

      {canRate ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 border-t border-slate-200 pt-2">
          <select className="h-8 rounded border border-slate-300 px-2 text-xs sm:h-9 sm:text-sm" value={selectedStars} onChange={(e) => setSelectedStars(e.target.value)}>
            <option value="5">5 sao</option>
            <option value="4">4 sao</option>
            <option value="3">3 sao</option>
            <option value="2">2 sao</option>
            <option value="1">1 sao</option>
          </select>
          <button type="button" className="h-8 min-w-[104px] rounded bg-[var(--brand-primary)] px-3 text-center text-xs font-semibold text-white sm:h-9 sm:text-sm" onClick={() => void submitRating()}>
            {hasRated ? 'Cập nhật' : 'Đánh Giá'}
          </button>
        </div>
      ) : null}

      {message ? <p className="mt-1 text-center text-[11px] text-slate-500 sm:text-xs">{message}</p> : null}
    </div>
  );
}
