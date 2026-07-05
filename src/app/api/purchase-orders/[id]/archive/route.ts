/**
 * PATCH /api/purchase-orders/:id/archive -- Archive or unarchive a purchase order
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getPurchaseOrdersCollection } from '@/lib/mongodb';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const { archived } = await request.json();

    if (typeof archived !== 'boolean') {
      return NextResponse.json({ data: null, error: 'Invalid request: "archived" must be a boolean' }, { status: 400 });
    }

    const collection = await getPurchaseOrdersCollection();
    const now = new Date();
    const userOid = ObjectId.createFromHexString(user.id);
    const tenantOid = ObjectId.createFromHexString(user.currentTenantId);
    const docOid = ObjectId.createFromHexString(id);

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
