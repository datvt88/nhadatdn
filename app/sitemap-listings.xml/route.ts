import { fetchTextOr } from '../../lib/api';

export const revalidate = 300;

export async function GET() {
  const xml = await fetchTextOr('/sitemap/listings', '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
