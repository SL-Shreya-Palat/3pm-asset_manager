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
      errors.startMileage = 'Start mileage must be a non-negative number';
    }
  }

  if (input.endMileage !== undefined && input.endMileage !== null) {
    if (typeof input.endMileage !== 'number' || isNaN(input.endMileage) || input.endMileage < 0) {
      errors.endMileage = 'End mileage must be a non-negative number';
    }
  }

  if (
    input.startMileage != null &&
    input.endMileage != null &&
    typeof input.startMileage === 'number' &&
    typeof input.endMileage === 'number' &&
    input.endMileage < input.startMileage
  ) {
    errors.endMileage = 'End mileage must be greater than start mileage';
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
