/**
 * Driver domain types -- TypeScript interfaces for the drivers collection.
 */
import { ObjectId } from 'mongodb';

/** Stored driver document. */
export interface Driver {
  _id: ObjectId;
  tenantId: ObjectId;

  // Personal
  firstName: string;
  lastName: string;
  email?: string;
  photoUrl?: string;
  notes?: string;
  teamId?: ObjectId;
  countryCode?: string;
  mobileNumber?: string;
  homePhone?: string;
  workPhone?: string;
  dateOfBirth?: Date | null;

  // Details
  employeeNumber?: string;
  jobPosition?: string;
  rateCurrency?: string;
  ratePerUnit?: number;
  otherNotes?: string;

  // License
  driverLicense?: string;
  licenseClass?: string;
  licenseNumber?: string;
  healthCertificate?: string;

  // Linked tenantMember (RBAC / app access)
  tenantMemberId?: ObjectId;

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

/** Input for creating a driver. */
export interface CreateDriverInput {
  firstName: string;
  lastName: string;
  email?: string;
  photoUrl?: string;
  notes?: string;
  teamId?: string;
  countryCode?: string;
  mobileNumber?: string;
  homePhone?: string;
  workPhone?: string;
  dateOfBirth?: string;

  employeeNumber?: string;
  jobPosition?: string;
  rateCurrency?: string;
  ratePerUnit?: number;
  otherNotes?: string;

  driverLicense?: string;
  licenseClass?: string;
  licenseNumber?: string;
  healthCertificate?: string;
}

/** Input for updating a driver. */
export type UpdateDriverInput = Partial<CreateDriverInput>;

/** Serialized driver for API responses. */
export interface DriverResponse {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  photoUrl?: string;
  notes?: string;
  teamId?: string;
  countryCode?: string;
  mobileNumber?: string;
  homePhone?: string;
  workPhone?: string;
  dateOfBirth?: string | null;

  employeeNumber?: string;
  jobPosition?: string;
  rateCurrency?: string;
  ratePerUnit?: number;
  otherNotes?: string;

  driverLicense?: string;
  licenseClass?: string;
  licenseNumber?: string;
  healthCertificate?: string;

  tenantMemberId?: string;

  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
