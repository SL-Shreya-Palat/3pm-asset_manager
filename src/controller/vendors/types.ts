/**
 * Vendor domain types -- TypeScript interfaces for the vendors collection.
 */
import { ObjectId } from 'mongodb';

/** Vendor type enum values. */
export const VENDOR_TYPES = ['parts', 'services'] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

/** Stored vendor document. */
export interface Vendor {
  _id: ObjectId;
  tenantId: ObjectId;

  // Core vendor info
  name: string;
  address?: string;
  website?: string;

  // Primary contact
  contactName: string;
  phone?: string;
  email?: string;

  // Vendor type & access
  vendorTypes: VendorType[];
  publicEditAccess: boolean;

  // Labor rate
  laborRatePerHour?: number;

  // Base fields
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Input for creating a vendor. */
export interface CreateVendorInput {
  name: string;
  address?: string;
  website?: string;
  contactName: string;
  phone?: string;
  email?: string;
  vendorTypes?: string[];
  publicEditAccess?: boolean;
  laborRatePerHour?: number;
}

/** Input for updating a vendor. */
export type UpdateVendorInput = Partial<CreateVendorInput>;

/** Serialized vendor for API responses. */
export interface VendorResponse {
  id: string;
  name: string;
  address?: string;
  website?: string;
  contactName: string;
  phone?: string;
  email?: string;
  vendorTypes: string[];
  publicEditAccess: boolean;
  laborRatePerHour?: number;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
