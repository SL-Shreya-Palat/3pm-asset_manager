/**
 * GET /api/drivers/:id/inspection-status
 *
 * Where a specific driver stands against the tenant's driver-inspection
 * schedule (up to date / due / overdue, next-due date, last completed).
 * Read by the status banner on the driver's Inspections tab.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { authorize, inTeamScope } from '@/lib/authz';
import { getDriversCollection } from '@/lib/mongodb';
import { computeDriverInspectionStatus } from '@/controller/driver-inspection-settings';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const auth = await authorize(req, 'people.drivers.driver', 'view');
    if (!auth.ok) return auth.res;
    const { user, teamIds } = auth.ctx;

    const { id: driverId } = await context.params;
    if (!ObjectId.isValid(driverId)) {
      return NextResponse.json({ data: null, error: 'Invalid driver ID' }, { status: 400 });
    }

    if (teamIds) {
      const collection = await getDriversCollection();
      const driver = await collection.findOne(
        { _id: ObjectId.createFromHexString(driverId), tenantId: ObjectId.createFromHexString(user.currentTenantId!) },
        { projection: { teamId: 1 } },
      );
      if (!driver || !inTeamScope(teamIds, driver.teamId)) {
        return NextResponse.json({ data: null, error: 'Driver not found' }, { status: 404 });
      }
    }

    const data = await computeDriverInspectionStatus(user.currentTenantId!, driverId);
    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('[DRIVER_INSPECTION_STATUS]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to compute inspection status' },
      { status: 500 },
    );
  }
}
