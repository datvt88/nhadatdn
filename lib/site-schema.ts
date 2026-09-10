import { getSiteUrl, toAbsoluteUrl } from './seo';

export const SITE_NAME = 'NhadatDN';
export const SITE_LEGAL_NAME = 'NhadatDN - Nhà đất Đà Nẵng';
export const SITE_CONTACT_EMAIL = 'cus@nhadatdn.net';
export const SITE_CONTACT_PHONE = '+84789021022';

/**
 * Một thực thể Organization duy nhất cho toàn site, được tham chiếu ở mọi nơi bằng `@id`.
 * Đây là tín hiệu "entity presence" quan trọng nhất cho cả Google lẫn các công cụ trả lời
 * bằng AI: thay vì lặp lại một Organization ẩn danh trong từng trang, mọi schema đều trỏ
 * về cùng một `@id`, nên máy gộp được thành một thực thể thống nhất.
 */
export function organizationId(): string {
  return `${getSiteUrl()}/#organization`;
}

export function webSiteId(): string {
  return `${getSiteUrl()}/#website`;
}

/** Tham chiếu gọn tới Organization, dùng cho `publisher` / `provider` / `seller`. */
export function organizationRef(): { '@id': string } {
  return { '@id': organizationId() };
}

export function buildOrganizationSchema(): Record<string, unknown> {
  const siteUrl = getSiteUrl();
  return {
    '@type': 'Organization',
    '@id': organizationId(),
    name: SITE_NAME,
    legalName: SITE_LEGAL_NAME,
    url: siteUrl,
    description:
      'Nền tảng đăng tin và tìm kiếm nhà đất tại Đà Nẵng: mua bán, cho thuê nhà phố, đất nền, căn hộ theo từng phường/xã.',
    logo: {
      '@type': 'ImageObject',
      '@id': `${siteUrl}/#logo`,
      url: toAbsoluteUrl('/logo-nhadatdn.svg'),
      contentUrl: toAbsoluteUrl('/logo-nhadatdn.svg'),
      caption: SITE_NAME,
    },
    image: { '@id': `${siteUrl}/#logo` },
    areaServed: {
      '@type': 'City',
      name: 'Đà Nẵng',
      alternateName: 'Da Nang',
      addressCountry: 'VN',
    },
    knowsLanguage: 'vi-VN',
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        telephone: SITE_CONTACT_PHONE,
        email: SITE_CONTACT_EMAIL,
        areaServed: 'VN',
        availableLanguage: ['vi'],
      },
    ],
  };
}

export function buildWebSiteSchema(): Record<string, unknown> {
  const siteUrl = getSiteUrl();
  return {
    '@type': 'WebSite',
    '@id': webSiteId(),
    name: SITE_NAME,
    url: siteUrl,
    inLanguage: 'vi-VN',
    publisher: organizationRef(),
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/mua-ban-nha-dat?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Đồ thị thực thể gốc, phát đúng một lần ở root layout. */
export function buildSiteEntityGraph(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [buildOrganizationSchema(), buildWebSiteSchema()],
  }).replace(/</g, '\u003c');
}
