/**
 * PATCH /api/purchase-orders/:id/archive -- Archive or unarchive a purchase order
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { authorize } from '@/lib/authz';
import { getPurchaseOrdersCollection } from '@/lib/mongodb';

const FORM_ID = 'maintenance.purchaseOrders.purchaseOrder';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'archive');
  if (!auth.ok) return auth.res;
  const { user, scope } = auth.ctx;

  try {
    const { id } = await context.params;
    const { archived } = await request.json();

    if (typeof archived !== 'boolean') {
      return NextResponse.json({ data: null, error: 'Invalid request: "archived" must be a boolean' }, { status: 400 });
    }

    const collection = await getPurchaseOrdersCollection();
    const now = new Date();
    const userOid = ObjectId.createFromHexString(user.id);
    const tenantOid = ObjectId.createFromHexString(user.currentTenantId!);
    const docOid = ObjectId.createFromHexString(id);

    const existing = await collection.findOne({ _id: docOid, tenantId: tenantOid });
    if (!existing) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }
    if (scope === 'OWN' && existing.createdBy?.toString() !== user.id) {
      return NextResponse.json({ data: null, error: 'You can only archive records you created' }, { status: 403 });
    }

    // A PO awaiting goods can't be archived — archived POs are unreceivable, so
    // paid-for stock would silently never enter inventory. Receive it or close
    // it (vendor cancelled) first.
    if (archived && ['purchased', 'received_partial'].includes(existing.status as string)) {
      return NextResponse.json(
        {
          data: null,
          error: 'This purchase order is awaiting delivery — receive the items or close it before archiving.',
        },
        { status: 400 },
      );
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
