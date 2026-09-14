import { fetchJsonOr } from '../../lib/api';
import { resolveLocationSegment } from '../../lib/listing-route';
import { getSiteUrl } from '../../lib/seo';

// /llms.txt — chỉ mục cho AI agent (chuẩn đang nổi: llmstxt.org). Giúp answer engine hiểu site làm gì,
// tìm đúng trang danh mục, và biết có endpoint MCP để truy vấn dữ liệu. Làm mới mỗi giờ.
export const revalidate = 3600;

type WardOption = { name: string; slug: string };
type DistrictOption = { name: string; slug: string; sortOrder: number; wards?: WardOption[] };
type DanangCatalog = { citySlug: string; cityName: string; districts: DistrictOption[] };
type SearchResponse = { total?: number };

async function topDistricts(siteUrl: string): Promise<string[]> {
  const catalog = await fetchJsonOr<DanangCatalog>(
    '/locations/danang',
    { citySlug: 'da-nang', cityName: 'Đà Nẵng', districts: [] },
    { next: { revalidate } },
  );
  const districts = Array.isArray(catalog.districts) ? catalog.districts.slice(0, 20) : [];
  return districts.map((d) => {
    const seg = resolveLocationSegment(d.name);
    return `- [Nhà đất ${d.name}](${siteUrl}/mua-ban-nha-dat/${seg}): tin mua bán nhà đất khu vực ${d.name}, Đà Nẵng.`;
  });
}

export async function GET(): Promise<Response> {
  const siteUrl = getSiteUrl();

  const totals = await fetchJsonOr<SearchResponse>(
    '/search?city=da-nang&pageSize=1',
    { total: 0 },
    { next: { revalidate } },
  );
  const totalNote =
    typeof totals.total === 'number' && totals.total > 0
      ? `Hiện có khoảng ${totals.total} tin đang hiển thị.`
      : '';

  const districtLines = await topDistricts(siteUrl);

  const body = `# NhadatDN — Nhà đất Đà Nẵng

> Nền tảng tin mua bán và cho thuê nhà đất tại Đà Nẵng, Việt Nam. Dữ liệu cập nhật realtime theo phường/xã (đơn vị hành chính Đà Nẵng mới), giá, diện tích và loại hình. ${totalNote}

## Danh mục chính
- [Mua bán nhà đất Đà Nẵng](${siteUrl}/mua-ban-nha-dat): tin rao bán nhà phố, đất nền, căn hộ, biệt thự.
- [Cho thuê nhà đất Đà Nẵng](${siteUrl}/cho-thue-nha-dat): tin cho thuê (giá theo tháng).
- [Đăng tin nhà đất](${siteUrl}/dang-tin-nha-dat): dành cho người đăng.

## Khu vực nổi bật
${districtLines.join('\n')}

## Truy vấn có cấu trúc cho agent (MCP)
- Endpoint MCP (read-only): https://mcp.nhadatdn.net/
- Tool: search_listings, get_listing, list_locations, get_seller, market_stats.
- Giá luôn trả bằng VND tuyệt đối (priceVnd); mỗi tin có URL canonical để trích dẫn.

## Quy ước dữ liệu
- Giá tin bán tính theo tỷ VND; tin thuê theo triệu VND/tháng.
- Loại giao dịch: mua-ban (bán), cho-thue (thuê).
- Khu vực: Đà Nẵng sau sáp nhập, bao gồm cả phía nam Quảng Nam cũ (Hội An, Tam Kỳ, Núi Thành...).

## Tài nguyên khác
- [Sitemap](${siteUrl}/sitemap.xml)
- Liên hệ: cus@nhadatdn.net
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
