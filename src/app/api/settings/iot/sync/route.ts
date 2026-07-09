/**
 * POST /api/settings/iot/sync — manually pull the tenant's devices from the
 * IoT Hub into `assets`. Returns { totalDevices, created, updated, errors }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { requireAdmin } from '@/lib/authz';
import { syncAssetsFromIoTHub } from '@/controller/iot';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;
    const user = auth.user;
    const result = await syncAssetsFromIoTHub(
      ObjectId.createFromHexString(user.currentTenantId!),
      user.id,
    );
    // Surface a partial-failure as 200 with the error list; hard failure → 502.
    const status = result.success || result.created + result.updated > 0 ? 200 : 502;
    return NextResponse.json({ data: result, error: result.success ? null : 'Sync completed with errors' }, { status });
  } catch (error) {
    console.error('[IOT_SYNC]', error);
    return NextResponse.json({ data: null, error: 'Failed to sync from IoT Hub' }, { status: 500 });
  }
}
