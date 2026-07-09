/**
 * GET/PUT /api/settings/meters — per-tenant meter policy.
 *
 * GET → current settings (defaults if never configured).
 * PUT → save whether work-order / service meter readings advance the asset's
 *       current meter, or are kept as reference on the service record only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { getMeterSettings, saveMeterSettings } from '@/controller/meter-settings';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;
    const user = auth.user;
    const data = await getMeterSettings(user.currentTenantId!);
    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('[METER_SETTINGS_GET]', error);
    return NextResponse.json({ data: null, error: 'Failed to load meter settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;
    const user = auth.user;
    const body = await req.json().catch(() => ({}));
    if (typeof body.serviceUpdatesCurrentMeter !== 'boolean') {
      return NextResponse.json(
        { data: null, error: 'serviceUpdatesCurrentMeter (boolean) is required' },
        { status: 400 },
      );
    }
    const data = await saveMeterSettings(user.currentTenantId!, user.id, {
      serviceUpdatesCurrentMeter: body.serviceUpdatesCurrentMeter,
    });
    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('[METER_SETTINGS_PUT]', error);
    return NextResponse.json({ data: null, error: 'Failed to save meter settings' }, { status: 400 });
  }
}
