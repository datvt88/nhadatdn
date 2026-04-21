'use client';

import Image from 'next/image';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HeaderNav } from '../../components/header-nav';
import { readAuthUser, subscribeAuthUser, type AuthUser } from '../../lib/auth-session';
import { readFavorites, removeFavorite, type FavoriteListing } from '../../lib/favorites';

export default function FavoritesPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<FavoriteListing[]>([]);

  useEffect(() => {
    const sync = () => {
      const current = readAuthUser();
      setUser(current);
      setItems(readFavorites(current));
    };

    sync();
    return subscribeAuthUser(sync);
  }, []);

  function onRemove(slug: string) {
    removeFavorite(user, slug);
    setItems(readFavorites(user));
  }

  return (
    <main>
      <HeaderNav />
      <section className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Tin đã lưu</h1>

        {!user ? (
          <p className="mt-3 text-slate-600">
            Bạn chưa đăng nhập.{' '}
            <Link href="/dang-nhap" className="font-semibold text-[var(--brand-primary)]">
              Đăng nhập
            </Link>{' '}
            để lưu và xem danh sách tin đã lưu.
          </p>
        ) : items.length === 0 ? (
          <p className="mt-3 text-slate-600">Chưa có tin nào được lưu.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <article key={item.slug} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {item.image ? (
                  <div className="relative h-44 w-full">
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                  </div>
                ) : null}
                <div className="space-y-2 p-4">
                  <Link href={item.path as Route} className="line-clamp-2 text-base font-bold text-slate-900 hover:text-[var(--brand-primary)]">
                    {item.title}
                  </Link>
                  <p className="text-sm text-slate-600">{item.address || 'Đà Nẵng'}</p>
                  <div className="flex items-center justify-between pt-1">
                    <Link href={item.path as Route} className="text-sm font-semibold text-[var(--brand-primary)]">
                      Xem tin
                    </Link>
                    <button onClick={() => onRemove(item.slug)} className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">
                      Bỏ lưu
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

