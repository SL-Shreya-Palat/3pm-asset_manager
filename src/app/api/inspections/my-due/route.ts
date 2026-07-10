/**
 * GET /api/inspections/my-due
 *
 * Driver-facing: does the CURRENT user (as a driver) owe an inspection this
 * period? Resolves user → driver, then computes status from the tenant's
 * driver-inspection policy + the driver's submission history. Powers the
 * in-app DriverInspectionGate.
 *
 * Query: ?sync=1 → best-effort pull of the driver's just-submitted form from the
 * form-builder DB first, so the gate clears without a running webhook worker.
 *
 * Non-drivers (and users with no linked driver record) get { due: false }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getDriverByUserId } from '@/controller/drivers';
import { computeDriverInspectionStatus } from '@/controller/driver-inspection-settings';
import { syncFormBuilderSubmissions } from '@/controller/inspection-submissions/sync';

/** Shape returned when the user isn't a driver / nothing is owed. */
const NOT_DUE = {
  enabled: false,
  due: false,
  status: 'disabled' as const,
  frequency: 'daily' as const,
  formId: null,
  formTitle: null,
  driverId: null,
  lastCompletedAt: null,
  nextDueAt: null,
};

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = user.currentTenantId;

    // Pick up a just-submitted check before evaluating (best-effort).
    const sync = req.nextUrl.searchParams.get('sync') === '1';
    if (sync) {
      try {
        await syncFormBuilderSubmissions(tenantId);
      } catch (err) {
        console.error('[MY_DUE] sync failed (non-fatal):', err);
      }
    }

    const driver = await getDriverByUserId(tenantId, user.id);
    if (!driver) {
      return NextResponse.json({ data: NOT_DUE, error: null });
    }

    const status = await computeDriverInspectionStatus(tenantId, driver.id);
    return NextResponse.json({ data: status, error: null });
  } catch (error) {
    console.error('[MY_DUE]', error);
    // Fail open — a gate error must never lock a driver out of the app.
    return NextResponse.json({ data: NOT_DUE, error: null });
  }
}
