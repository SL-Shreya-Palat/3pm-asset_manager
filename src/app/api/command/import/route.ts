/**
 * POST /api/command/import -- { entities: ('assets'|'drivers'|'vendors'|'locations')[] }
 *
 * Imports/refreshes Command master data for the current tenant (idempotent).
 * Requires an active Command connection and owner/admin rights.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  resolveConnection,
  userCanManageConnection,
} from '@/controller/command-connection';
import {
  importFromCommand,
  type ImportEntity,
} from '@/controller/command-connection/import';

const VALID_ENTITIES = new Set<ImportEntity>(['assets', 'drivers', 'vendors', 'locations', 'stock']);

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await userCanManageConnection(user.id, user.currentTenantId))) {
    return NextResponse.json(
      { data: null, error: 'Only the owner or an admin can import Command data' },
      { status: 403 },
    );
  }

  let entities: ImportEntity[];
  try {
    const body = await request.json();
    entities = (Array.isArray(body?.entities) ? body.entities : []).filter(
      (e: unknown): e is ImportEntity => VALID_ENTITIES.has(e as ImportEntity),
    );
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid request body' }, { status: 400 });
  }
  if (!entities.length) {
    return NextResponse.json({ data: null, error: 'No entities selected' }, { status: 400 });
  }

  const connection = await resolveConnection(user.currentTenantId);
  if (connection.state !== 'connected' || !connection.authTenantId) {
    return NextResponse.json(
      { data: null, error: 'Command is not connected (or currently unreachable)' },
      { status: 409 },
    );
  }

  const { summary, errors } = await importFromCommand(
    user.currentTenantId,
    user.id,
    connection.authTenantId,
    entities,
  );

  const errorMsg = Object.entries(errors)
    .map(([entity, msg]) => `${entity}: ${msg}`)
    .join('; ');

  return NextResponse.json({
    data: summary,
    error: errorMsg || null,
  });
}
