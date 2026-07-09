/**
 * PATCH /api/roles/:id/archive -- Archive or unarchive a role
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { requireAdmin } from '@/lib/authz';
import { getRolesCollection, getTenantMembersCollection } from '@/lib/mongodb';

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

    const collection = await getRolesCollection();
    const now = new Date();
    const userOid = ObjectId.createFromHexString(user.id);
    const tenantOid = ObjectId.createFromHexString(user.currentTenantId!);
    const docOid = ObjectId.createFromHexString(id);

    const doc = await collection.findOne({ _id: docOid, tenantId: tenantOid });

    if (!doc) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }

    if (doc.isSystem === true) {
      return NextResponse.json({ data: null, error: 'System roles cannot be archived' }, { status: 400 });
    }

    // When archiving, check for active members assigned to this role
    if (archived) {
      const membersCol = await getTenantMembersCollection();
      const assignedCount = await membersCol.countDocuments({
        tenantId: tenantOid,
        roleId: docOid,
        isActive: true,
      });
      if (assignedCount > 0) {
        return NextResponse.json(
          { data: null, error: `Cannot archive role: ${assignedCount} active member(s) are assigned to it` },
          { status: 409 },
        );
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
