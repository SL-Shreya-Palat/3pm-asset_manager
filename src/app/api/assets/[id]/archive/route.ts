/**
 * PATCH /api/assets/:id/archive -- Archive or unarchive an asset
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { authorize, inTeamScope } from '@/lib/authz';
import { getAssetsCollection } from '@/lib/mongodb';

const FORM_ID = 'assets.assets.asset';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorize(request, FORM_ID, 'archive');
  if (!auth.ok) return auth.res;
  const { user, scope, teamIds } = auth.ctx;

  try {
    const { id } = await context.params;
    const { archived } = await request.json();

    if (typeof archived !== 'boolean') {
      return NextResponse.json({ data: null, error: 'Invalid request: "archived" must be a boolean' }, { status: 400 });
    }

    const collection = await getAssetsCollection();
    const now = new Date();
    const userOid = ObjectId.createFromHexString(user.id);
    const tenantOid = ObjectId.createFromHexString(user.currentTenantId!);
    const docOid = ObjectId.createFromHexString(id);

    if (scope === 'OWN' || teamIds) {
      const existing = await collection.findOne({ _id: docOid, tenantId: tenantOid });
      if (
        !existing ||
        (scope === 'OWN' && existing.createdBy?.toString() !== user.id) ||
        !inTeamScope(teamIds, existing.teamIds)
      ) {
        return NextResponse.json({ data: null, error: 'You can only archive records within your scope' }, { status: 403 });
      }
    }

    const result = await collection.updateOne(
      { _id: docOid, tenantId: tenantOid },
      {
        $set: {
          isArchived: archived,
          archivedAt: archived ? now : null,
          archivedBy: archived ? userOid : null,
          updatedBy: userOid,
          updatedAt: now,
        },
      },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
}
