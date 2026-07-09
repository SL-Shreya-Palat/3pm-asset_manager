/**
 * GET  /api/assets/:id/meter-readings -- reading history (optional ?meterType=)
 * POST /api/assets/:id/meter-readings -- add a reading (advances the asset meter)
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { listMeterReadings, addMeterReading } from '@/controller/meter-readings';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'assets.assets.asset', 'view');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const { id } = await context.params;
  const meterType = request.nextUrl.searchParams.get('meterType') || undefined;
  const result = await listMeterReadings(user.currentTenantId!, id, { meterType });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'assets.assets.asset', 'edit');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await addMeterReading(user.currentTenantId!, user.id, id, body);
    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
