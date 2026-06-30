/**
 * Vendor validation utilities -- custom validators (no Zod).
 */
import { isNonEmptyString, isValidEmail, isValidPhone } from '@/lib/validation/commonValidators';
import { VENDOR_TYPES } from './types';
import type { CreateVendorInput } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate vendor creation input. */
export function validateCreateVendorInput(input: CreateVendorInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!isNonEmptyString(input.name)) {
    errors.name = 'Vendor name is required';
  } else if (input.name.trim().length > 160) {
    errors.name = 'Vendor name must be at most 160 characters';
  }

  if (!isNonEmptyString(input.contactName)) {
    errors.contactName = 'Contact name is required';
  } else if (input.contactName.trim().length > 120) {
    errors.contactName = 'Contact name must be at most 120 characters';
  }

  if (input.email && !isValidEmail(input.email)) {
    errors.email = 'Invalid email address';
  }

  if (input.phone && !isValidPhone(input.phone)) {
    errors.phone = 'Invalid phone number';
  }

  if (input.address && input.address.trim().length > 300) {
    errors.address = 'Address must be at most 300 characters';
  }

  if (input.website) {
    const trimmed = input.website.trim();
    if (trimmed.length > 2048) {
      errors.website = 'Website must be at most 2048 characters';
    }
  }

  if (input.vendorTypes && Array.isArray(input.vendorTypes)) {
    const invalid = input.vendorTypes.filter(
      (t) => !(VENDOR_TYPES as readonly string[]).includes(t),
    );
    if (invalid.length > 0) {
      errors.vendorTypes = `Invalid vendor type(s): ${invalid.join(', ')}`;
    }
  }

  if (input.laborRatePerHour !== undefined && input.laborRatePerHour !== null) {
    if (typeof input.laborRatePerHour !== 'number' || isNaN(input.laborRatePerHour) || input.laborRatePerHour < 0) {
      errors.laborRatePerHour = 'Labor rate must be a non-negative number';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Serialize a vendor document for API response. */
export function serializeVendor(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    id: doc._id?.toString(),
    name: doc.name,
    address: doc.address || undefined,
    website: doc.website || undefined,
    contactName: doc.contactName,
    phone: doc.phone || undefined,
    email: doc.email || undefined,
    vendorTypes: doc.vendorTypes || [],
    publicEditAccess: doc.publicEditAccess !== false,
    laborRatePerHour: doc.laborRatePerHour ?? undefined,
    isActive: doc.isActive ?? true,
    isArchived: doc.isArchived ?? false,
    createdAt: doc.createdAt ? (doc.createdAt as Date).toISOString() : null,
    updatedAt: doc.updatedAt ? (doc.updatedAt as Date).toISOString() : null,
  };
}
