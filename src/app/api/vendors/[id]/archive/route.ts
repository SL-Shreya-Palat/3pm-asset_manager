/**
 * PATCH /api/vendors/:id/archive -- Archive or unarchive a vendor
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { authorize } from '@/lib/authz';
import { getVendorsCollection } from '@/lib/mongodb';
import {
  isCommandConnectionEnabled,
  MASTER_DATA_MANAGED_MESSAGE,
} from '@/controller/command-connection/guard';

const FORM_ID = 'vendors.vendors.vendor';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'archive');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const { id } = await context.params;
    const { archived } = await request.json();

    if (typeof archived !== 'boolean') {
      return NextResponse.json({ data: null, error: 'Invalid request: "archived" must be a boolean' }, { status: 400 });
    }

    const collection = await getVendorsCollection();
    const now = new Date();
    const userOid = ObjectId.createFromHexString(user.id);
    const tenantOid = ObjectId.createFromHexString(user.currentTenantId!);
    const docOid = ObjectId.createFromHexString(id);

    // Command-sourced vendors (suppliers) are master data — archived in
    // Command, not here (the guard's documented contract).
    const existing = await collection.findOne({ _id: docOid, tenantId: tenantOid });
    if (!existing) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }
    if (existing.source === 'command' && (await isCommandConnectionEnabled(user.currentTenantId!))) {
      return NextResponse.json({ data: null, error: MASTER_DATA_MANAGED_MESSAGE }, { status: 400 });
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
