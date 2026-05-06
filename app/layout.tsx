import { Montserrat } from 'next/font/google';
import Script from 'next/script';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { fetchJsonOr } from '../lib/api';
import { getSiteUrl } from '../lib/seo';

type GlobalGoogleTagConfig = {
  enabled?: boolean;
  googleTagId?: string;
};

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const trackingConfig = await fetchJsonOr<GlobalGoogleTagConfig>(
    '/tracking/global',
    { enabled: false, googleTagId: '' },
    { cache: 'no-store' },
  );
  const googleTagId = typeof trackingConfig.googleTagId === 'string' ? trackingConfig.googleTagId.trim() : '';
  const googleTagEnabled = Boolean(trackingConfig.enabled) && googleTagId.length > 0;

  return (
    <html lang="vi">
      <body className={montserrat069ab3.variable}>
        {googleTagEnabled ? (
          <>
            <Script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}`} strategy="afterInteractive" />
            <Script
              id="nhadatdn-google-tag"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(googleTagId)});`,
              }}
            />
          </>
        ) : null}
        {children}
      </body>
    </html>
  );
}
