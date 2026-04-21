import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: [
      'https://nhadatdn.net/sitemap.xml',
      'https://nhadatdn.net/sitemap-cities.xml',
      'https://nhadatdn.net/sitemap-districts.xml',
      'https://nhadatdn.net/sitemap-listings.xml',
    ],
    host: 'https://nhadatdn.net',
  };
}
