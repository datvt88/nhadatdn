import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: 'https://nhadatdn.net/',
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: 'https://nhadatdn.net/mua-ban-nha-dat',
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: 'https://nhadatdn.net/cho-thue-nha-dat',
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: 'https://nhadatdn.net/dang-tin-nha-dat',
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ];
}
