/**
 * PATCH /api/forms/:formId/inspection-type
 *
 * Sets whether a form is an Asset inspection or a Driver inspection.
 * Body: { inspectionType: 'asset' | 'driver' }.
 * This is the manual toggle that overrides the name-based smart default.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { updateFormInspectionType } from '@/controller/forms';

type RouteContext = { params: Promise<{ formId: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;
    const user = auth.user;

    const { formId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const inspectionType = body?.inspectionType;
    if (inspectionType !== 'asset' && inspectionType !== 'driver') {
      return NextResponse.json(
        { data: null, error: "inspectionType must be 'asset' or 'driver'" },
        { status: 400 },
      );
    }

    const ok = await updateFormInspectionType(user.currentTenantId!, formId, inspectionType);
    if (!ok) {
      return NextResponse.json({ data: null, error: 'Form not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { inspectionType }, error: null });
  } catch (error) {
    console.error('[FORM_INSPECTION_TYPE]', error);
    return NextResponse.json({ data: null, error: 'Failed to update form type' }, { status: 500 });
  }
}
