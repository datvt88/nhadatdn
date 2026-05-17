import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HeaderNav } from '../../../components/header-nav';
import { SearchListingFeed } from '../../../components/search-listing-feed';
import { fetchJsonOr } from '../../../lib/api';
import type { SearchResponse } from '../../../lib/types';
import { toAbsoluteUrl } from '../../../lib/seo';

type PublicUserBadge = {
  code: string;
  label: string;
  description: string;
  rank?: number;
};

type PublicUserBio = {
  userId: number;
  fullName: string;
  bio: string;
  avatarUrl?: string;
  phoneVerified: boolean;
  accountCreatedAt: string;
  stats: {
    beanBalance: number;
    totalListings: number;
    activeListings: number;
    completedListings: number;
    averageStars: number;
    totalRatings: number;
  };
  badges: PublicUserBadge[];
};

async function getPublicBio(id: string): Promise<PublicUserBio | null> {
  if (!/^\d+$/.test(id)) return null;
  return fetchJsonOr<PublicUserBio | null>(`/users/${id}/bio`, null, { cache: 'no-store' });
}

async function getPosterListings(id: string, page: number): Promise<SearchResponse> {
  if (!/^\d+$/.test(id)) return { took: 0, total: 0, items: [] };
  return fetchJsonOr<SearchResponse>(
    `/search?city=da-nang&page=${page}&pageSize=20&posterId=${encodeURIComponent(id)}`,
    { took: 0, total: 0, items: [] },
    { cache: 'no-store' },
  );
}

function formatAccountDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Đang cập nhật';
  return date.toLocaleDateString('vi-VN');
}

function formatRating(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Chưa có';
  return value.toFixed(1).replace(/\.0$/, '');
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const bio = await getPublicBio(params.id);
  if (!bio) {
    return { title: 'Người đăng không tồn tại | NhadatDN' };
  }
  const title = `${bio.fullName} | Bio người đăng NhadatDN`;
  const description = bio.bio || `Thông tin người đăng ${bio.fullName} và các tin bất động sản đang hiển thị trên NhadatDN.`;
  const canonical = toAbsoluteUrl(`/nguoi-dang/${bio.userId}`);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      ...(bio.avatarUrl ? { images: [{ url: bio.avatarUrl, width: 512, height: 512, alt: bio.fullName }] } : {}),
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function PosterBioPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { page?: string };
}) {
  const bio = await getPublicBio(params.id);
  if (!bio) notFound();

  const currentPage = Math.max(1, Number(searchParams?.page ?? '1') || 1);
  const listings = await getPosterListings(String(bio.userId), currentPage);
  const initials = bio.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'ND';

  return (
    <main className="min-h-screen bg-slate-50">
      <HeaderNav />
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <nav className="mb-4 text-sm text-slate-500">
          NhadatDN &gt; Người đăng &gt; <span className="font-semibold text-slate-700">{bio.fullName}</span>
        </nav>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              {bio.avatarUrl ? (
                <img
                  src={bio.avatarUrl}
                  alt={`Ảnh đại diện ${bio.fullName}`}
                  className="h-20 w-20 shrink-0 rounded-full border border-slate-200 object-cover shadow-sm"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xl font-bold text-white">
                  {initials}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-slate-950">{bio.fullName}</h1>
                <p className="mt-1 text-sm text-slate-500">Thành viên từ {formatAccountDate(bio.accountCreatedAt)}</p>
                <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-6 text-slate-700">
                  {bio.bio || 'Người đăng chưa cập nhật giới thiệu cá nhân.'}
                </p>
              </div>
            </div>

            <div className="grid min-w-[220px] grid-cols-2 gap-2 text-center text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-lg font-bold text-slate-950">{bio.stats.activeListings}</p>
                <p className="text-xs text-slate-500">Tin đang hiển thị</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-lg font-bold text-slate-950">{bio.stats.completedListings}</p>
                <p className="text-xs text-slate-500">Đã bán/thuê</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-lg font-bold text-slate-950">{formatRating(bio.stats.averageStars)}</p>
                <p className="text-xs text-slate-500">Đánh giá</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-lg font-bold text-slate-950">{bio.stats.beanBalance}</p>
                <p className="text-xs text-slate-500">Bean</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {bio.phoneVerified ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">SĐT đã xác thực</span> : null}
            {bio.badges.length > 0 ? (
              bio.badges.map((badge) => (
                <span key={badge.code} title={badge.description} className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-[var(--brand-primary-hover)]">
                  {badge.label}
                  {badge.rank ? ` #${badge.rank}` : ''}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Đang xây dựng huy hiệu</span>
            )}
          </div>
        </article>

        <section className="mt-6">
          <h2 className="mb-4 text-xl font-bold text-slate-950">Tin đăng của {bio.fullName}</h2>
          <SearchListingFeed
            initial={listings}
            initialQuery={{ city: 'da-nang', posterId: String(bio.userId), pageSize: 20 }}
            mode="page"
            initialPage={currentPage}
            basePath={`/nguoi-dang/${bio.userId}`}
          />
        </section>
      </section>
    </main>
  );
}
