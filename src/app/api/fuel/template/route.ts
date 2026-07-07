/**
 * GET /api/fuel/template -- Download the fuel import template (.xlsx).
 *
 * Returns an Excel file with column headers, example rows, and notes
 * explaining how to fill in each column.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { buildTemplate, type FuelColumn } from '@/lib/data-io/xlsx';
import { FUEL_TYPES } from '@/controller/fuel/types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const FUEL_TEMPLATE_COLUMNS: FuelColumn[] = [
  { header: 'Asset', field: 'asset', required: true, example: 'Truck 12' },
  { header: 'Driver', field: 'driver', example: 'John Smith' },
  { header: 'Date', field: 'date', required: true, example: '2024-06-15' },
  { header: 'Time', field: 'time', example: '08:30', importOnly: true },
  { header: 'Volume', field: 'volume', required: true, example: '45.5' },
  { header: 'Unit Cost', field: 'unitCost', example: '3.50' },
  { header: 'Total Cost', field: 'totalCost', required: true, example: '159.25' },
  { header: 'Fuel Type', field: 'fuelType', enum: FUEL_TYPES, example: 'diesel' },
  { header: 'Start Mileage', field: 'startMileage', example: '50000' },
  { header: 'End Mileage', field: 'endMileage', example: '50350' },
  { header: 'Station', field: 'station', example: 'Shell Main St' },
  { header: 'Notes', field: 'notes', example: 'Regular fill-up' },
];

const FUEL_TEMPLATE_NOTES = [
  'Asset must match an existing asset by name, asset number, or registration.',
  'Driver is optional. Must match an existing driver by full name.',
  'Total Cost is required unless Unit Cost is provided (Total = Unit Cost x Volume).',
  'Time is optional. If provided, it will be merged into the Date (format: HH:MM).',
  'Volume unit defaults to gallons. Currency defaults to USD. Odometer unit defaults to miles.',
];

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const buffer = buildTemplate('Fuel Transactions', FUEL_TEMPLATE_COLUMNS, FUEL_TEMPLATE_NOTES);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': 'attachment; filename="fuel-template.xlsx"',
      },
    });
  } catch (err) {
    console.error('Fuel template error:', err);
    return NextResponse.json({ data: null, error: 'Failed to generate template' }, { status: 500 });
  }
}
