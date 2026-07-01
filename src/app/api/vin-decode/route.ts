/**
 * GET /api/vin-decode?vin=XXXXX — Decode a VIN using the NHTSA VPIC API
 *
 * Supports:
 * - Standard 17-character VINs (US & international) → full NHTSA decode
 * - Shorter chassis/frame numbers (common in NZ for Japanese imports) → pass-through
 */
import { NextRequest, NextResponse } from 'next/server';

const MIN_VIN_LENGTH = 5;
const STANDARD_VIN_LENGTH = 17;

export async function GET(request: NextRequest) {
  const vin = request.nextUrl.searchParams.get('vin')?.trim().toUpperCase();

  if (!vin || vin.length < MIN_VIN_LENGTH) {
    return NextResponse.json(
      { data: null, error: `VIN / chassis number must be at least ${MIN_VIN_LENGTH} characters` },
      { status: 400 },
    );
  }

  // For shorter chassis/frame numbers (common in NZ), return the VIN as-is
  // since NHTSA only supports standard 17-character VINs.
  if (vin.length !== STANDARD_VIN_LENGTH) {
    return NextResponse.json({
      data: {
        vin,
        make: '',
        model: '',
        year: '',
        vehicleType: '',
        bodyClass: '',
        driveType: '',
        fuelType: '',
        engineCylinders: '',
        engineSize: '',
        transmissionStyle: '',
        manufacturer: '',
        plantCountry: '',
        isChassisNumber: true,
      },
      error: null,
    });
  }

  // Standard 17-character VIN — use NHTSA VPIC API
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vin)}?format=json`,
      { next: { revalidate: 86400 } }, // cache for 24h
    );

    if (!res.ok) {
      return NextResponse.json(
        { data: null, error: 'Failed to decode VIN' },
        { status: 502 },
      );
    }

    const json = await res.json();
    const result = json.Results?.[0];

    if (!result) {
      return NextResponse.json(
        { data: null, error: 'No results found for this VIN' },
        { status: 404 },
      );
    }

    // Check if NHTSA returned an error
    if (result.ErrorCode && result.ErrorCode !== '0') {
      const errorText = result.ErrorText || 'Invalid VIN';
      // ErrorCode "1" means some fields had issues but data may still be partially valid
      // Only treat as full error if no useful data was returned
      if (!result.Make && !result.Model && !result.ModelYear) {
        return NextResponse.json(
          { data: null, error: errorText },
          { status: 400 },
        );
      }
    }

    const data = {
      vin,
      make: result.Make || '',
      model: result.Model || '',
      year: result.ModelYear || '',
      vehicleType: result.VehicleType || '',
      bodyClass: result.BodyClass || '',
      driveType: result.DriveType || '',
      fuelType: result.FuelTypePrimary || '',
      engineCylinders: result.EngineCylinders || '',
      engineSize: result.DisplacementL || '',
      transmissionStyle: result.TransmissionStyle || '',
      manufacturer: result.Manufacturer || '',
      plantCountry: result.PlantCountry || '',
      isChassisNumber: false,
    };

    return NextResponse.json({ data, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: 'Failed to connect to VIN decode service' },
      { status: 502 },
    );
  }
}
