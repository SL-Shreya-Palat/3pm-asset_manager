/**
 * Parts (Inventory) domain types.
 */
import { ObjectId } from 'mongodb';

/** Vendor-cost pair on a part. */
export interface PartVendor {
  vendorId: ObjectId;
  unitCost: number;
}

/** Per-location stock. A null locationId is the "Unassigned" bucket (stock not
 *  tied to a named location — e.g. auto-recorded work-order consumption). */
export interface StockLocation {
  locationId: ObjectId | null;
  quantity: number;
}

/** Stored part document. */
export interface Part {
  _id: ObjectId;
  tenantId: ObjectId;

  name: string;
  partNumber: string;
  description?: string;
  photoUrl?: string;

  // References to settings
  manufacturerId?: ObjectId;
  measurementUnitId?: ObjectId;
  categoryId?: ObjectId;

  // Stock management
  reorderPoint?: number;
  maximumQuantity?: number;

  // Multi-vendor pricing
  vendors: PartVendor[];

  // Multi-location stock
  stockLocations: StockLocation[];

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

/** Input for creating a part. */
export interface CreatePartInput {
  name: string;
  partNumber: string;
  description?: string;
  photoUrl?: string;
  manufacturerId?: string;
  measurementUnitId?: string;
  categoryId?: string;
  reorderPoint?: number;
  maximumQuantity?: number;
  vendors?: Array<{ vendorId: string; unitCost: number }>;
  stockLocations?: Array<{ locationId: string; quantity: number }>;
}

/** Input for updating a part. */
export type UpdatePartInput = Partial<CreatePartInput>;
