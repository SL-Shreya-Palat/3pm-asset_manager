/**
 * POST /api/inspections/launch
 *
 * Records an asset-first inspection launch: the user picked an asset + form and
 * is about to fill the form in the embedded form-builder. The submission that
 * comes back (via the form-builder webhook) is correlated to this launch so the
 * inspection + defects link to the exact asset — without relying on the driver
 * typing a unit number.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getInspectionLaunchesCollection, getAssetsCollection } from '@/lib/mongodb';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { assetId, formId } = await req.json();
    if (!assetId || !ObjectId.isValid(assetId) || !formId || !ObjectId.isValid(formId)) {
      return NextResponse.json({ data: null, error: 'Valid assetId and formId required' }, { status: 400 });
    }

    const tenantOid = ObjectId.createFromHexString(user.currentTenantId);
    const assetOid = ObjectId.createFromHexString(assetId);

    // Verify the asset belongs to this tenant.
    const asset = await (await getAssetsCollection()).findOne({ _id: assetOid, tenantId: tenantOid });
    if (!asset) {
      return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
    }

    const launches = await getInspectionLaunchesCollection();
    const now = new Date();
    const result = await launches.insertOne({
      tenantId: tenantOid,
      assetId: assetOid,
      formId: ObjectId.createFromHexString(formId),
      // Operator = the person performing the inspection (the logged-in user).
      userId: ObjectId.createFromHexString(user.id),
      userEmail: user.email,
      userName: user.name || user.email,
      status: 'pending',
      createdAt: now,
    });

    return NextResponse.json({ data: { launchId: result.insertedId.toString() }, error: null }, { status: 201 });
  } catch (error) {
    console.error('[INSPECTION_LAUNCH]', error);
    return NextResponse.json({ data: null, error: 'Failed to start inspection' }, { status: 500 });
  }
}
