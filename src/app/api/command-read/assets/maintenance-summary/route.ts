/**
 * POST /api/command-read/assets/maintenance-summary
 *
 * Bulk reverse read-through for Command's ASSET LIST. Given a page of Command
 * asset ids, returns each asset's live maintenance summary from Asset Manager —
 * the combined fault+defect count and out-of-service state — so Command's card /
 * list badges stay consistent with AM without a per-row round-trip (one call per
 * page). Assets not managed here are simply absent from the result (Command then
 * keeps its local values).
 *
 * Auth: a Command SERVICE call (X-Client-Id/X-Client-Secret + X-Tenant-Id — see
 * the Command service branch in lib/auth-helper.ts). Assets are addressed by
 * their Command ids (stored as `commandAssetId`).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getAssetsCollection, getDefectsCollection } from '@/lib/mongodb';

const MAX_IDS = 5000;

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const rawIds = Array.isArray(body?.commandAssetIds) ? body.commandAssetIds : [];
  const commandAssetIds = rawIds
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, MAX_IDS);

  if (commandAssetIds.length === 0) {
    return NextResponse.json({ data: { summaries: {} }, error: null });
  }

  const tenantOid = ObjectId.createFromHexString(user.currentTenantId);

  // Resolve the local AM assets from their Command ids.
  const assetsCol = await getAssetsCollection();
  const assets = await assetsCol
    .find(
      { tenantId: tenantOid, commandAssetId: { $in: commandAssetIds }, source: 'command' },
      { projection: { _id: 1, commandAssetId: 1, status: 1 } },
    )
    .toArray();

  if (assets.length === 0) {
    return NextResponse.json({ data: { summaries: {} }, error: null });
  }

  // One grouped count over the defects collection (holds BOTH manual faults and
  // pre-start defects) — combined "faults" tally per asset, matching the detail.
  const localIds = assets.map((a) => a._id as ObjectId);
  const counts = await (await getDefectsCollection())
    .aggregate([
      { $match: { tenantId: tenantOid, assetId: { $in: localIds }, isArchived: { $ne: true } } },
      { $group: { _id: '$assetId', count: { $sum: 1 } } },
    ])
    .toArray();

  const countByAsset = new Map<string, number>();
  for (const c of counts) countByAsset.set(String(c._id), c.count as number);

  const summaries: Record<string, { faultCount: number; outOfService: boolean }> = {};
  for (const a of assets) {
    const commandId = a.commandAssetId as string;
    summaries[commandId] = {
      faultCount: countByAsset.get(String(a._id)) ?? 0,
      outOfService: (a.status as string) === 'out_of_service',
    };
  }

  return NextResponse.json({ data: { summaries }, error: null });
}
