import { redirect } from 'next/navigation';

export async function generateStaticParams(): Promise<Array<{ city: string }>> {
  return [{ city: 'da-nang' }];
}

function normalizeLegacyCitySegment(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.startsWith('nha-dat-')) return normalized;
  return `nha-dat-${normalized}`;
}

export default function LegacyMuaBanCityRedirectPage({ params }: { params: { city: string } }) {
  const city = params.city.trim().toLowerCase();
  if (city === 'da-nang' || !city) {
    redirect('/mua-ban-nha-dat');
  }

  const locationSegment = normalizeLegacyCitySegment(city);
  redirect(`/mua-ban-nha-dat/${locationSegment}`);
}
