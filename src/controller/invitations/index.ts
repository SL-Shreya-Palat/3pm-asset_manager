/**
 * Invitations controller — token generation, validation, and acceptance.
 * Uses crypto.randomBytes for token generation and SHA-256 for storage.
 */
import { randomBytes, createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import { getInvitationsCollection } from '@/lib/mongodb';
import type { CreateInvitationInput, InvitationDocument } from './types';

const INVITATION_EXPIRY_DAYS = 7;

/** Hash a raw token with SHA-256 for secure storage. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create an invitation record and return the raw token (for the email link).
 * The raw token is NOT stored — only its SHA-256 hash.
 */
export async function createInvitation(
  tenantId: string,
  input: CreateInvitationInput,
): Promise<{ invitationId: string; rawToken: string }> {
  const collection = await getInvitationsCollection();
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const doc = {
    tenantId: ObjectId.createFromHexString(tenantId),
    email: input.email.trim().toLowerCase(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    roleId: ObjectId.createFromHexString(input.roleId),
    tokenHash,
    status: 'pending' as const,
    invitedBy: ObjectId.createFromHexString(input.invitedByUserId),
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(doc);
  return { invitationId: result.insertedId.toString(), rawToken };
}

/**
 * Validate a raw invitation token.
 * Returns the invitation if valid (pending + not expired), null otherwise.
 */
export async function validateInvitationToken(
  rawToken: string,
): Promise<InvitationDocument | null> {
  const collection = await getInvitationsCollection();
  const tokenHash = hashToken(rawToken);

  const invitation = await collection.findOne({
    tokenHash,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }) as InvitationDocument | null;

  return invitation;
}

/**
 * Mark an invitation as accepted.
 * Returns true if the update succeeded.
 */
export async function acceptInvitation(rawToken: string): Promise<boolean> {
  const collection = await getInvitationsCollection();
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const result = await collection.updateOne(
    { tokenHash, status: 'pending', expiresAt: { $gt: now } },
    { $set: { status: 'accepted', acceptedAt: now, updatedAt: now } },
  );

  return result.modifiedCount > 0;
}

/**
 * Find an accepted invitation by email (used during auth callback).
 * Returns the invitation if one exists with status 'accepted', null otherwise.
 */
export async function getAcceptedInvitationByEmail(
  email: string,
): Promise<InvitationDocument | null> {
  const collection = await getInvitationsCollection();
  const normalizedEmail = email.trim().toLowerCase();

  return (await collection.findOne({
    email: normalizedEmail,
    status: 'accepted',
  })) as InvitationDocument | null;
}

/**
 * Mark an accepted invitation as completed (user successfully provisioned).
 * Prevents the invitation from triggering again on subsequent logins.
 */
export async function completeInvitation(invitationId: string): Promise<boolean> {
  const collection = await getInvitationsCollection();
  const now = new Date();

  const result = await collection.updateOne(
    { _id: ObjectId.createFromHexString(invitationId), status: 'accepted' },
    { $set: { status: 'completed', updatedAt: now } },
  );

  return result.modifiedCount > 0;
}
