/**
 * Fuel domain types -- TypeScript interfaces for the fuelTransactions collection.
 */
import { ObjectId } from 'mongodb';

/** Fuel type enum values. */
export const FUEL_TYPES = ['diesel', 'gasoline', 'electric', 'cng', 'lpg', 'other'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

/** Source of the fuel transaction. */
export const FUEL_SOURCES = ['manual', 'wex', 'fleetcor', 'coast'] as const;
export type FuelSource = (typeof FUEL_SOURCES)[number];

/** Stored fuel transaction document. */
export interface FuelTransaction {
  _id: ObjectId;
  tenantId: ObjectId;

  // Relationships
  assetId: ObjectId;
  driverId?: ObjectId;

  // Transaction data
  date: Date;
  startMileage?: number;
  endMileage?: number;
  distance?: number;          // Calculated: endMileage - startMileage
  volume: number;             // Gallons or liters
  unitCost?: number;
  totalCost: number;
  fuelType: string;
  economy?: number;           // Calculated: distance / volume
  costPerMile?: number;       // Calculated: totalCost / distance
  station?: string;
  notes?: string;

  // Source & import
  source: FuelSource;
  importBatchId?: string;

  // Base fields
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: ObjectId | null;
}

/** Input for creating a fuel transaction. */
export interface CreateFuelTransactionInput {
  assetId: string;
  driverId?: string;
  date: string;
  startMileage?: number;
  endMileage?: number;
  volume: number;
  unitCost?: number;
  totalCost: number;
  fuelType: string;
  station?: string;
  notes?: string;
  source?: string;
}

/** Input for updating a fuel transaction. */
export type UpdateFuelTransactionInput = Partial<CreateFuelTransactionInput>;

/** Serialized fuel transaction for API responses. */
export interface FuelTransactionResponse {
  id: string;
  assetId: string;
  assetName?: string;
  driverId?: string;
  driverName?: string;
  date: string;
  startMileage?: number;
  endMileage?: number;
  distance?: number;
  volume: number;
  unitCost?: number;
  totalCost: number;
  fuelType: string;
  economy?: number;
  costPerMile?: number;
  station?: string;
  notes?: string;
  source: string;
  importBatchId?: string;
  createdAt: string;
  updatedAt: string;
}
