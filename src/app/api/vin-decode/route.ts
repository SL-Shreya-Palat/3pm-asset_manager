/**
 * GET /api/vin-decode?vin=XXXXX — Look up a NZ vehicle via the CarJam API.
 *
 * `vin` is the search term and accepts a registration PLATE, a VIN, or a
 * chassis/frame number (CarJam's `plate` parameter resolves all three). This
 * replaces the old NHTSA VPIC decode, which only handled 17-char US VINs and
 * returned nothing useful for NZ vehicles / Japanese imports.
 *
 * SECURITY: the API key comes ONLY from env (CARJAM_API_KEY). If it's missing
 * we fail loudly rather than shipping a key — same policy as the IoT Hub client.
 *
 * Response shape is kept identical to the previous NHTSA route so existing
 * callers (the new-asset pre-fill dialog + the in-form "decode" button) keep
 * working unchanged; `color` and `licensePlate` are additive bonus fields.
 */
import { NextRequest, NextResponse } from 'next/server';

const MIN_QUERY_LENGTH = 2;

/**
 * Local-only mock so the auto-fill flow can be exercised WITHOUT a real CarJam
 * key. Enabled by CARJAM_MOCK=1 (off by default). Returns the verified sample
 * vehicle from CarJam's own docs (plate KTY257) for any query, with the
 * license plate echoed back. Delete/disable once a real key is configured.
 */
function mockVehicle(query: string) {
  return {
    vin: 'JM0KF4WLA00115724',
    make: 'MAZDA',
    model: 'CX-5',
    year: '2017',
    vehicleType: 'Passenger car/van',
    bodyClass: 'Station wagon',
    fuelType: 'Petrol',
    color: 'Silver',
    licensePlate: query,
    isChassisNumber: false,
  };
}

/** CarJam vehicle_type / fuel_type come back as opaque codes ("07", "01") when
 * un-translated. Only treat a value as usable if it reads like real text. */
function isReadable(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 1 && !/^\d+$/.test(v.trim());
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

/**
 * CarJam returns a mostly-flat object, but the envelope isn't contractually
 * documented, so we search recursively for the object that actually carries the
 * vehicle fields (`make`/`model`/`vin`). Mirrors the tolerant parsing used by
 * the IoT Hub client.
 */
function findVehicle(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== 'object' || depth > 4) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findVehicle(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (
    typeof obj.make === 'string' ||
    typeof obj.model === 'string' ||
    typeof obj.vin === 'string' ||
    typeof obj.year_of_manufacture !== 'undefined'
  ) {
    return obj;
  }
  for (const value of Object.values(obj)) {
    const found = findVehicle(value, depth + 1);
    if (found) return found;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('vin')?.trim().toUpperCase();

  if (!query || query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      { data: null, error: `Plate / VIN / chassis must be at least ${MIN_QUERY_LENGTH} characters` },
      { status: 400 },
    );
  }

  // Local mock — return canned data so the flow works with no key configured.
  if (process.env.CARJAM_MOCK === '1' || process.env.CARJAM_MOCK === 'true') {
    return NextResponse.json({ data: mockVehicle(query), error: null });
  }

  const apiKey = process.env.CARJAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { data: null, error: 'CarJam is not configured — set CARJAM_API_KEY.' },
      { status: 500 },
    );
  }

  const baseUrl = process.env.CARJAM_API_BASE_URL || 'https://www.carjam.co.nz';
  const url =
    `${baseUrl}/api/car/?key=${encodeURIComponent(apiKey)}` +
    `&plate=${encodeURIComponent(query)}&basic=1&translate=1&f=json`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h to save credits

    if (!res.ok) {
      return NextResponse.json(
        { data: null, error: 'Failed to look up vehicle' },
        { status: 502 },
      );
    }

    const json = await res.json().catch(() => null);
    const vehicle = findVehicle(json);

    if (!vehicle) {
      return NextResponse.json(
        { data: null, error: 'No vehicle found for that plate / VIN' },
        { status: 404 },
      );
    }

    const data = {
      // Keys kept identical to the previous NHTSA contract:
      vin: str(vehicle.vin),
      make: str(vehicle.make),
      model: str(vehicle.model),
      year: str(vehicle.year_of_manufacture),
      // Only map the vehicle type when it's readable text, so we never create an
      // asset type literally named "07" from an un-translated code.
      vehicleType: isReadable(vehicle.vehicle_type) ? str(vehicle.vehicle_type) : '',
      bodyClass: str(vehicle.body_style),
      fuelType: isReadable(vehicle.fuel_type) ? str(vehicle.fuel_type) : '',
      // Additive bonus fields (CarJam is plate-first, so we usually get both):
      color: str(vehicle.main_colour),
      licensePlate: str(vehicle.plate) || query,
      isChassisNumber: false,
    };

    if (!data.make && !data.model && !data.vin) {
      return NextResponse.json(
        { data: null, error: 'No vehicle found for that plate / VIN' },
        { status: 404 },
      );
    }

    return NextResponse.json({ data, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: 'Failed to connect to the CarJam service' },
      { status: 502 },
    );
  }
}
