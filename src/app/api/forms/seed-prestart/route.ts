/**
 * POST /api/forms/seed-prestart
 *
 * Seeds the pre-start form templates (Light Vehicle, Heavy Vehicle,
 * Plant / Excavator, Driver Wellness) for the current tenant.
 *
 * Delegates to the shared seeding service, which per template:
 *   1. Creates + publishes the form in form-builder-portal (embed API)
 *   2. Stores it in the local `forms` collection
 *   3. Pre-configures defect settings so auto-defect creation works immediately
 *
 * Idempotent — templates already seeded for the tenant are skipped.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { seedInspectionForms } from '@/controller/seeding';
import { getFormsCollection, getDb } from '@/lib/mongodb';

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

/**
 * DELETE /api/forms/seed-prestart
 *
 * Temporary helper: deletes the Driver Wellness form from the local DB
 * (forms + defect settings) so it can be re-seeded with the updated template.
 * Call POST afterwards to re-seed.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'No tenant' }, { status: 404 });
    }

    const tenantOid = ObjectId.createFromHexString(user.currentTenantId);
    const formsCol = await getFormsCollection();
    const db = await getDb();
    const defectCol = db.collection('prestartFormDefectSettings');

    // Find the Driver Wellness form to get its formId
    const form = await formsCol.findOne({
      tenantId: tenantOid,
      formTitle: 'Driver Wellness Pre-Start Check',
    });

    if (!form) {
      return NextResponse.json({
        data: { message: 'Driver Wellness form not found — ready to seed' },
        error: null,
      });
    }

    const formId = form.formId;

    // Delete from both collections
    const delForm = await formsCol.deleteOne({ _id: form._id });
    const delSettings = await defectCol.deleteMany({
      tenantId: tenantOid,
      formId: formId instanceof ObjectId ? formId : ObjectId.createFromHexString(String(formId)),
    });

    return NextResponse.json({
      data: {
        message: `Deleted Driver Wellness form (${delForm.deletedCount} form, ${delSettings.deletedCount} defect settings). Call POST to re-seed.`,
      },
      error: null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete';
    console.error('[SEED_PRESTART_DELETE]', error);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
