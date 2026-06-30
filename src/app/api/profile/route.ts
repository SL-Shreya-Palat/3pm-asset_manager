/**
 * PATCH /api/profile
 *
 * Updates the authenticated user's profile fields in the users collection.
 * Email is NOT updatable (managed by 3pm-auth).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getUsersCollection } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

const ADDRESS_FIELDS = ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'] as const;

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // ── Validate ──────────────────────────────────────────────────────
    const errors: string[] = [];

    if (body.firstName !== undefined && (typeof body.firstName !== 'string' || body.firstName.trim().length === 0)) {
      errors.push('firstName must be a non-empty string');
    }
    if (body.lastName !== undefined && (typeof body.lastName !== 'string' || body.lastName.trim().length === 0)) {
      errors.push('lastName must be a non-empty string');
    }
    if (body.phoneNumber !== undefined && body.phoneNumber !== null && typeof body.phoneNumber !== 'string') {
      errors.push('phoneNumber must be a string');
    }
    if (body.profileImageUrl !== undefined && body.profileImageUrl !== null && typeof body.profileImageUrl !== 'string') {
      errors.push('profileImageUrl must be a string');
    }

    if (body.address !== undefined && body.address !== null) {
      if (typeof body.address !== 'object' || Array.isArray(body.address)) {
        errors.push('address must be an object');
      } else {
        for (const field of ADDRESS_FIELDS) {
          if (body.address[field] !== undefined && body.address[field] !== null && typeof body.address[field] !== 'string') {
            errors.push(`address.${field} must be a string`);
          }
        }
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ data: null, error: errors.join(', ') }, { status: 400 });
    }

    // ── Build $set ────────────────────────────────────────────────────
    const $set: Record<string, unknown> = { updatedAt: new Date() };

    if (body.firstName !== undefined) $set.firstName = body.firstName.trim();
    if (body.lastName !== undefined) $set.lastName = body.lastName.trim();

    if (body.phoneNumber !== undefined) {
      $set.phoneNumber = body.phoneNumber === null ? null : (body.phoneNumber.trim() || null);
    }
    if (body.profileImageUrl !== undefined) {
      $set.profileImageUrl = body.profileImageUrl === null ? null : (body.profileImageUrl.trim() || null);
    }

    if (body.address !== undefined) {
      if (body.address === null) {
        $set.address = null;
      } else {
        const addr: Record<string, string> = {};
        for (const field of ADDRESS_FIELDS) {
          if (body.address[field] != null) {
            addr[field] = typeof body.address[field] === 'string' ? body.address[field].trim() : '';
          }
        }
        $set.address = Object.keys(addr).length > 0 ? addr : null;
      }
    }

    // Keep computed `name` field in sync
    if (body.firstName !== undefined || body.lastName !== undefined) {
      const usersCol = await getUsersCollection();
      const current = await usersCol.findOne(
        { _id: ObjectId.createFromHexString(user.id) },
        { projection: { firstName: 1, lastName: 1 } },
      );
      const fn = body.firstName !== undefined ? body.firstName.trim() : (current?.firstName || '');
      const ln = body.lastName !== undefined ? body.lastName.trim() : (current?.lastName || '');
      $set.name = `${fn} ${ln}`.trim();
    }

    // ── Execute ───────────────────────────────────────────────────────
    const usersCollection = await getUsersCollection();
    const result = await usersCollection.updateOne(
      { _id: ObjectId.createFromHexString(user.id) },
      { $set },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ data: null, error: 'User not found' }, { status: 404 });
    }

    // Return updated user
    const updated = await usersCollection.findOne(
      { _id: ObjectId.createFromHexString(user.id) },
      { projection: { firstName: 1, lastName: 1, email: 1, phoneNumber: 1, profileImageUrl: 1, address: 1 } },
    );

    return NextResponse.json({
      data: {
        message: 'Profile updated successfully',
        user: updated
          ? {
              id: updated._id.toString(),
              firstName: updated.firstName,
              lastName: updated.lastName,
              email: updated.email,
              phoneNumber: updated.phoneNumber || null,
              profileImageUrl: updated.profileImageUrl || null,
              address: updated.address || null,
            }
          : null,
      },
      error: null,
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ data: null, error: 'Failed to update profile' }, { status: 500 });
  }
}
