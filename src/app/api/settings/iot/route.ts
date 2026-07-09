/**
 * GET/PUT /api/settings/iot — per-tenant IoT Hub configuration.
 *
 * GET  → current settings (empty defaults if never configured).
 * PUT  → save providers + auth keys (+ optional linked client id).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { requireAdmin } from '@/lib/authz';
import { getIoTSettings, saveIoTSettings } from '@/controller/iot';
import type { IoTSettingsInput } from '@/controller/iot';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;
    const user = auth.user;
    const data = await getIoTSettings(ObjectId.createFromHexString(user.currentTenantId!));
    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('[IOT_SETTINGS_GET]', error);
    return NextResponse.json({ data: null, error: 'Failed to load IoT settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;
    const user = auth.user;
    const body = (await req.json()) as IoTSettingsInput;
    if (!Array.isArray(body.providerNames)) {
      return NextResponse.json(
        { data: null, error: 'providerNames (array) is required' },
        { status: 400 },
      );
    }
    const data = await saveIoTSettings(
      body,
      ObjectId.createFromHexString(user.currentTenantId!),
      user.id,
    );
    return NextResponse.json({ data, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save IoT settings';
    console.error('[IOT_SETTINGS_PUT]', error);
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
