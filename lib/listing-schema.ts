import { organizationRef } from './site-schema';

/**
 * Giá lưu trong DB theo quy ước nội bộ:
 *   - tin bán   : đơn vị "tỷ"        -> nhân 1.000.000.000 ra VND
 *   - tin thuê  : đơn vị "triệu/tháng" -> nhân 1.000.000 ra VND/tháng
 *
 * Trước đây JSON-LD gắn thẳng số thô kèm `priceCurrency: 'VND'`, nên một căn 5,5 tỷ
 * được khai báo với Google là 5,5 đồng. Hàm này lặp đúng logic quy đổi mà backend
 * đã dùng cho feed Google Merchant (`google_merchant_sheet.go`), kể cả chốt chặn
 * `<= 10000` để không nhân hai lần nếu dữ liệu đã ở dạng VND.
 */
export function listingPriceToVnd(price: unknown, dealType?: string): number | null {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value > 10000) return Math.round(value);
  const isRent = String(dealType ?? '').trim().toLowerCase() === 'cho-thue';
  return Math.round(value * (isRent ? 1_000_000 : 1_000_000_000));
}

/**
 * Tin thuê phải nói rõ giá là "mỗi tháng", nếu không máy đọc sẽ hiểu là giá bán đứt.
 */
export function buildOfferSchema(price: unknown, dealType?: string): Record<string, unknown> | null {
  const amount = listingPriceToVnd(price, dealType);
  if (amount === null) return null;

  const isRent = String(dealType ?? '').trim().toLowerCase() === 'cho-thue';
  const base: Record<string, unknown> = {
    '@type': 'Offer',
    priceCurrency: 'VND',
    price: amount,
    availability: 'https://schema.org/InStock',
    seller: organizationRef(),
  };

  if (isRent) {
    base.priceSpecification = {
      '@type': 'UnitPriceSpecification',
      priceCurrency: 'VND',
      price: amount,
      unitCode: 'MON',
      unitText: 'tháng',
    };
    base.businessFunction = 'https://schema.org/LeaseOut';
  } else {
    base.businessFunction = 'https://schema.org/Sell';
  }
  return base;
}

export function buildPostalAddress(
  streetAddress: string,
  ward: string,
  district: string,
): Record<string, unknown> | null {
  const street = String(streetAddress ?? '').trim();
  const wardName = String(ward ?? '').trim();
  const districtName = String(district ?? '').trim();
  if (!street && !wardName && !districtName) return null;
  return {
    '@type': 'PostalAddress',
    ...(street ? { streetAddress: street } : {}),
    ...(wardName || districtName ? { addressLocality: [wardName, districtName].filter(Boolean).join(', ') } : {}),
    addressRegion: 'Đà Nẵng',
    addressCountry: 'VN',
  };
}

export function buildGeoSchema(lat: unknown, lng: unknown): Record<string, unknown> | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { '@type': 'GeoCoordinates', latitude, longitude };
}

export function buildFloorSize(area: unknown): Record<string, unknown> | null {
  const value = Number(area);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { '@type': 'QuantitativeValue', value, unitCode: 'MTK', unitText: 'm²' };
}

/**
 * Các thuộc tính bất động sản mà công cụ trả lời bằng AI hay trích: số phòng ngủ,
 * số phòng tắm, diện tích, toạ độ. Càng nhiều thuộc tính có cấu trúc thì đoạn nội
 * dung càng dễ được trích dẫn nguyên vẹn thay vì bị diễn giải sai.
 */
export function buildListingFacets(listing: {
  area?: unknown;
  bedrooms?: unknown;
  bathrooms?: unknown;
  lat?: unknown;
  lng?: unknown;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const floorSize = buildFloorSize(listing.area);
  if (floorSize) out.floorSize = floorSize;

  const bedrooms = Number(listing.bedrooms);
  if (Number.isFinite(bedrooms) && bedrooms > 0) out.numberOfRooms = bedrooms;

  const bathrooms = Number(listing.bathrooms);
  if (Number.isFinite(bathrooms) && bathrooms > 0) out.numberOfBathroomsTotal = bathrooms;

  const geo = buildGeoSchema(listing.lat, listing.lng);
  if (geo) out.geo = geo;

  return out;
}

/**
 * Tra ve rieng mang PropertyValue de trang goi tu gop voi cac thuoc tinh khac
 * (vi du `sellerVerified`), tranh viec spread de len nhau lam mat du lieu.
 */
export function buildListingPropertyValues(listing: {
  floors?: unknown;
  houseDirection?: unknown;
  frontage?: unknown;
  roadWidth?: unknown;
}): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const push = (name: string, value: unknown, unit?: string) => {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      rows.push({ '@type': 'PropertyValue', name, value: num, ...(unit ? { unitText: unit } : {}) });
    }
  };
  push('Số tầng', listing.floors);
  push('Mặt tiền', listing.frontage, 'm');
  push('Đường trước nhà', listing.roadWidth, 'm');
  const direction = String(listing.houseDirection ?? '').trim();
  if (direction) rows.push({ '@type': 'PropertyValue', name: 'Hướng nhà', value: direction });
  return rows;
}
