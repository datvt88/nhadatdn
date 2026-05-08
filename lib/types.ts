export interface ListingImageItem {
  url: string;
  webpUrl?: string | null;
  sortOrder?: number;
}

export interface ListingItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  dealType?: string;
  DealType?: string;
  houseDirection?: string;
  HouseDirection?: string;
  price: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  address?: string;
  lat: number;
  lng: number;
  city?: string;
  district?: string;
  coverImage?: string | null;
  images?: ListingImageItem[];
  packageType?: 'VIP' | 'NORMAL';
  status?: string;
  created_at?: string;
}

export interface SearchResponse {
  took: number;
  total: number;
  nextCursor?: string;
  items: ListingItem[];
}


