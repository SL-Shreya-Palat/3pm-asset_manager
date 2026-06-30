import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { storeForm, deleteFormByFormId } from '@/controller/forms';
import { processInspectionSubmission } from '@/controller/inspection-submissions';
import { getFormBuilderOrgMappingsCollection } from '@/lib/mongodb';

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
 * Handle form.submission.created — delegates to the shared submission processor,
 * which normalizes the response keys, evaluates defect settings, links the asset,
 * and creates defect rows. (One code path shared with sync + in-app submit.)
 */
async function handleSubmissionCreated(data: Record<string, unknown>) {
  const organizationId = data.organizationId as string;
  const formId = data.formId as string;
  const response = data.response as Record<string, unknown> | undefined;
  const submissionId = data.submissionId as string | undefined;
  const submittedBy = data.submittedBy as string | undefined;
  const submitterInfo = data.submitterInfo as Record<string, unknown> | undefined;
  const formVersion = (data.formVersion as number) || undefined;

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

  const result = await processInspectionSubmission({
    tenantId,
    formId,
    rawResponse: response,
    source: 'webhook',
    formVersion,
    submittedBy: submittedBy || null,
    submitterInfo: submitterInfo || null,
    externalSubmissionId: submissionId || null,
    submittedAt: data.submittedAt ? new Date(data.submittedAt as string) : undefined,
  });

  if (result.status === 'form_not_found') {
    console.warn(
      `[WEBHOOK] Form ${formId} not found in asset-manager for tenant ${tenantId}. Skipping submission evaluation.`,
    );
    return { result: 'skipped', reason: 'form_not_found', defectsCreated: 0 };
  }

  console.log(
    `[WEBHOOK] Submission processed for form ${formId}: result=${result.result}, defectsCreated=${result.defectsCreated}, assetLinked=${result.assetLinked}`,
  );

  return {
    submissionId: result.submissionId,
    result: result.result,
    defectsCreated: result.defectsCreated,
    defectIds: result.defectIds,
    assetLinked: result.assetLinked,
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
