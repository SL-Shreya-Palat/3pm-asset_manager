/**
 * POST /api/forms/seed-prestart
 *
 * Seeds the three pre-start inspection form templates (Light Vehicle, Heavy
 * Vehicle, Plant / Excavator) for the current tenant.
 *
 * Delegates to the shared seeding service, which per template:
 *   1. Creates + publishes the form in form-builder-portal (embed API)
 *   2. Stores it in the local `forms` collection
 *   3. Pre-configures defect settings so auto-defect creation works immediately
 *
 * Idempotent — templates already seeded for the tenant are skipped.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { seedInspectionForms } from '@/controller/seeding';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.email) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.currentTenantId) {
      return NextResponse.json(
        { data: null, error: 'User is not associated with any tenant' },
        { status: 404 },
      );
    }

    const forms = await seedInspectionForms({
      tenantId: user.currentTenantId,
      userId: user.id,
      userEmail: user.email,
      userName: user.name || user.email,
    });

    const seeded = forms.filter((f) => f.status === 'seeded').length;
    return NextResponse.json(
      {
        data: {
          message: `Pre-start forms ready (${seeded} newly seeded, ${forms.length - seeded} already present)`,
          forms,
        },
        error: null,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to seed pre-start forms';
    console.error('[SEED_PRESTART]', error);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
