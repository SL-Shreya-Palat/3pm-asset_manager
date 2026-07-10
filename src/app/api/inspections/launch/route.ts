/**
 * POST /api/inspections/launch
 *
 * Records an inspection launch — supports both asset-first and driver-first
 * flows. The user picked an entity (asset or driver) + form and is about to
 * fill the form in the embedded form-builder. The submission that comes back
 * (via webhook) is correlated to this launch so the inspection links to the
 * correct entity.
 *
 * Body: { formId, assetId?, driverId? }  — at least one of assetId/driverId required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { authorize, inTeamScope } from '@/lib/authz';
import { getDriverIdByEmail } from '@/controller/drivers';
import { getInspectionLaunchesCollection, getAssetsCollection, getDriversCollection } from '@/lib/mongodb';

export async function POST(req: NextRequest) {
  try {
    // Launching an inspection is the 'inspect' capability on assets.
    // Scope semantics: 'OWN' (drivers) = assets assigned to them (or unassigned)
    // and only their own driver record; team-scoped roles stay within their teams.
    const auth = await authorize(req, 'assets.assets.asset', 'inspect');
    if (!auth.ok) return auth.res;
    const { user, scope, teamIds } = auth.ctx;

    const { assetId, driverId, formId } = await req.json();
    if (!formId || !ObjectId.isValid(formId)) {
      return NextResponse.json({ data: null, error: 'Valid formId required' }, { status: 400 });
    }
    if ((!assetId || !ObjectId.isValid(assetId)) && (!driverId || !ObjectId.isValid(driverId))) {
      return NextResponse.json({ data: null, error: 'Valid assetId or driverId required' }, { status: 400 });
    }

    const tenantOid = ObjectId.createFromHexString(user.currentTenantId);

    // Build the launch record — asset and driver are both optional.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const launchDoc: Record<string, any> = {
      tenantId: tenantOid,
      formId: ObjectId.createFromHexString(formId),
      userId: ObjectId.createFromHexString(user.id),
      userEmail: user.email,
      userName: user.name || user.email,
      status: 'pending',
      createdAt: new Date(),
    };

    // Resolve the caller's own driver record once — used for OWN-scope checks.
    const driversCol = await getDriversCollection();
    const myDriverId =
      scope === 'OWN'
        ? await getDriverIdByEmail(user.currentTenantId, String(user.email || ''))
        : null;

    if (assetId && ObjectId.isValid(assetId)) {
      const assetOid = ObjectId.createFromHexString(assetId);
      const asset = await (await getAssetsCollection()).findOne({ _id: assetOid, tenantId: tenantOid });
      if (!asset) {
        return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
      }
      if (!inTeamScope(teamIds, asset.teamIds)) {
        return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
      }
      // OWN inspect: may inspect assets assigned to them (or unassigned walk-ups),
      // never an asset assigned to someone else.
      if (
        scope === 'OWN' &&
        asset.assignedDriverId &&
        asset.assignedDriverId.toString() !== myDriverId
      ) {
        return NextResponse.json(
          { data: null, error: 'This asset is assigned to another driver' },
          { status: 403 },
        );
      }
      launchDoc.assetId = assetOid;
    }

    if (driverId && ObjectId.isValid(driverId)) {
      const driverOid = ObjectId.createFromHexString(driverId);
      const driver = await driversCol.findOne({ _id: driverOid, tenantId: tenantOid });
      if (!driver) {
        return NextResponse.json({ data: null, error: 'Driver not found' }, { status: 404 });
      }
      // OWN inspect: driver-first launches must target the caller's own record.
      if (scope === 'OWN' && driverOid.toString() !== myDriverId) {
        return NextResponse.json(
          { data: null, error: 'You can only start inspections for yourself' },
          { status: 403 },
        );
      }
      if (!inTeamScope(teamIds, driver.teamId)) {
        return NextResponse.json({ data: null, error: 'Driver not found' }, { status: 404 });
      }
      launchDoc.driverId = driverOid;
    }

    const launches = await getInspectionLaunchesCollection();
    const result = await launches.insertOne(launchDoc);

    return NextResponse.json({ data: { launchId: result.insertedId.toString() }, error: null }, { status: 201 });
  } catch (error) {
    console.error('[INSPECTION_LAUNCH]', error);
    return NextResponse.json({ data: null, error: 'Failed to start inspection' }, { status: 500 });
  }
}
