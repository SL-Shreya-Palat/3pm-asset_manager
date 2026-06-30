/**
 * GET  /api/defect-settings/[formId]  — eligible fields + saved ticks
 * PUT  /api/defect-settings/[formId]  — upsert defect answer settings
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getDefectSettings,
  upsertDefectSettings,
} from '@/controller/defect-settings';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { formId } = await params;
    if (!ObjectId.isValid(formId)) {
      return NextResponse.json({ data: null, error: 'Invalid formId' }, { status: 400 });
    }

    const result = await getDefectSettings(user.currentTenantId, formId);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 404 });
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch (error) {
    console.error('[DEFECT_SETTINGS GET]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to load defect settings' },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { formId } = await params;
    if (!ObjectId.isValid(formId)) {
      return NextResponse.json({ data: null, error: 'Invalid formId' }, { status: 400 });
    }

    const body = await req.json();
    const result = await upsertDefectSettings(
      user.currentTenantId,
      user.id,
      formId,
      body,
    );

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch (error) {
    console.error('[DEFECT_SETTINGS PUT]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to save defect settings' },
      { status: 500 },
    );
  }
}
