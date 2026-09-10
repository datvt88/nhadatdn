import { toAbsoluteUrl } from './seo';

export type BreadcrumbStep = { name: string; path: string };

/**
 * BreadcrumbList khớp đúng với dải breadcrumb hiển thị trên trang.
 * Trước đây chỉ trang chi tiết có schema này; các trang danh mục có breadcrumb
 * nhìn thấy được nhưng không khai báo, nên máy không đọc được cấu trúc site.
 */
export function buildBreadcrumbSchema(steps: BreadcrumbStep[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: steps.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: toAbsoluteUrl(step.path),
    })),
  };
}
