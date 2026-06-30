import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { storeForm, deleteFormByFormId } from '@/controller/forms';
import { evaluateSubmission } from '@/controller/defect-settings/evaluator';
import { generateDefectNumber } from '@/controller/defects/utils';
import {
  getInspectionSubmissionsCollection,
  getDefectsCollection,
  getFormsCollection,
  getFormBuilderOrgMappingsCollection,
} from '@/lib/mongodb';

/**
 * Resolve tenantId from an organizationId string via the org→tenant mapping collection.
 */
async function resolveTenantId(organizationId: string): Promise<string | null> {
  try {
    const col = await getFormBuilderOrgMappingsCollection();
    const doc = await col.findOne({ organizationId });
    if (!doc || !doc.tenantId) return null;
    return doc.tenantId instanceof ObjectId
      ? doc.tenantId.toHexString()
      : doc.tenantId.toString();
  } catch {
    return null;
  }
}

/**
 * Handle form.submission.created — runs the defect evaluator and creates
 * defect rows when answers match ticked defect triggers.
 */
async function handleSubmissionCreated(data: Record<string, unknown>) {
  const organizationId = data.organizationId as string;
  const formId = data.formId as string;
  const response = data.response as Record<string, unknown> | undefined;
  const submissionId = data.submissionId as string | undefined;
  const submittedBy = data.submittedBy as string | undefined;
  const submitterInfo = data.submitterInfo as Record<string, unknown> | undefined;
  const formVersion = (data.formVersion as number) || 1;

  if (!organizationId || !formId) {
    throw new Error('Missing organizationId or formId in submission payload');
  }
  if (!response || typeof response !== 'object') {
    throw new Error('Missing or invalid response in submission payload');
  }

  // Resolve tenantId from the org mapping
  const tenantId = await resolveTenantId(organizationId);
  if (!tenantId) {
    throw new Error(`Could not resolve tenantId for organizationId: ${organizationId}`);
  }

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const formOid = ObjectId.createFromHexString(formId);
  const now = new Date();

  // Load the form to get title, etc.
  const formsCol = await getFormsCollection();
  const form = await formsCol.findOne({ formId: formOid, tenantId: tenantOid });
  if (!form) {
    console.warn(`[WEBHOOK] Form ${formId} not found in asset-manager for tenant ${tenantId}. Skipping submission evaluation.`);
    return { result: 'skipped', reason: 'form_not_found', defectsCreated: 0 };
  }

  // Run the defect evaluator
  const evaluation = await evaluateSubmission(tenantId, formId, response);

  // Save the submission record
  const submissionsCol = await getInspectionSubmissionsCollection();
  const submissionDoc = {
    tenantId: tenantOid,
    formId: formOid,
    formTitle: form.formTitle as string,
    formVersion,
    assetId: null, // Not available from webhook — can be enriched later
    response,
    result: evaluation.result,
    defects: evaluation.defects,
    faultsComments: (response.faults_comments as string) || null,
    photos: response.photos || null,
    safeToOperate: response.safe_to_operate ?? null,
    submittedBy: submittedBy || null,
    submitterInfo: submitterInfo || null,
    externalSubmissionId: submissionId || null,
    submittedAt: data.submittedAt ? new Date(data.submittedAt as string) : now,
    createdAt: now,
    updatedAt: now,
    source: 'webhook',
  };

  const insertResult = await submissionsCol.insertOne(submissionDoc);
  const localSubmissionId = insertResult.insertedId;

  // Create defect rows in the existing defects collection
  const createdDefectIds: string[] = [];

  if (evaluation.defects.length > 0) {
    const defectsCol = await getDefectsCollection();

    for (const defect of evaluation.defects) {
      const defectNumber = await generateDefectNumber(tenantId);
      const answerStr = Array.isArray(defect.answer)
        ? defect.answer.join(', ')
        : defect.answer;

      const defectDoc = {
        tenantId: tenantOid,
        defectNumber,
        name: `${defect.label} — ${answerStr}`,
        date: now,
        comment: `Auto-generated from pre-start inspection "${form.formTitle}". Field "${defect.label}" answered "${answerStr}".${
          response.faults_comments
            ? `\n\nOperator notes: ${response.faults_comments}`
            : ''
        }`,
        assetId: null,
        assetName: '',
        driverId: null,
        driverName: null,
        priority: defect.severity === 'critical' ? 'high' : 'medium',
        severity: defect.severity,
        status: 'new',
        attachments: [],
        source: 'prestart_inspection',
        inspectionSubmissionId: localSubmissionId,
        sourceFieldKey: defect.fieldKey,
        createdBy: null,
        updatedBy: null,
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

  console.log(
    `[WEBHOOK] Submission processed for form ${formId}: result=${evaluation.result}, defectsCreated=${createdDefectIds.length}`,
  );

  return {
    submissionId: localSubmissionId.toString(),
    result: evaluation.result,
    defectsCreated: createdDefectIds.length,
    defectIds: createdDefectIds,
  };
}

/**
 * POST /api/forms/webhook
 *
 * Webhook endpoint to receive events from form-builder-portal.
 *
 * Supported events:
 * - form.created / form.updated  — sync form to local DB
 * - form.deleted                 — remove form from local DB
 * - form.submission.created      — evaluate submission against defect settings, create defects
 */
export async function POST(req: NextRequest) {
  try {
    // Verify API key
    const apiKey =
      req.headers.get('X-Webhook-API-Key') || req.headers.get('X-API-Key');

    if (!apiKey) {
      return NextResponse.json(
        {
          data: null,
          error:
            'Unauthorized. Missing API key in header. Please provide X-Webhook-API-Key or X-API-Key header.',
        },
        { status: 401 },
      );
    }

    const expectedApiKey = process.env.WEBHOOK_SHARED_SECRET;

    if (!expectedApiKey) {
      console.error('WEBHOOK_SHARED_SECRET environment variable is not set');
      return NextResponse.json(
        {
          data: null,
          error: 'Server configuration error. Please contact administrator.',
        },
        { status: 500 },
      );
    }

    if (apiKey.length !== expectedApiKey.length || apiKey !== expectedApiKey) {
      return NextResponse.json(
        { data: null, error: 'Unauthorized. Invalid API key.' },
        { status: 401 },
      );
    }

    const body = await req.json();

    // Validate payload structure
    if (!body.event || !body.data) {
      return NextResponse.json(
        {
          data: null,
          error: "Invalid webhook payload. Missing 'event' or 'data' field.",
        },
        { status: 400 },
      );
    }

    const validEvents = [
      'form.created',
      'form.updated',
      'form.deleted',
      'form.submission.created',
    ];
    if (!validEvents.includes(body.event)) {
      return NextResponse.json(
        {
          data: null,
          error: `Unsupported event type: ${body.event}. Supported events: ${validEvents.join(', ')}`,
        },
        { status: 400 },
      );
    }

    const data = body.data;
    const eventType = body.event as string;

    // ── form.submission.created ─────────────────────────────────────────────
    if (eventType === 'form.submission.created') {
      const result = await handleSubmissionCreated(data);
      return NextResponse.json(
        { data: { event: eventType, ...result }, error: null },
        { status: 200 },
      );
    }

    // ── form.deleted ────────────────────────────────────────────────────────
    if (eventType === 'form.deleted') {
      if (
        !data.organizationId ||
        !data.formId ||
        !data.formTitle ||
        !data.deletedAt ||
        !data.deletedBy
      ) {
        return NextResponse.json(
          {
            data: null,
            error:
              'Invalid webhook data for form.deleted. Missing required fields: organizationId, formId, formTitle, deletedAt, or deletedBy.',
          },
          { status: 400 },
        );
      }

      const deleteResult = await deleteFormByFormId(data.formId);

      return NextResponse.json(
        {
          data: {
            formId: data.formId,
            event: eventType,
            success: deleteResult.success,
            message: deleteResult.success
              ? 'Form deletion processed'
              : deleteResult.message,
          },
          error: null,
        },
        { status: 200 },
      );
    }

    // ── form.created / form.updated ─────────────────────────────────────────
    if (
      !data.organizationId ||
      !data.formId ||
      !data.formTitle ||
      !data.createdAt ||
      !data.createdBy ||
      !data.status
    ) {
      return NextResponse.json(
        {
          data: null,
          error:
            'Invalid webhook data. Missing required fields: organizationId, formId, formTitle, createdAt, createdBy, or status.',
        },
        { status: 400 },
      );
    }

    const form = await storeForm(data);

    return NextResponse.json(
      {
        data: {
          message: `Form ${eventType === 'form.created' ? 'creation' : 'update'} processed`,
          formId: data.formId,
          versionNumber: data.schema?.versionNumber || null,
          event: eventType,
          form,
        },
        error: null,
      },
      { status: eventType === 'form.created' ? 201 : 200 },
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to process webhook';
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { data: null, error: errorMessage },
      { status: 500 },
    );
  }
}

/**
 * GET /api/forms/webhook
 * Health check endpoint for webhook
 */
export async function GET() {
  return NextResponse.json(
    {
      message: 'Form webhook endpoint is active',
      endpoint: '/api/forms/webhook',
      method: 'POST',
      supportedEvents: [
        'form.created',
        'form.updated',
        'form.deleted',
        'form.submission.created',
      ],
    },
    { status: 200 },
  );
}
