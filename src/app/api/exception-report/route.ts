/**
 * GET /api/exception-report — calendar-grid data (asset × form × day).
 *
 * Computed on the fly from inspection submissions (no stored status collection).
 * Query params:
 *   from, to   — inclusive `yyyy-MM-dd` range (required)
 *   formIds    — csv of form hex ids (optional; default all forms)
 *   teamIds    — csv of team hex ids (optional; default all teams)
 *   tz         — caller timezone offset in minutes, from getTimezoneOffset()
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getExceptionReport } from '@/controller/exception-report';

const csv = (v: string | null): string[] =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const from = sp.get('from');
    const to = sp.get('to');
    if (!from || !to) {
      return NextResponse.json(
        { data: null, error: 'from and to (yyyy-MM-dd) are required' },
        { status: 400 },
      );
    }

    const tzRaw = sp.get('tz');
    const tzOffsetMinutes = tzRaw != null && !Number.isNaN(Number(tzRaw)) ? Number(tzRaw) : 0;

    const data = await getExceptionReport(user.currentTenantId, {
      from,
      to,
      formIds: csv(sp.get('formIds')),
      teamIds: csv(sp.get('teamIds')),
      tzOffsetMinutes,
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('[EXCEPTION_REPORT]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to load exception report' },
      { status: 500 },
    );
  }
}
