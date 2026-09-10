import { formatListingPrice, formatPricePerM2 } from './listing-presenter';
import type { ListingItem } from './types';

export type CategoryFact = { question: string; answer: string };

function median(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid];
  if (hi === undefined) return null;
  if (sorted.length % 2 !== 0) return hi;
  const lo = sorted[mid - 1];
  return lo === undefined ? hi : (lo + hi) / 2;
}

/**
 * Sinh vài câu hỏi–trả lời ngắn từ CHÍNH dữ liệu tin đăng đang hiển thị.
 *
 * Mục tiêu là "đoạn văn dễ trích dẫn": máy trả lời bằng AI thích trích nguyên một
 * đoạn ngắn, tự chứa, có số liệu và có phạm vi rõ ràng. Vì vậy mọi câu ở đây đều
 * nói rõ số liệu lấy từ đâu — tổng thì lấy từ `total` của API, còn khoảng giá và
 * diện tích chỉ tính trên số tin đang hiển thị ở trang này. Không câu nào được
 * suy diễn hay khái quát ra ngoài phạm vi đó.
 */
export function buildCategoryFacts(
  items: ListingItem[],
  options: { total: number; dealType: string; areaLabel: string; categoryLabel: string },
): CategoryFact[] {
  const { total, dealType, areaLabel, categoryLabel } = options;
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];

  const facts: CategoryFact[] = [];
  const isRent = dealType === 'cho-thue';
  const unit = isRent ? 'cho thuê' : 'rao bán';

  facts.push({
    question: `${areaLabel} hiện có bao nhiêu tin ${unit}?`,
    answer:
      `Tính đến thời điểm tải trang, ${categoryLabel} có ${total.toLocaleString('vi-VN')} tin đang hiển thị công khai. ` +
      `Trang này đang hiện ${list.length} tin mới nhất.`,
  });

  const prices = list.map((i) => Number(i.price)).filter((v) => Number.isFinite(v) && v > 0);
  if (prices.length >= 3) {
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const mid = median(prices);
    facts.push({
      question: `Giá ${unit} ${areaLabel} đang ở mức nào?`,
      answer:
        `Trong ${prices.length} tin có giá ở trang này, mức thấp nhất là ${formatListingPrice(low, dealType)} ` +
        `và cao nhất là ${formatListingPrice(high, dealType)}` +
        (mid ? `, trung vị ${formatListingPrice(mid, dealType)}` : '') + '.',
    });
  }

  const withArea = list.filter((i) => Number(i.area) > 0 && Number(i.price) > 0);
  if (!isRent && withArea.length >= 3) {
    const perM2 = withArea.map((i) => (Number(i.price) * 1000) / Number(i.area));
    const mid = median(perM2);
    const areas = withArea.map((i) => Number(i.area));
    const midArea = median(areas);
    if (mid && midArea) {
      facts.push({
        question: `Giá mỗi m² đang ở mức nào?`,
        answer:
          `Trên ${withArea.length} tin có đủ giá và diện tích ở trang này, giá trung vị khoảng ` +
          `${formatPricePerM2(median(withArea.map((i) => Number(i.price))) ?? 0, midArea)}, ` +
          `với diện tích trung vị ${Math.round(midArea).toLocaleString('vi-VN')} m².`,
      });
    }
  }

  const byWard = new Map<string, number>();
  for (const item of list) {
    const name = String(item.district ?? '').trim();
    if (name) byWard.set(name, (byWard.get(name) ?? 0) + 1);
  }
  // Chi ke khu vuc co tu 2 tin tro len - mot khu vuc dung 1 tin ma goi la "nhieu nhat"
  // thi cau tra loi mat do tin cay.
  const topWards = [...byWard.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (topWards.length >= 2) {
    facts.push({
      question: `Khu vực nào đang có nhiều tin nhất?`,
      answer:
        `Ở trang này, các khu vực có nhiều tin nhất là ` +
        topWards.map(([name, count]) => `${name} (${count} tin)`).join(', ') + '.',
    });
  }

  return facts;
}
