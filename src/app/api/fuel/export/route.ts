/**
 * GET /api/fuel/export?format=xlsx|csv -- Export all fuel transactions.
 *
 * Resolves asset/driver names and outputs a downloadable spreadsheet
 * with transaction data including computed fields (distance, economy, cost/mile).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getFuelTransactionsCollection, getAssetsCollection, getDriversCollection } from '@/lib/mongodb';
import { buildExport, type FuelColumn } from '@/lib/data-io/xlsx';

const MIME: Record<'xlsx' | 'csv', string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};

const FUEL_EXPORT_COLUMNS: FuelColumn[] = [
  { header: 'Asset', field: 'assetName' },
  { header: 'Driver', field: 'driverName' },
  { header: 'Date', field: 'date' },
  { header: 'Volume', field: 'volume' },
  { header: 'Unit Cost', field: 'unitCost' },
  { header: 'Total Cost', field: 'totalCost' },
  { header: 'Fuel Type', field: 'fuelType' },
  { header: 'Start Odometer (km)', field: 'startMileage' },
  { header: 'End Odometer (km)', field: 'endMileage' },
  { header: 'Distance', field: 'distance' },
  { header: 'Economy (km/L)', field: 'economy' },
  { header: 'Cost/km', field: 'costPerMile' },
  { header: 'Station', field: 'station' },
  { header: 'Notes', field: 'notes' },
];

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const format = request.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';
    const tenantOid = ObjectId.createFromHexString(user.currentTenantId);

    const collection = await getFuelTransactionsCollection();
    const docs = await collection
      .find({ tenantId: tenantOid, isArchived: { $ne: true } })
      .sort({ date: -1 })
      .limit(10000)
      .toArray();

    // Resolve asset & driver names
    const assetIds = [...new Set(docs.map((d) => d.assetId?.toString()).filter(Boolean))];
    const driverIds = [...new Set(docs.map((d) => d.driverId?.toString()).filter(Boolean))];

    const [assetsCol, driversCol] = await Promise.all([getAssetsCollection(), getDriversCollection()]);
    const [assets, drivers] = await Promise.all([
      assetIds.length > 0
        ? assetsCol
            .find({ _id: { $in: assetIds.map((id) => ObjectId.createFromHexString(id)) } })
            .toArray()
        : [],
      driverIds.length > 0
        ? driversCol
            .find({ _id: { $in: driverIds.map((id) => ObjectId.createFromHexString(id)) } })
            .toArray()
        : [],
    ]);

    const assetMap = new Map(
      assets.map((a) => [
        a._id.toString(),
        a.name || a.assetName || `${a.year || ''} ${a.make || ''} ${a.model || ''}`.trim(),
      ]),
    );
    const driverMap = new Map(
      drivers.map((d) => [
        d._id.toString(),
        `${d.firstName || ''} ${d.lastName || ''}`.trim(),
      ]),
    );

    const rows = docs.map((doc) => ({
      assetName: assetMap.get(doc.assetId?.toString()) || '',
      driverName: driverMap.get(doc.driverId?.toString()) || '',
      date: doc.date ? new Date(doc.date as Date).toISOString().split('T')[0] : '',
      volume: doc.volume ?? '',
      unitCost: doc.unitCost ?? '',
      totalCost: doc.totalCost ?? '',
      fuelType: doc.fuelType || '',
      startMileage: doc.startMileage ?? '',
      endMileage: doc.endMileage ?? '',
      distance: doc.distance ?? '',
      economy: doc.economy ?? '',
      costPerMile: doc.costPerMile ?? '',
      station: doc.station || '',
      notes: doc.notes || '',
    }));

    const buffer = buildExport('Fuel Transactions', FUEL_EXPORT_COLUMNS, rows, format);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': MIME[format],
        'Content-Disposition': `attachment; filename="fuel-transactions.${format}"`,
      },
    });
  } catch (err) {
    console.error('Fuel export error:', err);
    return NextResponse.json({ data: null, error: 'Failed to export data' }, { status: 500 });
  }
}
