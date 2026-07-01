/**
 * POST /api/dev/run-notification-scan — DEV-ONLY manual trigger for the
 * time-based notification scan (service due/overdue + work-order overdue).
 *
 * Lets you test the notification flow from the UI without the cron scheduler
 * or the CRON_SECRET bearer header. Disabled outside development (returns 403).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { env } from '@/lib/env';
import { runNotificationScan } from '@/controller/notifications/scan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!env.isDevelopment) {
    return NextResponse.json({ data: null, error: 'Not available' }, { status: 403 });
  }

  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runNotificationScan();
    return NextResponse.json({ data: result, error: null });
  } catch (err) {
    console.error('[dev/run-notification-scan] failed:', err);
    return NextResponse.json({ data: null, error: 'Scan failed' }, { status: 500 });
  }
}
