/**
 * Shared fuel-import validation logic used by both the Excel import route
 * (`/api/fuel/import`) and the AI import routes (`/api/fuel/ai-import`,
 * `/api/fuel/import-rows`).
 *
 * Rows are expected as `Record<string, string>[]` keyed by *display* header
 * (e.g. "Asset", "Total Cost"). The HEADER_MAP normalises these to internal
 * field names before validation, so both exact template headers and the wider
 * set of aliases (e.g. "Vehicle", "Amount") work identically.
 */
import { ObjectId } from 'mongodb';
import { getAssetsCollection, getDriversCollection } from '@/lib/mongodb';
import { calculateFuelMetrics } from '@/controller/fuel/utils';
import { FUEL_TYPES } from '@/controller/fuel/types';
import type { RowError } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Header alias map (duplicated from the import route for shared access) ──

/** Normalise a header string: trim, lowercase, strip non-alphanumeric. */
function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const HEADER_MAP: Record<string, string> = {
  asset: 'asset', assetname: 'asset', vehicle: 'asset', vehiclename: 'asset', unit: 'asset',
  driver: 'driver', drivername: 'driver', operator: 'driver',
  date: 'date', transactiondate: 'date', fueldate: 'date', filldate: 'date',
  volume: 'volume', gallons: 'volume', litres: 'volume', liters: 'volume', quantity: 'volume', qty: 'volume',
  unitcost: 'unitCost', pricepergallon: 'unitCost', priceperlitre: 'unitCost', costperunit: 'unitCost',
  ppg: 'unitCost', unitprice: 'unitCost', price: 'unitCost',
  totalcost: 'totalCost', total: 'totalCost', amount: 'totalCost', cost: 'totalCost',
  fueltype: 'fuelType', fuel: 'fuelType', type: 'fuelType',
  startmileage: 'startMileage', startodometer: 'startMileage', odometerstart: 'startMileage',
  endmileage: 'endMileage', endodometer: 'endMileage', odometerend: 'endMileage',
  odometer: 'endMileage', mileage: 'endMileage',
  station: 'station', location: 'station', fuelstation: 'station', vendor: 'station',
  notes: 'notes', note: 'notes', comments: 'notes', comment: 'notes',
  time: 'time', transactiontime: 'time', filltime: 'time',
  volumeunit: 'volumeUnit', uom: 'volumeUnit',
  currency: 'currency', currencycode: 'currency', cur: 'currency',
  odometerunit: 'odometerUnit', mileageunit: 'odometerUnit', distanceunit: 'odometerUnit',
};

// ── Lookup map builders ──

/** Build a case-insensitive asset name→ObjectId map for the tenant. */
export async function buildAssetLookup(tenantOid: ObjectId): Promise<Map<string, string>> {
  const col = await getAssetsCollection();
  const all = await col
    .find(
      { tenantId: tenantOid, isArchived: { $ne: true } },
      { projection: { name: 1, assetName: 1, assetNumber: 1, make: 1, model: 1, year: 1 } },
    )
    .toArray();

  const map = new Map<string, string>();
  for (const a of all) {
    const names = [
      a.name,
      a.assetName,
      a.assetNumber,
      `${a.year || ''} ${a.make || ''} ${a.model || ''}`.trim(),
    ].filter(Boolean);
    for (const n of names) map.set(String(n).toLowerCase().trim(), a._id.toString());
    map.set(a._id.toString().toLowerCase(), a._id.toString());
  }
  return map;
}

/** Build a case-insensitive driver fullname→ObjectId map for the tenant. */
export async function buildDriverLookup(tenantOid: ObjectId): Promise<Map<string, string>> {
  const col = await getDriversCollection();
  const all = await col
    .find(
      { tenantId: tenantOid, isArchived: { $ne: true } },
      { projection: { firstName: 1, lastName: 1 } },
    )
    .toArray();

  const map = new Map<string, string>();
  for (const d of all) {
    const full = `${d.firstName || ''} ${d.lastName || ''}`.trim();
    if (full) map.set(full.toLowerCase(), d._id.toString());
    map.set(d._id.toString().toLowerCase(), d._id.toString());
  }
  return map;
}

// ── Row validation ──

/** A row that passed validation and is ready for insertion. */
export interface ReadyRow {
  row: number;
  doc: Record<string, any>;
}

/**
 * Validate header-keyed fuel rows. Each row is `{ "Asset": "...", "Date": "...", ... }`.
 *
 * Returns ready-to-insert documents and per-row validation errors. Nothing is
 * inserted — callers decide what to do with the result.
 *
 * Row numbers in errors are 1-indexed, starting at 2 (row 1 = header).
 */
export function validateFuelRows(
  rows: Record<string, string>[],
  assetNameMap: Map<string, string>,
  driverNameMap: Map<string, string>,
  tenantOid: ObjectId,
  userOid: ObjectId,
  importBatchId: string,
): { ready: ReadyRow[]; errors: RowError[] } {
  const ready: ReadyRow[] = [];
  const errors: RowError[] = [];
  const now = new Date();

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNum = i + 2; // 1-indexed; row 1 = header
    const rowErrors: string[] = [];

    // Map display headers → internal field names
    const fields: Record<string, string> = {};
    for (const [header, value] of Object.entries(raw)) {
      const key = HEADER_MAP[norm(header)];
      if (key && value != null) {
        fields[key] = String(value).trim();
      }
    }

    const getStr = (f: string): string => fields[f] || '';
    // Money/number columns arrive as "$45.00", "NZ$1,234.56", "40 L" — strip
    // currency symbols, thousands separators, and unit suffixes before
    // parsing. Number("$45") is NaN, and a NaN total used to be silently
    // replaced by unitCost × volume (importing the wrong amount).
    const getNum = (f: string): number | undefined => {
      const v = fields[f];
      if (!v) return undefined;
      const cleaned = v.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
      if (!cleaned || cleaned === '-' || cleaned === '.') return undefined;
      const n = Number(cleaned);
      return isNaN(n) ? undefined : n;
    };

    // ── Required: Asset ──
    const assetRaw = getStr('asset');
    const assetId = assetRaw ? assetNameMap.get(assetRaw.toLowerCase()) : undefined;
    if (!assetId) {
      rowErrors.push(assetRaw ? `Asset "${assetRaw}" not found` : 'Asset is required');
    }

    // ── Optional: Driver ──
    const driverRaw = getStr('driver');
    const driverId = driverRaw ? driverNameMap.get(driverRaw.toLowerCase()) : undefined;
    if (driverRaw && !driverId) {
      rowErrors.push(`Driver "${driverRaw}" not found`);
    }

    // ── Required: Date ──
    // Slash/dash-separated dates are read DAY-FIRST (NZ convention): a fuel
    // card's "05/06/2026" is 5 June, not May 6 — new Date() would read it
    // US-style and shift transactions by months. ISO (yyyy-mm-dd) and other
    // formats still parse natively.
    const dateRaw = getStr('date');
    let parsedDate: Date | null = null;
    if (dateRaw) {
      const dayFirst = dateRaw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (dayFirst) {
        const day = Number(dayFirst[1]);
        const month = Number(dayFirst[2]);
        let year = Number(dayFirst[3]);
        if (year < 100) year += 2000;
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          parsedDate = new Date(year, month - 1, day);
        }
      } else {
        parsedDate = new Date(dateRaw);
      }
    }
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      rowErrors.push(dateRaw ? `Invalid date "${dateRaw}"` : 'Date is required');
    }

    // Merge time into date if provided (e.g. "08:30", "14:15")
    const timeRaw = getStr('time');
    if (timeRaw && parsedDate && !isNaN(parsedDate.getTime())) {
      const timeParts = timeRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (timeParts) {
        parsedDate.setHours(Number(timeParts[1]), Number(timeParts[2]), Number(timeParts[3] || 0));
      }
    }

    // ── Required: Volume ──
    const volume = getNum('volume');
    if (!volume || volume <= 0) {
      rowErrors.push('Volume is required and must be > 0');
    }

    // ── Required: Cost ──
    // A PRESENT-but-unreadable total errors the row — silently substituting
    // unitCost × volume would import a different amount than the statement.
    const totalCostRaw = getStr('totalCost');
    const totalCost = getNum('totalCost');
    const unitCost = getNum('unitCost');
    if (totalCostRaw && totalCost == null) {
      rowErrors.push(`Unreadable total cost "${totalCostRaw}"`);
    }
    const resolvedTotalCost = totalCost ?? (unitCost != null && volume ? unitCost * volume : undefined);
    if (resolvedTotalCost == null || resolvedTotalCost < 0) {
      rowErrors.push('Total cost (or unit cost) is required');
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, errors: rowErrors });
      continue;
    }

    // ── Optional fields ──
    const fuelTypeRaw = getStr('fuelType').toLowerCase();
    const fuelType =
      fuelTypeRaw && (FUEL_TYPES as readonly string[]).includes(fuelTypeRaw) ? fuelTypeRaw : 'diesel';

    const startMileage = getNum('startMileage');
    const endMileage = getNum('endMileage');

    const metrics = calculateFuelMetrics({
      startMileage,
      endMileage,
      volume: volume!,
      totalCost: resolvedTotalCost!,
    });

    const doc = {
      tenantId: tenantOid,
      assetId: ObjectId.createFromHexString(assetId!),
      driverId: driverId ? ObjectId.createFromHexString(driverId) : undefined,
      date: parsedDate!,
      startMileage: startMileage ?? undefined,
      endMileage: endMileage ?? undefined,
      distance: metrics.distance,
      volume: volume!,
      // Derived from the paid total so the stored triple never contradicts
      // (4dp — same rule as manual entry).
      unitCost: Math.round((resolvedTotalCost! / volume!) * 10000) / 10000,
      totalCost: resolvedTotalCost!,
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

    ready.push({ row: rowNum, doc });
  }

  return { ready, errors };
}
