/**
 * POST /api/inspection-submissions
 *
 * Submit a completed pre-start inspection form.
 * Runs the defect evaluator (§6) and creates defect rows for any ticked
 * bad answers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getInspectionSubmissionsCollection,
  getDefectsCollection,
  getFormsCollection,
} from '@/lib/mongodb';
import { evaluateSubmission } from '@/controller/defect-settings/evaluator';
import { generateDefectNumber } from '@/controller/defects/utils';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { formId, assetId, response: submissionResponse } = body;

    // Validate required fields
    if (!formId || !ObjectId.isValid(formId)) {
      return NextResponse.json({ data: null, error: 'Valid formId is required' }, { status: 400 });
    }
    if (!submissionResponse || typeof submissionResponse !== 'object') {
      return NextResponse.json({ data: null, error: 'response object is required' }, { status: 400 });
    }

    const tenantId = user.currentTenantId;
    const tenantOid = ObjectId.createFromHexString(tenantId);
    const formOid = ObjectId.createFromHexString(formId);
    const userOid = ObjectId.createFromHexString(user.id);
    const now = new Date();

    // Verify form exists
    const formsCol = await getFormsCollection();
    const form = await formsCol.findOne({ formId: formOid, tenantId: tenantOid });
    if (!form) {
      return NextResponse.json({ data: null, error: 'Form not found' }, { status: 404 });
    }

    // Run defect evaluator
    const evaluation = await evaluateSubmission(tenantId, formId, submissionResponse);

    // Save the submission record
    const submissionsCol = await getInspectionSubmissionsCollection();
    const submissionDoc = {
      tenantId: tenantOid,
      formId: formOid,
      formTitle: form.formTitle as string,
      formVersion: (form.schema?.versionNumber as number) || 1,
      assetId: assetId && ObjectId.isValid(assetId) ? ObjectId.createFromHexString(assetId) : null,
      response: submissionResponse,
      result: evaluation.result,
      defects: evaluation.defects,
      faultsComments: submissionResponse.faults_comments || null,
      photos: submissionResponse.photos || null,
      safeToOperate: submissionResponse.safe_to_operate ?? null,
      submittedBy: userOid,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const insertResult = await submissionsCol.insertOne(submissionDoc);
    const submissionId = insertResult.insertedId;

    // Create defect rows in the existing `defects` collection
    const createdDefectIds: string[] = [];

    if (evaluation.defects.length > 0 && assetId && ObjectId.isValid(assetId)) {
      const defectsCol = await getDefectsCollection();

      for (const defect of evaluation.defects) {
        const defectNumber = await generateDefectNumber(tenantId);
        const answerStr = Array.isArray(defect.answer) ? defect.answer.join(', ') : defect.answer;

        const defectDoc = {
          tenantId: tenantOid,
          defectNumber,
          name: `${defect.label} — ${answerStr}`,
          date: now,
          comment: `Auto-generated from pre-start inspection "${form.formTitle}". Field "${defect.label}" answered "${answerStr}".${
            submissionResponse.faults_comments
              ? `\n\nOperator notes: ${submissionResponse.faults_comments}`
              : ''
          }`,
          assetId: ObjectId.createFromHexString(assetId),
          assetName: '', // Will be resolved if needed
          driverId: null,
          driverName: null,
          priority: defect.severity === 'critical' ? 'high' : 'medium',
          severity: defect.severity,
          status: 'new',
          attachments: [],
          source: 'prestart_inspection',
          inspectionSubmissionId: submissionId,
          sourceFieldKey: defect.fieldKey,
          createdBy: userOid,
          updatedBy: userOid,
          createdAt: now,
          updatedAt: now,
          isArchived: false,
          archivedAt: null,
          archivedBy: null,
        };

        const res = await defectsCol.insertOne(defectDoc);
        createdDefectIds.push(res.insertedId.toString());
      }
    }

    return NextResponse.json(
      {
        data: {
          submissionId: submissionId.toString(),
          result: evaluation.result,
          defectsCreated: createdDefectIds.length,
          defectIds: createdDefectIds,
        },
        error: null,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[INSPECTION_SUBMISSION]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to submit inspection' },
      { status: 500 },
    );
  }
}
