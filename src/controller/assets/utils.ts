/**
 * Asset validation utilities — custom validators (no Zod).
 */
import { isNonEmptyString, isValidObjectId, isEnumMember, isInRange } from '@/lib/validation/commonValidators';
import { ASSET_STATUSES, FUEL_TYPES, METER_TYPES, SUBSCRIPTION_TYPES } from '@/constants/assets';
import type { CreateAssetInput } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate asset creation input. */
export function validateCreateAssetInput(input: CreateAssetInput): ValidationResult {
  const errors: Record<string, string> = {};

  // name is required
  if (!isNonEmptyString(input.name)) {
    errors.name = 'Name is required';
  } else if (input.name.trim().length > 160) {
    errors.name = 'Name must be at most 160 characters';
  }

  // assetNumber optional but max 60
  if (input.assetNumber !== undefined && input.assetNumber !== '') {
    if (typeof input.assetNumber !== 'string' || input.assetNumber.trim().length > 60) {
      errors.assetNumber = 'Asset number must be at most 60 characters';
    }
  }

  // status
  if (input.status !== undefined && !isEnumMember(input.status, ASSET_STATUSES)) {
    errors.status = `Status must be one of: ${ASSET_STATUSES.join(', ')}`;
  }

  // vin - 5–17 chars if provided (supports standard VINs and NZ chassis numbers)
  if (input.vin !== undefined && input.vin !== '') {
    if (typeof input.vin !== 'string' || input.vin.trim().length < 5 || input.vin.trim().length > 17) {
      errors.vin = 'VIN / chassis number must be between 5 and 17 characters';
    }
  }

  // year - 1900-2100
  if (input.year !== undefined && input.year !== null) {
    if (!isInRange(input.year, 1900, 2100)) {
      errors.year = 'Year must be between 1900 and 2100';
    }
  }

  // licensePlate max 20
  if (input.licensePlate !== undefined && input.licensePlate !== '') {
    if (typeof input.licensePlate !== 'string' || input.licensePlate.trim().length > 20) {
      errors.licensePlate = 'License plate must be at most 20 characters';
    }
  }

  // fuelType
  if (input.fuelType !== undefined && input.fuelType !== '' && !isEnumMember(input.fuelType, FUEL_TYPES)) {
    errors.fuelType = `Fuel type must be one of: ${FUEL_TYPES.join(', ')}`;
  }

  // primaryMeter
  if (input.primaryMeter !== undefined && input.primaryMeter !== '' && !isEnumMember(input.primaryMeter, METER_TYPES)) {
    errors.primaryMeter = `Primary meter must be one of: ${METER_TYPES.join(', ')}`;
  }

  // subscriptionType
  if (input.subscriptionType !== undefined && input.subscriptionType !== '' && !isEnumMember(input.subscriptionType, SUBSCRIPTION_TYPES)) {
    errors.subscriptionType = `Subscription type must be one of: ${SUBSCRIPTION_TYPES.join(', ')}`;
  }

  // teamIds - validate each
  if (input.teamIds && Array.isArray(input.teamIds)) {
    for (const id of input.teamIds) {
      if (!isValidObjectId(id)) {
        errors.teamIds = 'All team IDs must be valid ObjectIds';
        break;
      }
    }
  }

  // assetTypeId
  if (input.assetTypeId !== undefined && input.assetTypeId !== '' && !isValidObjectId(input.assetTypeId)) {
    errors.assetTypeId = 'Asset type ID must be a valid ObjectId';
  }

  // formIds
  if (input.formIds && Array.isArray(input.formIds)) {
    for (const id of input.formIds) {
      if (!isValidObjectId(id)) {
        errors.formIds = 'All form IDs must be valid ObjectIds';
        break;
      }
    }
  }

  // serviceProgramIds
  if (input.serviceProgramIds && Array.isArray(input.serviceProgramIds)) {
    for (const id of input.serviceProgramIds) {
      if (!isValidObjectId(id)) {
        errors.serviceProgramIds = 'All service program IDs must be valid ObjectIds';
        break;
      }
    }
  }

  // driverAccessIds
  if (input.driverAccessIds && Array.isArray(input.driverAccessIds)) {
    for (const id of input.driverAccessIds) {
      if (!isValidObjectId(id)) {
        errors.driverAccessIds = 'All driver access IDs must be valid ObjectIds';
        break;
      }
    }
  }

  // currentOdometer >= 0
  if (input.currentOdometer !== undefined && input.currentOdometer !== null) {
    if (typeof input.currentOdometer !== 'number' || input.currentOdometer < 0) {
      errors.currentOdometer = 'Odometer must be a non-negative number';
    }
  }

  // currentEngineHours >= 0
  if (input.currentEngineHours !== undefined && input.currentEngineHours !== null) {
    if (typeof input.currentEngineHours !== 'number' || input.currentEngineHours < 0) {
      errors.currentEngineHours = 'Engine hours must be a non-negative number';
    }
  }

  // estimatedCost >= 0
  if (input.estimatedCost !== undefined && input.estimatedCost !== null) {
    if (typeof input.estimatedCost !== 'number' || input.estimatedCost < 0) {
      errors.estimatedCost = 'Estimated cost must be a non-negative number';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize an asset document for API response. */
export function serializeAsset(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    id: doc._id?.toString(),
    name: doc.name,
    assetNumber: doc.assetNumber || '',
    status: doc.status,
    vin: doc.vin || '',
    licensePlate: doc.licensePlate || '',
    make: doc.make || '',
    model: doc.model || '',
    year: doc.year || null,
    color: doc.color || '',
    tireSize: doc.tireSize || '',
    notes: doc.notes || '',
    assetSubtype: doc.assetSubtype || '',
    teamIds: Array.isArray(doc.teamIds) ? doc.teamIds.map((id: { toString: () => string }) => id.toString()) : [],
    currentOdometer: doc.currentOdometer ?? null,
    currentEngineHours: doc.currentEngineHours ?? null,
    estimatedCost: doc.estimatedCost ?? null,
    currencyCode: doc.currencyCode || 'USD',
    assetTypeId: doc.assetTypeId?.toString() || null,
    subscriptionType: doc.subscriptionType || '',
    lastServiceDate: doc.lastServiceDate ? (doc.lastServiceDate as Date).toISOString() : null,
    lastServiceMileage: doc.lastServiceMileage ?? null,
    lastServiceEngineHours: doc.lastServiceEngineHours ?? null,
    type: doc.type || '',
    fuelType: doc.fuelType || '',
    primaryMeter: doc.primaryMeter || 'odometer',
    photoUrls: doc.photoUrls || [],
    formIds: Array.isArray(doc.formIds) ? doc.formIds.map((id: { toString: () => string }) => id.toString()) : [],
    serviceProgramIds: Array.isArray(doc.serviceProgramIds) ? doc.serviceProgramIds.map((id: { toString: () => string }) => id.toString()) : [],
    driverAccessIds: Array.isArray(doc.driverAccessIds) ? doc.driverAccessIds.map((id: { toString: () => string }) => id.toString()) : [],
    isActive: doc.isActive ?? true,
    isArchived: doc.isArchived ?? false,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
    // Populated fields
    assetTypeName: doc.assetTypeName || null,
    teamNames: Array.isArray(doc.teamNames) ? doc.teamNames : [],
  };
}
