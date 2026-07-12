/**
 * GET  /api/assets/:id/meter-readings -- reading history (optional ?meterType=)
 * POST /api/assets/:id/meter-readings -- add a reading (advances the asset meter)
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { authorize, inTeamScope } from '@/lib/authz';
import { getAssetsCollection } from '@/lib/mongodb';
import { listMeterReadings, addMeterReading } from '@/controller/meter-readings';

type RouteContext = { params: Promise<{ id: string }> };

// Team/OWN-scoped callers may only reach assets within their scope.
async function assetScopeDenied(
  user: { id: string; currentTenantId?: string | null },
  scope: string,
  teamIds: string[] | null,
  id: string,
): Promise<boolean> {
  if (scope !== 'OWN' && !teamIds) return false;
  const collection = await getAssetsCollection();
  const asset = ObjectId.isValid(id)
    ? await collection.findOne(
        { _id: ObjectId.createFromHexString(id), tenantId: ObjectId.createFromHexString(user.currentTenantId!) },
        { projection: { teamIds: 1, createdBy: 1 } },
      )
    : null;
  return (
    !asset ||
    (scope === 'OWN' && asset.createdBy?.toString() !== user.id) ||
    !inTeamScope(teamIds, asset.teamIds)
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'assets.assets.asset', 'view');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  const { id } = await context.params;
  if (await assetScopeDenied(user, scope, teamIds, id)) {
    return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
  }
  const meterType = request.nextUrl.searchParams.get('meterType') || undefined;
  const result = await listMeterReadings(user.currentTenantId!, id, { meterType });
  return NextResponse.json({ data: result, error: null });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, 'assets.assets.asset', 'edit');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  try {
    const { id } = await context.params;
    if (await assetScopeDenied(user, scope, teamIds, id)) {
      return NextResponse.json({ data: null, error: 'Asset not found' }, { status: 404 });
    }
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
