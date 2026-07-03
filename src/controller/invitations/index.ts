/**
 * Invitations controller — token generation, validation, and acceptance.
 *
 * Supports two sources:
 * - 'local': Legacy flow — asset-manager generates token, sends email, handles acceptance.
 * - '3pm':   New flow — 3pm-auth creates invitation via Data API, sends email, handles acceptance.
 *            Asset-manager stores a local mirror and completes it on auth callback.
 */
import { randomBytes, createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import { getInvitationsCollection, getTenantMembersCollection } from '@/lib/mongodb';
import type { CreateInvitationInput, InvitationDocument, InvitationMetadata } from './types';

const INVITATION_EXPIRY_DAYS = 7;

/** Hash a raw token with SHA-256 for secure storage. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// Legacy (local) invitation functions — kept for backward compatibility
// ---------------------------------------------------------------------------

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
    source: 'local' as const,
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
 * Find an accepted invitation by email (used during auth callback for legacy flow).
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

// ---------------------------------------------------------------------------
// 3PM Data API invitation functions — mirrors construction-portal pattern
// ---------------------------------------------------------------------------

/**
 * Create a local mirror of a 3PM-sourced invitation.
 * Called after create3PMInvitation() succeeds — stores metadata so the auth
 * callback can complete the invitation when the user logs in.
 */
export async function createInvitation3PM(
  tenantId: ObjectId,
  email: string,
  threePMInvitationId: string,
  metadata: InvitationMetadata,
  invitedBy: ObjectId,
  threePMExpiresAt?: Date | string,
): Promise<InvitationDocument> {
  const collection = await getInvitationsCollection();
  const now = new Date();
  const expiresAt = threePMExpiresAt
    ? new Date(threePMExpiresAt)
    : new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const normalizedEmail = email.toLowerCase().trim();

  const doc = {
    tenantId,
    email: normalizedEmail,
    firstName: metadata.firstName || '',
    lastName: metadata.lastName || '',
    roleId: metadata.roleId ? ObjectId.createFromHexString(metadata.roleId) : null,
    status: 'invited' as const,
    source: '3pm' as const,
    threePMInvitationId,
    metadata,
    invitedBy,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(doc);
  return { _id: result.insertedId, ...doc } as unknown as InvitationDocument;
}

/**
 * Find a pending 3PM invitation by email (across all tenants).
 * Used during auth callback to detect if the user is accepting an invitation.
 */
export async function getPending3PMInviteByEmail(
  email: string,
): Promise<InvitationDocument | null> {
  const collection = await getInvitationsCollection();

  return (await collection.findOne({
    email: email.toLowerCase().trim(),
    source: '3pm',
    status: 'invited',
  })) as InvitationDocument | null;
}

/**
 * Complete a pending 3PM invitation after the user authenticates via 3pm-auth.
 *
 * 1. Finds the pending local invitation by email + tenant.
 * 2. Activates the tenantMember (sets userId, portalUser=true, status='active').
 * 3. Marks the local invitation as 'accepted'.
 *
 * Returns { completed: true } on success, { completed: false } if no matching
 * pending invitation was found.
 */
export async function completePending3PMInvitationFromAccept(
  userId: string,
  tenantId: string,
  userEmail: string,
): Promise<{ completed: boolean; invitation?: InvitationDocument }> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(tenantId)) {
    return { completed: false };
  }

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);
  const normalizedEmail = userEmail.toLowerCase().trim();

  // 1. Find the pending 3PM invitation for this email + tenant
  const invitationsCol = await getInvitationsCollection();
  const invitation = (await invitationsCol.findOne({
    tenantId: tenantOid,
    email: normalizedEmail,
    source: '3pm',
    status: 'invited',
  })) as InvitationDocument | null;

  if (!invitation) {
    return { completed: false };
  }

  const now = new Date();

  // 2. Activate the tenantMember
  const tenantMembersCol = await getTenantMembersCollection();
  const existingMember = await tenantMembersCol.findOne({
    tenantId: tenantOid,
    $or: [{ email: normalizedEmail }, { userId: userOid }],
  });

  if (existingMember) {
    // Update existing member — set userId, activate, honor role from invitation
    const update: Record<string, unknown> = {
      userId: userOid,
      portalUser: true,
      isActive: true,
      status: 'active',
      updatedAt: now,
    };
    if (invitation.roleId) {
      update.roleId = invitation.roleId;
    }
    await tenantMembersCol.updateOne(
      { _id: existingMember._id },
      { $set: update },
    );
  } else {
    // No tenantMember exists — create one from invitation metadata
    await tenantMembersCol.insertOne({
      userId: userOid,
      tenantId: tenantOid,
      firstName: invitation.firstName || '',
      lastName: invitation.lastName || '',
      email: normalizedEmail,
      ...(invitation.roleId ? { roleId: invitation.roleId } : {}),
      isActive: true,
      portalUser: true,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }

  // 3. Mark invitation as accepted
  await invitationsCol.updateOne(
    { _id: invitation._id },
    {
      $set: {
        status: 'accepted',
        acceptedAt: now,
        acceptedBy: userOid,
        updatedAt: now,
      },
    },
  );

  return { completed: true, invitation };
}
