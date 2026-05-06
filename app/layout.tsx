import { Montserrat } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getSiteUrl } from '../lib/seo';

const montserrat069ab3 = Montserrat({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-montserrat-069ab3',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: 'Nhà đất Đà Nẵng - Mua bán & cho thuê nhà đất Đà Nẵng',
    template: '%s | NhadatDN',
  },
  description:
    'Nền tảng tìm kiếm và đăng tin nhà đất Đà Nẵng, chuẩn danh mục mua bán/cho thuê theo phường xã mới và bộ lọc realtime.',
  keywords: ['nhà đất Đà Nẵng', 'mua bán nhà đất Đà Nẵng', 'cho thuê nhà đất Đà Nẵng', 'đăng tin nhà đất Đà Nẵng'],
  category: 'real estate',
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    title: 'Nhà đất Đà Nẵng - Mua bán & cho thuê nhà đất Đà Nẵng',
    description: 'Khám phá tin đăng mua bán và cho thuê nhà đất Đà Nẵng mới nhất với dữ liệu realtime.',
    url: getSiteUrl(),
    siteName: 'NhadatDN',
    images: [{ url: '/logo-nhadatdn.svg', width: 512, height: 512, alt: 'NhadatDN' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nhà đất Đà Nẵng - Mua bán & cho thuê nhà đất Đà Nẵng',
    description: 'Khám phá tin đăng mua bán và cho thuê nhà đất Đà Nẵng mới nhất với dữ liệu realtime.',
    images: ['/logo-nhadatdn.svg'],
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: 'XQHaOfNN7YXc5kixBK2wF4ry4vUOTRB2dl3CGPfmqXI',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#28bdbf',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={montserrat069ab3.variable}>{children}</body>
    </html>
  );
}

