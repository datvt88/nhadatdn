'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { hasAdminAccess, readAuthUser, subscribeAuthUser, writeAuthUser } from '../lib/auth-session';
import { BrandLogo } from './brand-logo';

type NavItem = { href: Route; label: string };

const baseNavItems: NavItem[] = [
  { href: '/mua-ban-nha-dat', label: 'Nhà đất bán' },
  { href: '/cho-thue-nha-dat', label: 'Nhà đất cho thuê' },
];

function isActivePath(pathname: string, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HeaderNav() {
  const pathname = usePathname() ?? '';
  const [user, setUser] = useState(() => readAuthUser());

  useEffect(() => {
    setUser(readAuthUser());
    return subscribeAuthUser(() => {
      setUser(readAuthUser());
    });
  }, []);

  const canViewAdmin = hasAdminAccess(user?.role);
  const profileHref: Route = canViewAdmin ? '/quan-tri' : '/tai-khoan';
  const mobileItems: NavItem[] = user
    ? [...baseNavItems, ...(canViewAdmin ? [{ href: '/quan-tri' as Route, label: 'Quản trị' }] : []), { href: profileHref, label: 'Tài khoản' }]
    : baseNavItems;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 text-[2rem] font-extrabold leading-none text-slate-900" aria-label="NhadatDN">
            <BrandLogo variant="text" priority className="h-8 w-auto sm:hidden" />
            <BrandLogo variant="primary" priority className="hidden h-10 w-auto sm:block" />
          </Link>

          <nav className="hidden items-center gap-7 text-[1.125rem] font-medium text-slate-800 lg:flex" aria-label="Main">
            {baseNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`transition-colors hover:text-[var(--brand-primary)] ${isActivePath(pathname, item.href) ? 'text-[var(--brand-primary)]' : ''}`}
              >
                {item.label}
              </Link>
            ))}
            {canViewAdmin ? (
              <Link
                href="/quan-tri"
                className={`transition-colors hover:text-[var(--brand-primary)] ${isActivePath(pathname, '/quan-tri') ? 'text-[var(--brand-primary)]' : ''}`}
              >
                Quản trị
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link href={profileHref} className="hidden rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-300 sm:inline-flex">
                {canViewAdmin ? 'Profile Admin/Mod' : 'Tài khoản'}
              </Link>
              <span className="hidden rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 sm:inline-flex">Bean: {user.beanBalance}</span>
              <button
                type="button"
                onClick={() => {
                  writeAuthUser(null);
                  setUser(null);
                }}
                className="hidden text-base font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline sm:inline-flex"
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link href="/dang-nhap" className="hidden text-base font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline sm:inline-flex">
                Đăng nhập
              </Link>
              <Link href="/dang-ky" className="hidden rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex">
                Đăng ký
              </Link>
            </>
          )}

          <Link
            href="/dang-tin-nha-dat"
            className="inline-flex items-center rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-primary-hover)] sm:px-5 sm:text-base"
          >
            + Đăng tin
          </Link>
        </div>
      </div>

      <nav className="mx-auto flex w-full max-w-7xl items-center gap-2 overflow-x-auto px-4 pb-3 lg:hidden" aria-label="Mobile navigation">
        {mobileItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              isActivePath(pathname, item.href)
                ? 'border-[var(--brand-primary)] bg-cyan-50 text-[var(--brand-primary)]'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            {item.label}
          </Link>
        ))}
        {user ? (
          <button
            type="button"
            onClick={() => {
              writeAuthUser(null);
              setUser(null);
            }}
            className="whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:border-rose-300"
          >
            Đăng xuất
          </button>
        ) : null}
      </nav>
    </header>
  );
}
