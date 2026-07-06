/**
 * GET /api/cron/command-outbox — replay queued Command write-backs.
 *
 * Write-backs that failed while Command was unreachable sit in the
 * commandOutbox collection; this replays them oldest-first. Call it on a
 * schedule (e.g. every 5-15 minutes) with Authorization: Bearer <CRON_SECRET>.
 * Idempotent per row: a replayed row is deleted on success.
 */
import { NextRequest, NextResponse } from 'next/server';
import { processCommandOutbox } from '@/controller/command-connection/outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
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
    const result = await processCommandOutbox();
    return NextResponse.json({ data: result, error: null });
  } catch (err) {
    console.error('[cron/command-outbox] replay failed:', err);
    return NextResponse.json({ data: null, error: 'Replay failed' }, { status: 500 });
  }
}
