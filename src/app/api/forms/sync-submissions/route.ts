/**
 * POST /api/forms/sync-submissions
 *
 * Pulls new form submissions from the form-builder-portal database,
 * resolves field.id → fieldKey, evaluates them against defect settings,
 * and creates defect rows for any detected defects.
 *
 * This endpoint bridges the gap when the form-builder-portal's webhook
 * dispatch worker is not running (e.g. no Redis / no BullMQ worker).
 *
 * Call manually or via a cron schedule. The actual pull/process logic lives in
 * `controller/inspection-submissions/sync` so the driver-inspection gate can
 * reuse it (scoped to the current driver's tenant).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { syncFormBuilderSubmissions } from '@/controller/inspection-submissions/sync';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;
    const user = auth.user;

    const result = await syncFormBuilderSubmissions(user.currentTenantId!);

    if (result.status === 'no_mapping') {
      return NextResponse.json(
        { data: null, error: 'No form-builder organization mapped to this tenant' },
        { status: 404 },
      );
    }

    if (result.totalFound === 0) {
      return NextResponse.json(
        {
          data: {
            message: 'No submissions found in form-builder-portal',
            synced: 0,
            defectsCreated: 0,
          },
          error: null,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        data: {
          message: `Sync complete. ${result.synced} new submission(s) processed.`,
          totalFound: result.totalFound,
          synced: result.synced,
          defectsCreated: result.defectsCreated,
          errors: result.errors,
        },
        error: null,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[SYNC_SUBMISSIONS]', error);
    return NextResponse.json(
      {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to sync submissions',
      },
      { status: 500 },
    );
  }
}
