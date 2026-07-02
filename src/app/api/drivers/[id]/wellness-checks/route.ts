/**
 * GET /api/drivers/:id/wellness-checks
 *
 * Returns the wellness check history for a specific driver,
 * ordered by most recent first.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getDriverWellnessChecksCollection } from '@/lib/mongodb';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: driverId } = await context.params;
    if (!ObjectId.isValid(driverId)) {
      return NextResponse.json({ data: null, error: 'Invalid driver ID' }, { status: 400 });
    }

    const tenantOid = ObjectId.createFromHexString(user.currentTenantId);
    const driverOid = ObjectId.createFromHexString(driverId);

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25')));
    const skip = (page - 1) * limit;

    const col = await getDriverWellnessChecksCollection();

    const [items, total] = await Promise.all([
      col
        .find({ tenantId: tenantOid, driverId: driverOid })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      col.countDocuments({ tenantId: tenantOid, driverId: driverOid }),
    ]);

    const mapped = items.map((doc) => ({
      id: doc._id.toString(),
      outcome: doc.outcome,
      concerns: doc.concerns || [],
      answers: doc.answers || {},
      comments: doc.comments || '',
      fitForDutyDeclared: doc.fitForDutyDeclared ?? false,
      submittedBy: doc.submittedBy || {},
      createdAt: doc.createdAt?.toISOString?.() || doc.createdAt,
    }));

    return NextResponse.json({
      data: {
        items: mapped,
        pagination: {
          page,
          limit,
          total,
          hasMore: skip + limit < total,
        },
      },
      error: null,
    });
  } catch (error) {
    console.error('[DRIVER_WELLNESS_CHECKS_LIST]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to fetch wellness checks' },
      { status: 500 },
    );
  }
}
