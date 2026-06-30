/**
 * TenantMember domain types -- TypeScript interfaces for the tenantMembers collection.
 */
import { ObjectId } from 'mongodb';

/** Stored tenantMember document. */
export interface TenantMemberDocument {
  _id: ObjectId;
  tenantId: ObjectId;
  userId?: ObjectId | null;

  firstName: string;
  lastName: string;
  email: string;
  mobileNumber?: string;

  roleId?: ObjectId;
  isActive: boolean;
  portalUser: boolean;
  status: 'pending' | 'active';

  invitedBy?: ObjectId;
  invitedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

/** Input for inviting a user. */
export interface InviteUserInput {
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  mobileNumber?: string;
}

/** Input for updating a tenant member. */
export type UpdateTenantMemberInput = Partial<InviteUserInput>;

/** Serialized tenantMember for API responses. */
export interface TenantMemberResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber?: string;
  roleId?: string;
  roleName?: string;
  isActive: boolean;
  portalUser: boolean;
  status: 'pending' | 'active';
  createdAt: string;
  updatedAt: string;
}
