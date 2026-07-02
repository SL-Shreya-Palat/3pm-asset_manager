/**
 * Asset domain types — TypeScript interfaces for the assets collection.
 * Matches the schema defined in 02-BACKEND-ARCHITECTURE.md §F.2.
 */
import { ObjectId } from 'mongodb';

/** Stored asset document. */
export interface Asset {
  _id: ObjectId;
  tenantId: ObjectId;

  // Core identity
  name: string;
  assetNumber?: string;
  status: string;
  photoUrls: string[];

  // Manufacturer details
  vin?: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  tireSize?: string;
  notes?: string;

  // Other details
  assetSubtype?: string;
  teamIds: ObjectId[];
  currentOdometer?: number;
  currentEngineHours?: number;
  estimatedCost?: number;
  currencyCode?: string;
  assetTypeId?: ObjectId;
  subscriptionType?: string;
  lastServiceDate?: Date;
  lastServiceMileage?: number;
  lastServiceEngineHours?: number;
  hubometer?: number;
  regoWof?: Date;

  // Associations
  formIds: ObjectId[];
  serviceProgramIds: ObjectId[];

  // From spec
  type?: string;
  fuelType?: string;
  primaryMeter?: string;
  assetGroupIds: ObjectId[];
  locationId?: ObjectId;
  assignedDriverId?: ObjectId;
  driverAccessIds: ObjectId[];
  qrCode?: string;
  customFields?: Record<string, unknown>;

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

/** Input for creating an asset. */
export interface CreateAssetInput {
  name: string;
  assetNumber?: string;
  status?: string;

  // Manufacturer details
  vin?: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  tireSize?: string;
  notes?: string;

  // Other details
  assetSubtype?: string;
  teamIds?: string[];
  currentOdometer?: number;
  currentEngineHours?: number;
  estimatedCost?: number;
  currencyCode?: string;
  assetTypeId?: string;
  subscriptionType?: string;
  lastServiceDate?: string;
  lastServiceMileage?: number;
  lastServiceEngineHours?: number;
  hubometer?: number;
  regoWof?: string;

  type?: string;
  fuelType?: string;
  primaryMeter?: string;
  photoUrls?: string[];
  formIds?: string[];
  serviceProgramIds?: string[];
  driverAccessIds?: string[];
}

/** Input for updating an asset. */
export type UpdateAssetInput = Partial<CreateAssetInput>;

/** Asset type document (tenant-scoped, manageable via popup). */
export interface AssetType {
  _id: ObjectId;
  tenantId: ObjectId;
  name: string;
  nameLower: string;
  description?: string;
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Serialized asset for API responses. */
export interface AssetResponse {
  id: string;
  name: string;
  assetNumber?: string;
  status: string;
  vin?: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  tireSize?: string;
  notes?: string;
  assetSubtype?: string;
  teamIds: string[];
  currentOdometer?: number;
  currentEngineHours?: number;
  estimatedCost?: number;
  currencyCode?: string;
  assetTypeId?: string;
  subscriptionType?: string;
  lastServiceDate?: string;
  lastServiceMileage?: number;
  lastServiceEngineHours?: number;
  hubometer?: number;
  regoWof?: string;
  type?: string;
  fuelType?: string;
  primaryMeter?: string;
  photoUrls: string[];
  formIds: string[];
  serviceProgramIds: string[];
  driverAccessIds: string[];
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  // Populated name for display
  assetTypeName?: string;
}
