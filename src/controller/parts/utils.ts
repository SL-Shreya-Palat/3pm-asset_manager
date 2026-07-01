/**
 * Parts validation utilities.
 */
import { isNonEmptyString, isValidObjectId } from '@/lib/validation/commonValidators';
import type { CreatePartInput } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate part creation input. */
export function validateCreatePartInput(input: CreatePartInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(input.name)) {
    errors.name = 'Part name is required';
  } else if (input.name.trim().length > 160) {
    errors.name = 'Part name must be at most 160 characters';
  }

  if (!isNonEmptyString(input.partNumber)) {
    errors.partNumber = 'Part number is required';
  } else if (input.partNumber.trim().length > 80) {
    errors.partNumber = 'Part number must be at most 80 characters';
  }

  if (input.upc) {
    const trimmed = input.upc.trim();
    if (!/^\d{12}$/.test(trimmed)) {
      errors.upc = 'UPC must be exactly 12 digits';
    }
  }

  if (input.description && input.description.trim().length > 2000) {
    errors.description = 'Description must be at most 2000 characters';
  }

  if (input.manufacturerId && !isValidObjectId(input.manufacturerId)) {
    errors.manufacturerId = 'Invalid manufacturer ID';
  }

  if (input.measurementUnitId && !isValidObjectId(input.measurementUnitId)) {
    errors.measurementUnitId = 'Invalid measurement unit ID';
  }

  if (input.categoryId && !isValidObjectId(input.categoryId)) {
    errors.categoryId = 'Invalid category ID';
  }

  if (input.reorderPoint !== undefined && input.reorderPoint !== null) {
    if (typeof input.reorderPoint !== 'number' || isNaN(input.reorderPoint) || input.reorderPoint < 0) {
      errors.reorderPoint = 'Reorder point must be a non-negative number';
    }
  }

  if (input.maximumQuantity !== undefined && input.maximumQuantity !== null) {
    if (typeof input.maximumQuantity !== 'number' || isNaN(input.maximumQuantity) || input.maximumQuantity < 0) {
      errors.maximumQuantity = 'Maximum quantity must be a non-negative number';
    }
  }

  if (input.vendors && Array.isArray(input.vendors)) {
    for (let i = 0; i < input.vendors.length; i++) {
      const v = input.vendors[i];
      if (!isValidObjectId(v.vendorId)) {
        errors[`vendors[${i}].vendorId`] = 'Invalid vendor ID';
      }
      if (typeof v.unitCost !== 'number' || isNaN(v.unitCost) || v.unitCost < 0) {
        errors[`vendors[${i}].unitCost`] = 'Unit cost must be a non-negative number';
      }
    }
  }

  if (input.stockLocations && Array.isArray(input.stockLocations)) {
    for (let i = 0; i < input.stockLocations.length; i++) {
      const s = input.stockLocations[i];
      if (!isValidObjectId(s.locationId)) {
        errors[`stockLocations[${i}].locationId`] = 'Invalid location ID';
      }
      if (typeof s.quantity !== 'number' || isNaN(s.quantity) || s.quantity < 0) {
        errors[`stockLocations[${i}].quantity`] = 'Quantity must be a non-negative number';
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a part document for API response. */
export function serializePart(doc: Record<string, unknown>): Record<string, unknown> {
  const vendors = doc.vendors as Array<{ vendorId: { toString(): string }; unitCost: number }> | undefined;
  const stockLocations = doc.stockLocations as Array<{ locationId: { toString(): string } | null; quantity: number }> | undefined;

  return {
    id: doc._id?.toString(),
    name: doc.name,
    partNumber: doc.partNumber,
    upc: doc.upc || undefined,
    description: doc.description || undefined,
    photoUrl: doc.photoUrl || undefined,
    manufacturerId: doc.manufacturerId ? (doc.manufacturerId as { toString(): string }).toString() : undefined,
    measurementUnitId: doc.measurementUnitId ? (doc.measurementUnitId as { toString(): string }).toString() : undefined,
    categoryId: doc.categoryId ? (doc.categoryId as { toString(): string }).toString() : undefined,
    reorderPoint: doc.reorderPoint ?? undefined,
    maximumQuantity: doc.maximumQuantity ?? undefined,
    vendors: vendors
      ? vendors.map((v) => ({ vendorId: v.vendorId.toString(), unitCost: v.unitCost }))
      : [],
    stockLocations: stockLocations
      ? stockLocations.map((s) => ({ locationId: s.locationId ? s.locationId.toString() : null, quantity: s.quantity }))
      : [],
    isActive: doc.isActive ?? true,
    isArchived: doc.isArchived ?? false,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
  };
}
