/**
 * Invitation domain types — TypeScript interfaces for the invitations collection.
 */
import { ObjectId } from 'mongodb';

export type InvitationStatus = 'pending' | 'accepted' | 'completed' | 'expired' | 'revoked' | 'invited';

/** Stored invitation document. */
export interface InvitationDocument {
  _id: ObjectId;
  tenantId: ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  roleId: ObjectId;
  /** Only present for local (non-3PM) invitations. */
  tokenHash?: string;
  status: InvitationStatus;
  invitedBy: ObjectId;
  expiresAt: Date;
  acceptedAt?: Date;
  acceptedBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  /** 'local' = asset-manager generated token; '3pm' = created via 3PM Data API. */
  source?: 'local' | '3pm';
  /** 3PM invitation ID — for resend/cancel via Data API. */
  threePMInvitationId?: string;
  /** Extra metadata stored with the invitation. */
  metadata?: InvitationMetadata;
}

/** Metadata stored alongside a 3PM-sourced invitation. */
export interface InvitationMetadata {
  firstName?: string;
  lastName?: string;
  roleId?: string;
  mobileNumber?: string;
}

/** Input for creating an invitation. */
export interface CreateInvitationInput {
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  invitedByUserId: string;
}
