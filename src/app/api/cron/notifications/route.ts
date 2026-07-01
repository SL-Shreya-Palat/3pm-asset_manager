/**
 * GET /api/cron/notifications — periodic scan for time-based notifications
 * (service due/overdue, work orders overdue). Call this on a schedule you control
 * (e.g. once or twice a day) with an Authorization: Bearer <CRON_SECRET> header.
 *
 * Protected by the CRON_SECRET env var so only your scheduler can trigger it.
 * Idempotent/deduped — running it repeatedly won't spam users.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runNotificationScan } from '@/controller/notifications/scan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Give the scan room to run across all tenants (host must allow it; on a normal
// Node server there's no cap — this only matters on serverless platforms).
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization');

  if (!secret) {
    return NextResponse.json(
      { data: null, error: 'CRON_SECRET is not configured' },
      { status: 500 },
    );
  }
  if (provided !== `Bearer ${secret}`) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runNotificationScan();
    return NextResponse.json({ data: result, error: null });
  } catch (err) {
    console.error('[cron/notifications] scan failed:', err);
    return NextResponse.json({ data: null, error: 'Scan failed' }, { status: 500 });
  }
}
