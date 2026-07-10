/**
 * POST /api/assets/:id/service-entries -- Log a completed service for the asset.
 * Records serviceHistory, updates the asset's last-service + meter, and resets
 * the schedule (due-status recomputes from the new baseline).
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { logServiceEntry } from '@/controller/service-history';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  // Writes a financial service record and resets the service schedule — edit
  // rights on the asset, not view.
  const auth = await authorize(request, 'assets.assets.asset', 'edit');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await logServiceEntry(user.currentTenantId!, user.id, { ...body, assetId: id });

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ data: result.data, error: null }, { status: 201 });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
