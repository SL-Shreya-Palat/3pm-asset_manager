/**
 * POST /api/forms/migrate-prestart-templates
 *
 * One-shot migration: updates pre-start form schemas for ALL tenants
 * that have stale templates (older templateSchemaVersion).
 *
 * Iterates every tenant with outdated prestart forms, finds an active
 * member to mint a form-builder session, and pushes the latest schemas.
 *
 * Safe to call repeatedly — tenants already at the current version are
 * skipped automatically.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { migrateAllTenantPrestartForms } from '@/controller/seeding';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.email) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const results = await migrateAllTenantPrestartForms();

    const updated = results.filter((r) => r.status === 'updated').length;
    const errors = results.filter((r) => r.status === 'error').length;

    return NextResponse.json({
      data: {
        message: `Migration complete: ${updated} tenants updated, ${errors} errors, ${results.length} total`,
        results,
      },
      error: null,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to migrate prestart templates';
    console.error('[MIGRATE_PRESTART_TEMPLATES]', error);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
