/**
 * GET /api/address/autocomplete — proxies HERE Maps so the API key stays server-side.
 * Tries Geocoding API first (street-level), falls back to Autocomplete.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';

const GEOCODE_API_URL = 'https://geocode.search.hereapi.com/v1/geocode';
const AUTOCOMPLETE_API_URL = 'https://autocomplete.search.hereapi.com/v1/autocomplete';

interface HereAddress {
  label?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryName?: string;
  countryCode?: string;
  district?: string;
  county?: string;
  houseNumber?: string;
}

interface HereItem {
  id?: string;
  title?: string;
  address?: HereAddress;
}

function toSuggestion(item: HereItem) {
  const addr = item.address ?? {};
  const street = [addr.houseNumber, addr.street].filter(Boolean).join(' ').trim();
  const parts = [
    street,
    addr.district,
    addr.city,
    addr.state,
    addr.postalCode,
    addr.countryName,
  ].filter(Boolean);
  const label = addr.label || item.title || '';
  return {
    id: item.id || crypto.randomUUID(),
    title: item.title || label,
    address: street || addr.street || label,
    city: addr.city ?? '',
    state: addr.state ?? '',
    postalCode: addr.postalCode ?? '',
    country: addr.countryName ?? '',
    fullAddress: parts.length ? parts.join(', ') : label,
  };
}

async function hereFetch(url: URL): Promise<HereItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.items ?? []) as HereItem[];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const query = req.nextUrl.searchParams.get('q')?.trim();
    if (!query) return NextResponse.json({ data: [], error: null });

    const apiKey = process.env.HERE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { data: null, error: 'Address service is not configured.' },
        { status: 500 },
      );
    }

    const countryCode = req.nextUrl.searchParams.get('countryCode') ?? undefined;

    // 1) Geocode (street-level accuracy).
    const geo = new URL(GEOCODE_API_URL);
    geo.searchParams.set('q', query);
    geo.searchParams.set('apiKey', apiKey);
    geo.searchParams.set('limit', '8');
    geo.searchParams.set('lang', 'en');
    if (countryCode) geo.searchParams.set('in', `countryCode:${countryCode}`);

    let items = await hereFetch(geo);

    // 2) Fallback to autocomplete if geocode found nothing.
    if (items.length === 0) {
      const auto = new URL(AUTOCOMPLETE_API_URL);
      auto.searchParams.set('q', query);
      auto.searchParams.set('apiKey', apiKey);
      auto.searchParams.set('limit', '8');
      auto.searchParams.set('lang', 'en');
      if (countryCode) auto.searchParams.set('in', `countryCode:${countryCode}`);
      items = await hereFetch(auto);
    }

    const suggestions = items
      .filter((i) => i.address?.label || i.title)
      .map(toSuggestion);

    return NextResponse.json({ data: suggestions, error: null });
  } catch (error) {
    console.error('[ADDRESS_AUTOCOMPLETE]', error);
    return NextResponse.json(
      { data: null, error: 'Could not fetch address suggestions.' },
      { status: 500 },
    );
  }
}
