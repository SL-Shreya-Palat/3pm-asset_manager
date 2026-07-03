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
import { seedInspectionForms, updateInspectionForms, getOrCreateFbSession, fbFetch } from '@/controller/seeding';
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
 * PUT /api/forms/seed-prestart
 *
 * Updates already-seeded pre-start form templates with the latest schemas.
 * Use this after template definitions have changed (e.g. fields added/removed,
 * required flags changed) to push updates to all existing forms.
 */
export async function PUT(req: NextRequest) {
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

    const forms = await updateInspectionForms({
      tenantId: user.currentTenantId,
      userId: user.id,
      userEmail: user.email,
      userName: user.name || user.email,
    });

    const updated = forms.filter((f) => f.status === 'updated').length;
    return NextResponse.json({
      data: {
        message: `Pre-start forms updated (${updated} updated, ${forms.length - updated} not found)`,
        forms,
      },
      error: null,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to update pre-start forms';
    console.error('[SEED_PRESTART_UPDATE]', error);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/forms/seed-prestart
 *
 * Deletes ALL Driver Wellness forms — both the local DB records (forms +
 * defect settings) AND the corresponding form-builder forms, including any
 * orphaned duplicates. Call POST afterwards to re-seed a clean copy.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.email) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'No tenant' }, { status: 404 });
    }

    const tenantOid = ObjectId.createFromHexString(user.currentTenantId);
    const formsCol = await getFormsCollection();
    const db = await getDb();
    const defectCol = db.collection('prestartFormDefectSettings');

    // Find ALL local Driver Wellness forms for the tenant
    const localForms = await formsCol
      .find({ tenantId: tenantOid, formTitle: 'Driver Wellness Pre-Start Check' })
      .toArray();

    const localFormIds = new Set(
      localForms.map((f) =>
        f.formId instanceof ObjectId ? f.formId.toHexString() : String(f.formId),
      ),
    );

    // Get form-builder session for cleanup
    let sessionId: string | null = null;
    try {
      const session = await getOrCreateFbSession(user.email, user.name || user.email);
      sessionId = session.sessionId;
    } catch {
      // Continue with local cleanup even if form-builder session fails
    }

    let deletedLocal = 0;
    let deletedSettings = 0;
    let deletedFb = 0;

    // Delete local forms + their form-builder counterparts
    for (const form of localForms) {
      const formId = form.formId;
      const formIdStr = formId instanceof ObjectId ? formId.toHexString() : String(formId);

      // Delete from form-builder (best-effort)
      if (sessionId) {
        try {
          await fbFetch(`/forms/${formIdStr}`, sessionId, 'DELETE');
          deletedFb++;
        } catch {
          // Form may already be deleted from form-builder
        }
      }

      // Delete from local forms collection
      const delForm = await formsCol.deleteOne({ _id: form._id });
      deletedLocal += delForm.deletedCount;

      // Delete associated defect settings
      const delSettings = await defectCol.deleteMany({
        tenantId: tenantOid,
        formId: formId instanceof ObjectId ? formId : ObjectId.createFromHexString(formIdStr),
      });
      deletedSettings += delSettings.deletedCount;
    }

    // Also clean up orphaned Driver Wellness forms in form-builder (forms that
    // exist in form-builder but have no local reference — e.g. from a previous
    // delete + re-seed cycle that left stale form-builder entries).
    if (sessionId) {
      try {
        const fbForms = await fbFetch('/forms', sessionId, 'GET');
        const allFbForms = Array.isArray(fbForms) ? fbForms : (fbForms?.items ?? []);
        for (const fbForm of allFbForms) {
          const title = fbForm.title || fbForm.formTitle || '';
          const fbId = fbForm.id || fbForm._id || '';
          if (title === 'Driver Wellness Pre-Start Check' && !localFormIds.has(String(fbId))) {
            try {
              await fbFetch(`/forms/${fbId}`, sessionId, 'DELETE');
              deletedFb++;
            } catch {
              // Best-effort
            }
          }
        }
      } catch {
        // Best-effort orphan cleanup
      }
    }

    if (deletedLocal === 0 && deletedFb === 0) {
      return NextResponse.json({
        data: { message: 'No Driver Wellness forms found — ready to seed' },
        error: null,
      });
    }

    return NextResponse.json({
      data: {
        message: `Cleaned up Driver Wellness forms (${deletedLocal} local, ${deletedFb} form-builder, ${deletedSettings} defect settings). Call POST to re-seed.`,
      },
      error: null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete';
    console.error('[SEED_PRESTART_DELETE]', error);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
