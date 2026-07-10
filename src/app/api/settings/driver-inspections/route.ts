/**
 * GET/PUT /api/settings/driver-inspections — per-tenant driver-inspection policy.
 *
 * GET → current settings (defaults if never configured).
 * PUT → save whether driver inspections are required, which driver-type form
 *       drivers must complete, and how often (daily / weekly / monthly).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import {
  getDriverInspectionSettings,
  saveDriverInspectionSettings,
} from '@/controller/driver-inspection-settings';
import { DRIVER_INSPECTION_FREQUENCIES } from '@/controller/driver-inspection-settings/types';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;
    const data = await getDriverInspectionSettings(auth.user.currentTenantId!);
    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('[DRIVER_INSPECTION_SETTINGS_GET]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to load driver inspection settings' },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;
    const user = auth.user;
    const body = await req.json().catch(() => ({}));

    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { data: null, error: 'enabled (boolean) is required' },
        { status: 400 },
      );
    }
    if (!DRIVER_INSPECTION_FREQUENCIES.includes(body.frequency)) {
      return NextResponse.json(
        { data: null, error: `frequency must be one of: ${DRIVER_INSPECTION_FREQUENCIES.join(', ')}` },
        { status: 400 },
      );
    }
    // A form is required to actually enforce the policy.
    if (body.enabled && !body.formId) {
      return NextResponse.json(
        { data: null, error: 'Select an inspection form before turning driver inspections on' },
        { status: 400 },
      );
    }

    const data = await saveDriverInspectionSettings(user.currentTenantId!, user.id, {
      enabled: body.enabled,
      formId: body.formId ?? null,
      frequency: body.frequency,
    });
    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('[DRIVER_INSPECTION_SETTINGS_PUT]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to save driver inspection settings' },
      { status: 400 },
    );
  }
}
