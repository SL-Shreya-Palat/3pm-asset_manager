/**
 * GET /api/tenant/list
 *
 * List the tenants the authenticated user can access (active, not archived,
 * invitation accepted), plus the currently active tenant id. Feeds the
 * sidebar tenant switcher (auth store fetchTenants()).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser, ACTIVE_MEMBER_FILTER } from '@/lib/auth-helper';
import { getTenantMembersCollection, getTenantsCollection } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);

  if (!authUser?.id || !ObjectId.isValid(authUser.id)) {
    return NextResponse.json(
      { data: null, error: 'Not authenticated' },
      { status: 401 },
    );
  }

  try {
    const tenantMembersCollection = await getTenantMembersCollection();
    const tenantsCollection = await getTenantsCollection();
    const userObjectId = ObjectId.createFromHexString(authUser.id);

    const memberships = await tenantMembersCollection
      .find({ userId: userObjectId, ...ACTIVE_MEMBER_FILTER })
      .project({ tenantId: 1 })
      .toArray();

    const tenantIds = memberships.map((m) => m.tenantId as ObjectId);
    const tenants = tenantIds.length
      ? await tenantsCollection
          .find({ _id: { $in: tenantIds }, isActive: { $ne: false } })
          .project({ name: 1, slug: 1, ownerId: 1, isActive: 1 })
          .sort({ name: 1 })
          .toArray()
      : [];

    return NextResponse.json({
      data: {
        tenants: tenants.map((t) => ({
          id: t._id.toString(),
          name: (t.name as string) || '',
          slug: (t.slug as string) || '',
          role: t.ownerId?.toString() === authUser.id ? 'owner' : 'member',
          isActive: t.isActive !== false,
        })),
        activeTenantId: authUser.currentTenantId ?? null,
      },
      error: null,
    });
  } catch (error) {
    console.error('Tenant list error:', error);
    return NextResponse.json(
      { data: null, error: 'Failed to load tenants' },
      { status: 500 },
    );
  }
}
