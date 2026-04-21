import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Giới thiệu NhadatDN',
  description: 'Nền tảng đăng tin bất động sản NhadatDN',
};

export default function PublicAboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Giới thiệu NhadatDN</h1>
      <p className="mt-4 text-slate-700">Nền tảng đăng tin bất động sản với hệ thống Bean, duyệt tin và quản trị theo vai trò.</p>
    </main>
  );
}
