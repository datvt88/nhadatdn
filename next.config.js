/** @type {import('next').NextConfig} */
function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function parseAbsoluteApiBase(raw) {
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    return {
      origin: parsed.origin,
      pathname: trimTrailingSlash(parsed.pathname || ''),
    };
  } catch {
    return null;
  }
}

const publicApiBase = process.env.NEXT_PUBLIC_API_BASE || '/api';
const parsedPublicApiBase = parseAbsoluteApiBase(publicApiBase);
const imageCdnBase = process.env.NEXT_PUBLIC_IMAGE_CDN_BASE || '';
const parsedImageCdnBase = parseAbsoluteApiBase(imageCdnBase);
const apiProxyOrigin = trimTrailingSlash(process.env.API_PROXY_ORIGIN || parsedPublicApiBase?.origin || 'http://public-api:3002');
const apiProxyBasePath = trimTrailingSlash(process.env.API_PROXY_BASE_PATH || parsedPublicApiBase?.pathname || '/api') || '/api';
const isProduction = process.env.NODE_ENV === 'production';

const cspConnectSrcAllowlist = new Set([
  "'self'",
  'https://accounts.google.com',
  'https://oauth2.googleapis.com',
  'https://www.googleapis.com',
  'https://www.google-analytics.com',
  'https://region1.google-analytics.com',
  'https://stats.g.doubleclick.net',
]);

if (!isProduction) {
  cspConnectSrcAllowlist.add('http://localhost:3002');
  cspConnectSrcAllowlist.add('http://localhost:3003');
  cspConnectSrcAllowlist.add('http://127.0.0.1:3002');
  cspConnectSrcAllowlist.add('http://127.0.0.1:3003');
}

try {
  const origin = new URL(apiProxyOrigin).origin;
  cspConnectSrcAllowlist.add(origin);
} catch {
  // Keep default connect-src allowlist if API_PROXY_ORIGIN is invalid.
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' data: blob: https: http:",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  `connect-src ${Array.from(cspConnectSrcAllowlist).join(' ')}`,
  "frame-src 'self' https://www.google.com https://maps.google.com https://accounts.google.com",
  "font-src 'self' data: https:",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  output: 'standalone',
  experimental: {
    typedRoutes: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'nhadatdn.net' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'host.docker.internal' },
      ...(parsedImageCdnBase
        ? [
            {
              protocol: parsedImageCdnBase.origin.startsWith('https://') ? 'https' : 'http',
              hostname: new URL(parsedImageCdnBase.origin).hostname,
            },
          ]
        : []),
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyOrigin}${apiProxyBasePath}/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${apiProxyOrigin}/uploads/:path*`,
      },
      {
        source: '/uploads-r2/:path*',
        destination: `${apiProxyOrigin}/uploads-r2/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
