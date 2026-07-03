/**
 * Inventory settings domain types -- measurement units, part categories,
 * and part locations.
 */
import { ObjectId } from 'mongodb';

// ---------------------------------------------------------------------------
// Measurement Units
// ---------------------------------------------------------------------------
export interface MeasurementUnit {
  _id: ObjectId;
  tenantId: ObjectId;
  name: string;
  symbol: string;
  description?: string;
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
}

export interface CreateMeasurementUnitInput {
  name: string;
  symbol: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Part Categories
// ---------------------------------------------------------------------------
export interface PartCategory {
  _id: ObjectId;
  tenantId: ObjectId;
  name: string;
  description?: string;
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
}

export interface CreatePartCategoryInput {
  name: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Part Locations
// ---------------------------------------------------------------------------
export interface PartLocation {
  _id: ObjectId;
  tenantId: ObjectId;
  name: string;
  description?: string;
  isDefault: boolean;
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
}

export interface CreatePartLocationInput {
  name: string;
  description?: string;
  isDefault?: boolean;
}

