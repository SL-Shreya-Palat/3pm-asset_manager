/**
 * POST /api/command/import-history -- { entity, cursor? }
 *
 * One BATCH of the Command → AM maintenance-history import (service programs,
 * service history, inspections, work orders). Returns { nextCursor, done } so
 * the client loops until each entity reports done — no unbounded request.
 * Requires an active Command connection, owner/admin rights, and assets
 * imported first.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  resolveConnection,
  userCanManageConnection,
} from '@/controller/command-connection';
import {
  importHistoryBatch,
  type HistoryEntity,
} from '@/controller/command-connection/history-import';

const VALID_ENTITIES = new Set<HistoryEntity>([
  'servicePlans',
  'serviceHistory',
  'inspections',
  'workOrders',
]);

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await userCanManageConnection(user.id, user.currentTenantId))) {
    return NextResponse.json(
      { data: null, error: 'Only the owner or an admin can import Command history' },
      { status: 403 },
    );
  }

  let entity: HistoryEntity;
  let cursor: number;
  try {
    const body = await request.json();
    entity = body?.entity;
    cursor = Number(body?.cursor) || 1;
    if (!VALID_ENTITIES.has(entity)) {
      return NextResponse.json({ data: null, error: 'Unknown entity' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }

  const connection = await resolveConnection(user.currentTenantId);
  if (connection.state !== 'connected' || !connection.authTenantId) {
    return NextResponse.json(
      { data: null, error: 'Command is not connected (or currently unreachable)' },
      { status: 409 },
    );
  }

  try {
    const result = await importHistoryBatch(
      user.currentTenantId,
      user.id,
      connection.authTenantId,
      entity,
      cursor,
    );
    return NextResponse.json({ data: result, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'History import batch failed';
    return NextResponse.json({ data: null, error: message }, { status: 502 });
  }
}
