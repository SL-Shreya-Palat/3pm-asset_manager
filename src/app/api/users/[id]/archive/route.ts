/**
 * PATCH /api/users/:id/archive -- Archive or unarchive a user
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { requireAdmin } from '@/lib/authz';
import { getTenantMembersCollection, getTenantsCollection } from '@/lib/mongodb';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.res;
  const user = auth.user;

  try {
    const { id } = await context.params;
    const { archived } = await request.json();

    if (typeof archived !== 'boolean') {
      return NextResponse.json({ data: null, error: 'Invalid request: "archived" must be a boolean' }, { status: 400 });
    }

    const collection = await getTenantMembersCollection();
    const now = new Date();
    const userOid = ObjectId.createFromHexString(user.id);
    const tenantOid = ObjectId.createFromHexString(user.currentTenantId!);
    const docOid = ObjectId.createFromHexString(id);

    // The tenant owner can never be archived; admins can't archive themselves.
    if (archived) {
      const member = await collection.findOne({ _id: docOid, tenantId: tenantOid }, { projection: { userId: 1 } });
      if (!member) {
        return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
      }
      if (member.userId) {
        const tenant = await (await getTenantsCollection()).findOne({ _id: tenantOid }, { projection: { ownerId: 1 } });
        if (tenant?.ownerId && member.userId.toString() === tenant.ownerId.toString()) {
          return NextResponse.json({ data: null, error: 'The account owner cannot be archived' }, { status: 400 });
        }
        if (member.userId.toString() === user.id) {
          return NextResponse.json({ data: null, error: 'You cannot archive your own account' }, { status: 400 });
        }
      }
    }

    const result = await collection.updateOne(
      { _id: docOid, tenantId: tenantOid },
      {
        $set: {
          isArchived: archived,
          archivedAt: archived ? now : null,
          archivedBy: archived ? userOid : null,
          updatedBy: userOid,
          updatedAt: now,
        },
      },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
