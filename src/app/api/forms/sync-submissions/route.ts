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
import { getAuthenticatedUser } from '@/lib/auth-helper';
import {
  getFormsCollection,
  getInspectionSubmissionsCollection,
  getDefectsCollection,
  getFormBuilderOrgMappingsCollection,
} from '@/lib/mongodb';
import { evaluateSubmission } from '@/controller/defect-settings/evaluator';
import { generateDefectNumber } from '@/controller/defects/utils';

const FORM_BUILDER_MONGODB_URI =
  process.env.FORM_BUILDER_MONGODB_URI || 'mongodb://localhost:27017';
const FORM_BUILDER_DB_NAME =
  process.env.FORM_BUILDER_DB_NAME || 'formbuilder-portal';

/**
 * Resolve field.id–keyed response → fieldKey–keyed response
 * using the locally stored form schema.
 */
function resolveResponseKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: { pages?: any[] } | undefined,
  rawResponse: Record<string, unknown>,
): Record<string, unknown> {
  if (!schema?.pages) return rawResponse;

  // Build id→fieldKey map by walking schema pages
  const idToFieldKey = new Map<string, string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walkItems(items: any[]) {
    for (const item of items) {
      if (item.type === 'fieldgroup' && Array.isArray(item.items)) {
        walkItems(item.items);
        continue;
      }
      if (item.id && item.fieldKey) {
        idToFieldKey.set(item.id, item.fieldKey);
      }
    }
  }

  for (const page of schema.pages) {
    if (Array.isArray(page.items)) walkItems(page.items);
  }

  // Remap keys
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawResponse)) {
    const fieldKey = idToFieldKey.get(key);
    if (fieldKey) {
      resolved[fieldKey] = value;
    } else {
      // Keep unknown keys as-is (might already be fieldKey-based)
      resolved[key] = value;
    }
  }

  return resolved;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = user.currentTenantId;

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

      const defectsCol = await getDefectsCollection();
      let syncedCount = 0;
      let defectsCreatedCount = 0;
      const errors: string[] = [];

      for (const fbSub of fbSubmissions) {
        const externalId = fbSub._id.toString();

        // Skip already processed
        if (existingExternalIds.has(externalId)) continue;

        const fbFormId = fbSub.formId?.toString();
        if (!fbFormId) continue;

        // Get the record to find which form this belongs to
        // form-builder stores formId on records, submissions link to records via recordId
        let formIdForLookup = fbFormId;

        // The submission might have formId directly or via its record
        if (!formMap.has(formIdForLookup) && fbSub.recordId) {
          // Try to find the form via the record
          const record = await fbDb
            .collection('records')
            .findOne({ _id: new ObjectId(fbSub.recordId.toString()) });
          if (record?.formId) {
            formIdForLookup = record.formId.toString();
          }
        }

        // Look up the local form
        const localForm = formMap.get(formIdForLookup);
        if (!localForm) {
          // Form not synced to asset-manager yet — skip
          continue;
        }

        const localFormId = (localForm.formId as ObjectId).toString();

        // Resolve field.id → fieldKey
        const rawResponse = (fbSub.response || {}) as Record<string, unknown>;
        const schema = localForm.schema as { pages?: unknown[] } | undefined;
        const resolvedResponse = resolveResponseKeys(schema, rawResponse);

        // Run defect evaluator
        const evaluation = await evaluateSubmission(
          tenantId,
          localFormId,
          resolvedResponse,
        );

        // Save submission
        const now = new Date();
        const submissionDoc = {
          tenantId: tenantOid,
          formId: new ObjectId(localFormId),
          formTitle: (localForm.formTitle as string) || '',
          formVersion: (fbSub.formVersion as number) || 1,
          assetId: null,
          response: resolvedResponse,
          result: evaluation.result,
          defects: evaluation.defects,
          faultsComments: (resolvedResponse.faults_comments as string) || null,
          photos: resolvedResponse.photos || null,
          safeToOperate: resolvedResponse.safe_to_operate ?? null,
          submittedBy: fbSub.submittedBy?.toString() || null,
          submitterInfo: fbSub.submitterInfo || null,
          externalSubmissionId: externalId,
          submittedAt: fbSub.submittedAt || now,
          createdAt: now,
          updatedAt: now,
          source: 'sync',
        };

        const insertResult = await submissionsCol.insertOne(submissionDoc);
        syncedCount++;

        // Create defect rows
        if (evaluation.defects.length > 0) {
          for (const defect of evaluation.defects) {
            try {
              const defectNumber = await generateDefectNumber(tenantId);
              const answerStr = Array.isArray(defect.answer)
                ? defect.answer.join(', ')
                : defect.answer;

              const defectDoc = {
                tenantId: tenantOid,
                defectNumber,
                name: `${defect.label} — ${answerStr}`,
                date: now,
                comment: `Auto-generated from pre-start inspection "${localForm.formTitle}". Field "${defect.label}" answered "${answerStr}".`,
                assetId: null,
                assetName: '',
                driverId: null,
                driverName: null,
                priority: defect.severity === 'critical' ? 'high' : 'medium',
                severity: defect.severity,
                status: 'new',
                attachments: [],
                source: 'prestart_inspection',
                inspectionSubmissionId: insertResult.insertedId,
                sourceFieldKey: defect.fieldKey,
                createdBy: null,
                updatedBy: null,
                createdAt: now,
                updatedAt: now,
                isArchived: false,
                archivedAt: null,
                archivedBy: null,
              };

              await defectsCol.insertOne(defectDoc);
              defectsCreatedCount++;
            } catch (err) {
              errors.push(`Defect creation failed for field ${defect.fieldKey}: ${err}`);
            }
          }
        }
      }

      return NextResponse.json(
        {
          data: {
            message: `Sync complete. ${syncedCount} new submission(s) processed.`,
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
