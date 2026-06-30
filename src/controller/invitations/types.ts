/**
 * Invitation domain types — TypeScript interfaces for the invitations collection.
 */
import { ObjectId } from 'mongodb';

export type InvitationStatus = 'pending' | 'accepted' | 'completed' | 'expired' | 'revoked';

/** Stored invitation document. */
export interface InvitationDocument {
  _id: ObjectId;
  tenantId: ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  roleId: ObjectId;
  tokenHash: string;
  status: InvitationStatus;
  invitedBy: ObjectId;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating an invitation. */
export interface CreateInvitationInput {
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  invitedByUserId: string;
}
