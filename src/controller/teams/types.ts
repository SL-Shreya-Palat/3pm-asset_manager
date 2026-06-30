/**
 * Team domain types -- TypeScript interfaces for the teams collection.
 */
import { ObjectId } from 'mongodb';

/** Stored team document. */
export interface Team {
  _id: ObjectId;
  tenantId: ObjectId;
  name: string;
  nameLower: string;
  assetIds: ObjectId[];

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

/** Input for creating a team. */
export interface CreateTeamInput {
  name: string;
}

/** Input for updating a team. */
export type UpdateTeamInput = Partial<CreateTeamInput>;

/** Serialized team for API responses. */
export interface TeamResponse {
  id: string;
  name: string;
  assetIds: string[];
  assetCount: number;
  driverCount: number;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
