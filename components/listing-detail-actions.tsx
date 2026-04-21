'use client';

import { useMemo, useState } from 'react';
import { readAuthUser } from '../lib/auth-session';
import { isFavorite, toggleFavorite } from '../lib/favorites';

type Props = {
  slug: string;
  title: string;
  path: string;
  price?: number;
  area?: number;
  address?: string;
  image?: string;
};

const iconClass = 'h-4 w-4';

export function ListingDetailActions({ slug, title, path, price, area, address, image }: Props) {
  const [message, setMessage] = useState('');
  const [tick, setTick] = useState(0);
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path}`;
  }, [path, tick]);

  const user = typeof window !== 'undefined' ? readAuthUser() : null;
  const saved = isFavorite(user, slug);

  async function onSave() {
    const result = toggleFavorite(user, { slug, title, path, price, area, address, image });
    if (!result.ok) {
      setMessage(result.message ?? 'Bạn cần đăng nhập để lưu tin.');
      return;
    }
    setMessage(result.saved ? 'Đã lưu tin vào danh sách của bạn.' : 'Đã bỏ lưu tin.');
    setTick((v) => v + 1);
  }

  async function onCopyLink() {
    const url = typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(url);
    setMessage('Đã copy link tin đăng.');
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void onSave()}
        className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        {saved ? 'Đã lưu' : 'Lưu'}
      </button>
      <details className="relative">
        <summary className="list-none cursor-pointer rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true">
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M16 6l-4-4-4 4" />
            <path d="M12 2v14" />
          </svg>
          Chia sẻ
        </summary>
        <div className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <button type="button" onClick={() => void onCopyLink()} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50">
            Copy link
          </button>
          <a className="block rounded px-3 py-2 text-sm hover:bg-slate-50" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">
            Chia sẻ Facebook
          </a>
          <a className="block rounded px-3 py-2 text-sm hover:bg-slate-50" href={`https://zalo.me/share?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">
            Chia sẻ Zalo
          </a>
        </div>
      </details>
      {message ? <span className="text-xs text-slate-500">{message}</span> : null}
    </div>
  );
}
