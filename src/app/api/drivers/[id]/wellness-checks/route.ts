/**
 * GET /api/drivers/:id/wellness-checks
 *
 * Returns the inspection submission history for a specific driver,
 * ordered by most recent first. Queries the inspectionSubmissions
 * collection filtered by driverId.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { authorize, inTeamScope } from '@/lib/authz';
import { getDriversCollection } from '@/lib/mongodb';
import { listInspectionSubmissions } from '@/controller/inspection-submissions';

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

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25')));

    const data = await listInspectionSubmissions(user.currentTenantId!, {
      page,
      limit,
      driverId,
      full: true,
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('[DRIVER_WELLNESS_CHECKS_LIST]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to fetch wellness checks' },
      { status: 500 },
    );
  }
}
