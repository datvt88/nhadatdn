import Link from 'next/link';
import { HeaderNav } from '../components/header-nav';

export default function NotFoundPage() {
  return (
    <main>
      <HeaderNav />
      <section className="mx-auto max-w-3xl px-6 py-14 text-center">
        <h1 className="text-3xl font-bold text-slate-900">404</h1>
        <p className="mt-3 text-lg text-slate-700">Không có trang bạn đang tìm kiếm</p>
        <Link href="/" className="mt-6 inline-flex rounded-lg bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white">
          Quay về trang chủ
        </Link>
      </section>
    </main>
  );
}
