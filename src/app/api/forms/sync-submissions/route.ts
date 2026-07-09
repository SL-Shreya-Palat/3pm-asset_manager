/**
 * POST /api/forms/sync-submissions
 *
 * Pulls new form submissions from the form-builder-portal database,
 * resolves field.id → fieldKey, evaluates them against defect settings,
 * and creates defect rows for any detected defects.
 *
 * This endpoint bridges the gap when the form-builder-portal's webhook
 * dispatch worker is not running (e.g. no Redis / no BullMQ worker).
 *
 * Call manually or via a cron schedule.
 */
import { NextRequest, NextResponse } from 'next/server';
import { MongoClient, ObjectId } from 'mongodb';
import { requireAdmin } from '@/lib/authz';
import {
  getFormsCollection,
  getInspectionSubmissionsCollection,
  getFormBuilderOrgMappingsCollection,
} from '@/lib/mongodb';
import { processInspectionSubmission } from '@/controller/inspection-submissions';

const FORM_BUILDER_MONGODB_URI =
  process.env.FORM_BUILDER_MONGODB_URI || 'mongodb://localhost:27017';
const FORM_BUILDER_DB_NAME =
  process.env.FORM_BUILDER_DB_NAME || 'formbuilder-portal';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;
    const user = auth.user;

    const tenantId = user.currentTenantId!;

    // Get the organizationId for this tenant from org mappings
    const orgMappingsCol = await getFormBuilderOrgMappingsCollection();
    const orgMapping = await orgMappingsCol.findOne({
      tenantId: ObjectId.isValid(tenantId)
        ? new ObjectId(tenantId)
        : tenantId,
    });

    if (!orgMapping?.organizationId) {
      return NextResponse.json(
        { data: null, error: 'No form-builder organization mapped to this tenant' },
        { status: 404 },
      );
    }

    const organizationId = orgMapping.organizationId.toString();

    // Get the appId from env
    const appId = process.env.FORM_BUILDER_APP_ID;

    // Connect to form-builder-portal's DB
    const fbClient = new MongoClient(FORM_BUILDER_MONGODB_URI);
    await fbClient.connect();
    const fbDb = fbClient.db(FORM_BUILDER_DB_NAME);

    try {
      // Build filter for submissions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const submissionFilter: any = {
        organizationId: new ObjectId(organizationId),
      };
      if (appId && ObjectId.isValid(appId)) {
        submissionFilter.appId = new ObjectId(appId);
      }

      // Fetch all submissions from form-builder-portal
      const fbSubmissions = await fbDb
        .collection('submissions')
        .find(submissionFilter)
        .sort({ submittedAt: -1 })
        .limit(500)
        .toArray();

      if (fbSubmissions.length === 0) {
        await fbClient.close();
        return NextResponse.json(
          {
            data: {
              message: 'No submissions found in form-builder-portal',
              synced: 0,
              defectsCreated: 0,
            },
            error: null,
          },
          { status: 200 },
        );
      }

      // Check which submissions are already processed
      const submissionsCol = await getInspectionSubmissionsCollection();
      const existingExternalIds = new Set(
        (
          await submissionsCol
            .find(
              { externalSubmissionId: { $ne: null } },
              { projection: { externalSubmissionId: 1 } },
            )
            .toArray()
        ).map((doc) => doc.externalSubmissionId?.toString()),
      );

      // Load local forms for schema resolution
      const formsCol = await getFormsCollection();
      const tenantOid = ObjectId.createFromHexString(tenantId);
      const localForms = await formsCol
        .find({ tenantId: tenantOid })
        .toArray();

      // Build formId → local form map (key is the ObjectId hex of the form-builder form)
      const formMap = new Map<string, Record<string, unknown>>();
      for (const f of localForms) {
        if (f.formId) {
          formMap.set(f.formId.toString(), f);
        }
      }

      let syncedCount = 0;
      let defectsCreatedCount = 0;
      const errors: string[] = [];

      for (const fbSub of fbSubmissions) {
        const externalId = fbSub._id.toString();

        // Skip already processed
        if (existingExternalIds.has(externalId)) continue;

        // Resolve the form id. Submissions store `recordId` (not `formId`) — the
        // form id lives on the linked record — so resolve via the record first,
        // falling back to a direct formId if one is present.
        let formIdForLookup = fbSub.formId?.toString();
        if (!formIdForLookup && fbSub.recordId) {
          const record = await fbDb
            .collection('records')
            .findOne({ _id: new ObjectId(fbSub.recordId.toString()) });
          if (record?.formId) formIdForLookup = record.formId.toString();
        }
        if (!formIdForLookup) continue;

        // Look up the local form
        const localForm = formMap.get(formIdForLookup);
        if (!localForm) {
          // Form not synced to asset-manager yet — skip
          continue;
        }

        const localFormId = (localForm.formId as ObjectId).toString();

        // Process via the shared pipeline (normalize keys → evaluate → link
        // asset → create defects) — identical behaviour to the webhook path.
        try {
          const result = await processInspectionSubmission({
            tenantId,
            formId: localFormId,
            rawResponse: (fbSub.response || {}) as Record<string, unknown>,
            source: 'sync',
            form: localForm,
            formVersion: fbSub.formVersion as number | undefined,
            submittedBy: fbSub.submittedBy?.toString() || null,
            submitterInfo: (fbSub.submitterInfo as Record<string, unknown>) || null,
            externalSubmissionId: externalId,
            submittedAt: fbSub.submittedAt
              ? new Date(fbSub.submittedAt as string | Date)
              : undefined,
          });
          if (result.status === 'processed') {
            syncedCount++;
            defectsCreatedCount += result.defectsCreated;
          }
        } catch (err) {
          errors.push(`Submission ${externalId} failed: ${err}`);
        }
      }

      return NextResponse.json(
        {
          data: {
            message: `Sync complete. ${syncedCount} new submission(s) processed.`,
            totalFound: fbSubmissions.length,
            synced: syncedCount,
            defectsCreated: defectsCreatedCount,
            errors: errors.length > 0 ? errors : undefined,
          },
          error: null,
        },
        { status: 200 },
      );
    } finally {
      await fbClient.close();
    }
  } catch (error) {
    console.error('[SYNC_SUBMISSIONS]', error);
    return NextResponse.json(
      {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to sync submissions',
      },
      { status: 500 },
    );
  }
}
