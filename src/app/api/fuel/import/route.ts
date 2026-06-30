/**
 * POST /api/fuel/import -- Import fuel transactions from CSV/XLS/XLSX file upload
 *
 * Accepts multipart/form-data with a "file" field.
 * Parses the file server-side with xlsx, normalizes headers,
 * resolves asset names → asset IDs, and inserts valid rows.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getFuelTransactionsCollection, getAssetsCollection, getDriversCollection } from '@/lib/mongodb';
import { calculateFuelMetrics } from '@/controller/fuel/utils';
import { FUEL_TYPES } from '@/controller/fuel/types';

const ALLOWED_MIME_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
];

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

/** Normalise a header string for matching: trim, lowercase, collapse whitespace. */
function normalizeHeader(h: unknown): string {
  return String(h ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Known header aliases → our field names.
 * Order matters: first match wins.
 */
const HEADER_MAP: Record<string, string> = {
  // asset
  asset: 'asset',
  assetname: 'asset',
  vehicle: 'asset',
  vehiclename: 'asset',
  unit: 'asset',

  // driver
  driver: 'driver',
  drivername: 'driver',
  operator: 'driver',

  // date
  date: 'date',
  transactiondate: 'date',
  fueldate: 'date',
  filldate: 'date',

  // volume
  volume: 'volume',
  gallons: 'volume',
  litres: 'volume',
  liters: 'volume',
  quantity: 'volume',
  qty: 'volume',

  // unit cost
  unitcost: 'unitCost',
  pricepergallon: 'unitCost',
  priceperlitre: 'unitCost',
  costperunit: 'unitCost',
  ppg: 'unitCost',
  unitprice: 'unitCost',
  price: 'unitCost',

  // total cost
  totalcost: 'totalCost',
  total: 'totalCost',
  amount: 'totalCost',
  cost: 'totalCost',

  // fuel type
  fueltype: 'fuelType',
  fuel: 'fuelType',
  type: 'fuelType',

  // mileage
  startmileage: 'startMileage',
  startodometer: 'startMileage',
  odometerstart: 'startMileage',

  endmileage: 'endMileage',
  endodometer: 'endMileage',
  odometerend: 'endMileage',
  odometer: 'endMileage',
  mileage: 'endMileage',

  // station
  station: 'station',
  location: 'station',
  fuelstation: 'station',
  vendor: 'station',

  // notes
  notes: 'notes',
  note: 'notes',
  comments: 'notes',
  comment: 'notes',

  // time
  time: 'time',
  transactiontime: 'time',
  filltime: 'time',

  // volume unit
  volumeunit: 'volumeUnit',
  uom: 'volumeUnit',

  // currency
  currency: 'currency',
  currencycode: 'currency',
  cur: 'currency',

  // odometer unit
  odometerunit: 'odometerUnit',
  mileageunit: 'odometerUnit',
  distanceunit: 'odometerUnit',
};

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ data: null, error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const fileName = file.name || '';
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { data: null, error: `Invalid file type. Accepted formats: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 },
      );
    }

    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type) && file.type !== 'application/octet-stream') {
      return NextResponse.json(
        { data: null, error: `Invalid file type. Accepted formats: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 },
      );
    }

    // Parse file with xlsx
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
    }) as unknown[][];

    if (!rawData || rawData.length < 2) {
      return NextResponse.json(
        { data: null, error: 'File is empty or has no data rows (needs a header row + at least 1 data row)' },
        { status: 400 },
      );
    }

    // Normalise headers and map to our field names
    const headerRow = rawData[0];
    const columnMap: { index: number; field: string }[] = [];

    for (let i = 0; i < headerRow.length; i++) {
      const normalised = normalizeHeader(headerRow[i]);
      if (!normalised) continue;
      const mapped = HEADER_MAP[normalised];
      if (mapped) {
        columnMap.push({ index: i, field: mapped });
      }
    }

    if (columnMap.length === 0) {
      return NextResponse.json(
        { data: null, error: 'Could not recognise any column headers. Expected columns like: Asset, Date, Volume, Total Cost, Fuel Type, Station, etc.' },
        { status: 400 },
      );
    }

    // Build lookup maps for resolving asset/driver names → ObjectIds
    const tenantOid = ObjectId.createFromHexString(user.currentTenantId);
    const [assetsCol, driversCol] = await Promise.all([getAssetsCollection(), getDriversCollection()]);

    const allAssets = await assetsCol
      .find({ tenantId: tenantOid, isArchived: { $ne: true } }, { projection: { name: 1, assetName: 1, assetNumber: 1, make: 1, model: 1, year: 1 } })
      .toArray();

    const allDrivers = await driversCol
      .find({ tenantId: tenantOid, isArchived: { $ne: true } }, { projection: { firstName: 1, lastName: 1 } })
      .toArray();

    // Build name→id maps (case-insensitive)
    const assetNameMap = new Map<string, string>();
    for (const a of allAssets) {
      const names = [
        a.name,
        a.assetName,
        a.assetNumber,
        `${a.year || ''} ${a.make || ''} ${a.model || ''}`.trim(),
      ].filter(Boolean);
      for (const n of names) {
        assetNameMap.set(String(n).toLowerCase().trim(), a._id.toString());
      }
      // Also allow matching by raw ObjectId string
      assetNameMap.set(a._id.toString().toLowerCase(), a._id.toString());
    }

    const driverNameMap = new Map<string, string>();
    for (const d of allDrivers) {
      const full = `${d.firstName || ''} ${d.lastName || ''}`.trim();
      if (full) driverNameMap.set(full.toLowerCase(), d._id.toString());
      driverNameMap.set(d._id.toString().toLowerCase(), d._id.toString());
    }

    // Process data rows
    const dataRows = rawData.slice(1).filter((row) => row.some((cell) => cell !== ''));
    if (dataRows.length === 0) {
      return NextResponse.json(
        { data: null, error: 'No data rows found in file' },
        { status: 400 },
      );
    }

    if (dataRows.length > 500) {
      return NextResponse.json(
        { data: null, error: 'Maximum 500 rows per import' },
        { status: 400 },
      );
    }

    const collection = await getFuelTransactionsCollection();
    const now = new Date();
    const userOid = ObjectId.createFromHexString(user.id);
    const importBatchId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const results = {
      success: 0,
      failed: 0,
      total: dataRows.length,
      errors: [] as { row: number; error: string }[],
    };

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2; // 1-indexed, +1 for header

      // Extract values by mapped columns
      const getValue = (field: string): unknown => {
        const col = columnMap.find((c) => c.field === field);
        return col ? row[col.index] : undefined;
      };

      const getStr = (field: string): string => {
        const v = getValue(field);
        return v != null && v !== '' ? String(v).trim() : '';
      };

      const getNum = (field: string): number | undefined => {
        const v = getValue(field);
        if (v == null || v === '') return undefined;
        const n = Number(v);
        return isNaN(n) ? undefined : n;
      };

      // Resolve asset
      const assetRaw = getStr('asset');
      const assetId = assetRaw ? assetNameMap.get(assetRaw.toLowerCase()) : undefined;
      if (!assetId) {
        results.failed++;
        results.errors.push({ row: rowNum, error: assetRaw ? `Asset "${assetRaw}" not found` : 'Asset is required' });
        continue;
      }

      // Resolve driver (optional)
      const driverRaw = getStr('driver');
      const driverId = driverRaw ? driverNameMap.get(driverRaw.toLowerCase()) : undefined;

      // Date
      const dateRaw = getValue('date');
      let parsedDate: Date | null = null;
      if (dateRaw instanceof Date) {
        parsedDate = dateRaw;
      } else if (dateRaw) {
        parsedDate = new Date(String(dateRaw));
      }
      if (!parsedDate || isNaN(parsedDate.getTime())) {
        results.failed++;
        results.errors.push({ row: rowNum, error: dateRaw ? `Invalid date "${String(dateRaw)}"` : 'Date is required' });
        continue;
      }

      // Merge time into date if provided (e.g. "08:30", "14:15")
      const timeRaw = getStr('time');
      if (timeRaw && parsedDate) {
        const timeParts = timeRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (timeParts) {
          parsedDate.setHours(Number(timeParts[1]), Number(timeParts[2]), Number(timeParts[3] || 0));
        }
      }

      // Volume
      const volume = getNum('volume');
      if (!volume || volume <= 0) {
        results.failed++;
        results.errors.push({ row: rowNum, error: 'Volume is required and must be > 0' });
        continue;
      }

      // Cost
      const totalCost = getNum('totalCost');
      const unitCost = getNum('unitCost');

      // If totalCost missing but unitCost exists, calculate it
      const resolvedTotalCost = totalCost ?? (unitCost != null ? unitCost * volume : undefined);
      if (resolvedTotalCost == null || resolvedTotalCost < 0) {
        results.failed++;
        results.errors.push({ row: rowNum, error: 'Total cost (or unit cost) is required' });
        continue;
      }

      // Fuel type
      const fuelTypeRaw = getStr('fuelType').toLowerCase();
      const fuelType = fuelTypeRaw && (FUEL_TYPES as readonly string[]).includes(fuelTypeRaw) ? fuelTypeRaw : 'diesel';

      // Mileage
      const startMileage = getNum('startMileage');
      const endMileage = getNum('endMileage');

      const metrics = calculateFuelMetrics({
        startMileage,
        endMileage,
        volume,
        totalCost: resolvedTotalCost,
      });

      // Build document
      const doc = {
        tenantId: tenantOid,
        assetId: ObjectId.createFromHexString(assetId),
        driverId: driverId ? ObjectId.createFromHexString(driverId) : undefined,
        date: parsedDate,
        startMileage: startMileage ?? undefined,
        endMileage: endMileage ?? undefined,
        distance: metrics.distance,
        volume,
        unitCost: unitCost ?? (resolvedTotalCost / volume),
        totalCost: resolvedTotalCost,
        fuelType,
        economy: metrics.economy,
        costPerMile: metrics.costPerMile,
        volumeUnit: getStr('volumeUnit') || 'gallons',
        currency: getStr('currency') || 'USD',
        odometerUnit: getStr('odometerUnit') || 'miles',
        station: getStr('station') || undefined,
        notes: getStr('notes') || undefined,
        source: 'manual' as const,
        importBatchId,
        createdBy: userOid,
        updatedBy: userOid,
        createdAt: now,
        updatedAt: now,
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
      };

      try {
        await collection.insertOne(doc);
        results.success++;
      } catch {
        results.failed++;
        results.errors.push({ row: rowNum, error: 'Database insert failed' });
      }
    }

    const message = results.failed > 0
      ? `Import completed. ${results.success} imported, ${results.failed} failed.`
      : `Successfully imported ${results.success} fuel transaction(s).`;

    return NextResponse.json({
      data: { message, importBatchId, ...results },
      error: null,
    }, { status: results.failed > 0 ? 207 : 201 });
  } catch (err) {
    console.error('Fuel import error:', err);
    return NextResponse.json({ data: null, error: 'Failed to process file' }, { status: 400 });
  }
}
