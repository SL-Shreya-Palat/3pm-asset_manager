/**
 * Fuel validation utilities -- custom validators (no Zod).
 */
import { isNonEmptyString, isValidObjectId } from '@/lib/validation/commonValidators';
import { FUEL_TYPES, FUEL_SOURCES } from './types';
import type { CreateFuelTransactionInput } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate fuel transaction creation input. */
export function validateCreateFuelTransactionInput(input: CreateFuelTransactionInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(input.assetId)) {
    errors.assetId = 'Asset is required';
  } else if (!isValidObjectId(input.assetId)) {
    errors.assetId = 'Invalid asset ID';
  }

  if (input.driverId && !isValidObjectId(input.driverId)) {
    errors.driverId = 'Invalid driver ID';
  }

  if (!input.date) {
    errors.date = 'Date is required';
  } else {
    const parsed = new Date(input.date);
    if (isNaN(parsed.getTime())) {
      errors.date = 'Invalid date format';
    }
  }

  if (input.volume === undefined || input.volume === null) {
    errors.volume = 'Volume is required';
  } else if (typeof input.volume !== 'number' || isNaN(input.volume) || input.volume <= 0) {
    errors.volume = 'Volume must be a positive number';
  }

  if (input.totalCost === undefined || input.totalCost === null) {
    errors.totalCost = 'Total cost is required';
  } else if (typeof input.totalCost !== 'number' || isNaN(input.totalCost) || input.totalCost < 0) {
    errors.totalCost = 'Total cost must be a non-negative number';
  }

  if (input.unitCost !== undefined && input.unitCost !== null) {
    if (typeof input.unitCost !== 'number' || isNaN(input.unitCost) || input.unitCost < 0) {
      errors.unitCost = 'Unit cost must be a non-negative number';
    }
  }

  if (input.startMileage !== undefined && input.startMileage !== null) {
    if (typeof input.startMileage !== 'number' || isNaN(input.startMileage) || input.startMileage < 0) {
      errors.startMileage = 'Start odometer must be a non-negative number';
    }
  }

  if (input.endMileage !== undefined && input.endMileage !== null) {
    if (typeof input.endMileage !== 'number' || isNaN(input.endMileage) || input.endMileage < 0) {
      errors.endMileage = 'End odometer must be a non-negative number';
    }
  }

  if (
    input.startMileage != null &&
    input.endMileage != null &&
    typeof input.startMileage === 'number' &&
    typeof input.endMileage === 'number' &&
    input.endMileage < input.startMileage
  ) {
    errors.endMileage = 'End odometer must be greater than start odometer';
  }

  if (input.fuelType && !(FUEL_TYPES as readonly string[]).includes(input.fuelType)) {
    errors.fuelType = `Invalid fuel type. Must be one of: ${FUEL_TYPES.join(', ')}`;
  }

  if (input.source && !(FUEL_SOURCES as readonly string[]).includes(input.source)) {
    errors.source = `Invalid source. Must be one of: ${FUEL_SOURCES.join(', ')}`;
  }

  if (input.station && typeof input.station === 'string' && input.station.trim().length > 200) {
    errors.station = 'Station name must be at most 200 characters';
  }

  if (input.notes && typeof input.notes === 'string' && input.notes.trim().length > 1000) {
    errors.notes = 'Notes must be at most 1000 characters';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validate a PARTIAL fuel update with the same rules as create — the update
 * path must never accept values create would reject (negative costs, string
 * volumes, end < start after the merge, ...). `merged*` are the post-merge
 * odometer values so a one-sided edit can't invert the pair.
 */
export function validateUpdateFuelTransactionInput(
  input: Record<string, unknown>,
  merged: { startMileage?: number | null; endMileage?: number | null },
): ValidationResult {
  const errors: Record<string, string> = {};

  if (input.assetId !== undefined) {
    if (!isNonEmptyString(input.assetId) || !isValidObjectId(input.assetId as string)) {
      errors.assetId = 'Invalid asset ID';
    }
  }
  if (input.driverId !== undefined && input.driverId !== null && input.driverId !== '') {
    if (!isValidObjectId(input.driverId as string)) errors.driverId = 'Invalid driver ID';
  }
  if (input.date !== undefined) {
    const parsed = new Date(input.date as string);
    if (isNaN(parsed.getTime())) errors.date = 'Invalid date format';
  }

  const numericRules: Array<[key: string, label: string, allowZero: boolean]> = [
    ['volume', 'Volume', false],
    ['totalCost', 'Total cost', true],
    ['unitCost', 'Unit cost', true],
    ['startMileage', 'Start odometer', true],
    ['endMileage', 'End odometer', true],
  ];
  for (const [key, label, allowZero] of numericRules) {
    const v = input[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || isNaN(v) || (allowZero ? v < 0 : v <= 0)) {
      errors[key] = `${label} must be a ${allowZero ? 'non-negative' : 'positive'} number`;
    }
  }

  if (
    merged.startMileage != null &&
    merged.endMileage != null &&
    merged.endMileage < merged.startMileage
  ) {
    errors.endMileage = 'End odometer must be greater than start odometer';
  }

  if (input.fuelType && !(FUEL_TYPES as readonly string[]).includes(input.fuelType as string)) {
    errors.fuelType = `Invalid fuel type. Must be one of: ${FUEL_TYPES.join(', ')}`;
  }
  if (input.source && !(FUEL_SOURCES as readonly string[]).includes(input.source as string)) {
    errors.source = `Invalid source. Must be one of: ${FUEL_SOURCES.join(', ')}`;
  }
  if (input.station && typeof input.station === 'string' && input.station.trim().length > 200) {
    errors.station = 'Station name must be at most 200 characters';
  }
  if (input.notes && typeof input.notes === 'string' && input.notes.trim().length > 1000) {
    errors.notes = 'Notes must be at most 1000 characters';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * The stored unit cost is always DERIVED from totalCost / volume (4dp) when
 * both are present — totalCost is what was actually paid, so a record can
 * never carry a self-contradicting unitCost × volume ≠ totalCost triple.
 */
export function deriveUnitCost(volume?: number | null, totalCost?: number | null): number | undefined {
  if (typeof volume !== 'number' || typeof totalCost !== 'number') return undefined;
  if (!(volume > 0) || totalCost < 0) return undefined;
  return Math.round((totalCost / volume) * 10000) / 10000;
}

/** Calculate derived metrics from mileage and volume data. */
export function calculateFuelMetrics(input: {
  startMileage?: number;
  endMileage?: number;
  volume: number;
  totalCost: number;
}): { distance?: number; economy?: number; costPerMile?: number } {
  let distance: number | undefined;
  let economy: number | undefined;
  let costPerMile: number | undefined;

  if (input.startMileage != null && input.endMileage != null) {
    distance = input.endMileage - input.startMileage;

    if (distance > 0 && input.volume > 0) {
      economy = Math.round((distance / input.volume) * 100) / 100;
    }

    if (distance > 0 && input.totalCost > 0) {
      costPerMile = Math.round((input.totalCost / distance) * 100) / 100;
    }
  }

  return { distance, economy, costPerMile };
}

/** Serialize a fuel transaction document for API response. */
export function serializeFuelTransaction(
  doc: Record<string, unknown>,
  assetName?: string,
  driverName?: string,
): Record<string, unknown> {
  return {
    id: doc._id?.toString(),
    assetId: doc.assetId?.toString(),
    assetName: assetName || undefined,
    driverId: doc.driverId?.toString() || undefined,
    driverName: driverName || undefined,
    date: doc.date ? (doc.date as Date).toISOString() : null,
    startMileage: doc.startMileage ?? undefined,
    endMileage: doc.endMileage ?? undefined,
    distance: doc.distance ?? undefined,
    volume: doc.volume,
    unitCost: doc.unitCost ?? undefined,
    totalCost: doc.totalCost,
    fuelType: doc.fuelType,
    economy: doc.economy ?? undefined,
    costPerMile: doc.costPerMile ?? undefined,
    station: doc.station || undefined,
    notes: doc.notes || undefined,
    source: doc.source || 'manual',
    importBatchId: doc.importBatchId || undefined,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
    isArchived: doc.isArchived === true,
    createdBy: doc.createdBy ? (doc.createdBy as { toString(): string }).toString() : null,
  };
}
