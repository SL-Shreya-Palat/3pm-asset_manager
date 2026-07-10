/**
 * Pull new submissions from the form-builder-portal database and process them
 * through the shared inspection pipeline (normalize keys → evaluate defect
 * settings → link asset/driver → create defects / flag driver).
 *
 * Bridges the gap when the form-builder webhook dispatch worker isn't running
 * (e.g. no Redis / BullMQ). Two callers:
 *   • POST /api/forms/sync-submissions   — admin "Sync Submissions" button.
 *   • GET  /api/inspections/my-due?sync=1 — driver-inspection gate, so a driver's
 *     just-submitted check is picked up and the gate clears without a worker.
 *
 * Idempotent: submissions already stored (matched by externalSubmissionId) are
 * skipped, so re-running never double-processes.
 */
import { MongoClient, ObjectId } from 'mongodb';
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

export type SyncSubmissionsResult =
  | { status: 'no_mapping' }
  | {
      status: 'ok';
      totalFound: number;
      synced: number;
      defectsCreated: number;
      errors?: string[];
    };

export async function syncFormBuilderSubmissions(
  tenantId: string,
): Promise<SyncSubmissionsResult> {
  // Get the organizationId for this tenant from org mappings.
  const orgMappingsCol = await getFormBuilderOrgMappingsCollection();
  const orgMapping = await orgMappingsCol.findOne({
    tenantId: ObjectId.isValid(tenantId) ? new ObjectId(tenantId) : tenantId,
  });

  if (!orgMapping?.organizationId) {
    return { status: 'no_mapping' };
  }

  const organizationId = orgMapping.organizationId.toString();
  const appId = process.env.FORM_BUILDER_APP_ID;

  const fbClient = new MongoClient(FORM_BUILDER_MONGODB_URI);
  await fbClient.connect();
  const fbDb = fbClient.db(FORM_BUILDER_DB_NAME);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const submissionFilter: any = {
      organizationId: new ObjectId(organizationId),
    };
    if (appId && ObjectId.isValid(appId)) {
      submissionFilter.appId = new ObjectId(appId);
    }

    const fbSubmissions = await fbDb
      .collection('submissions')
      .find(submissionFilter)
      .sort({ submittedAt: -1 })
      .limit(500)
      .toArray();

    if (fbSubmissions.length === 0) {
      return { status: 'ok', totalFound: 0, synced: 0, defectsCreated: 0 };
    }

    // Which submissions are already processed locally?
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

    // Load local forms for schema resolution.
    const formsCol = await getFormsCollection();
    const tenantOid = ObjectId.createFromHexString(tenantId);
    const localForms = await formsCol.find({ tenantId: tenantOid }).toArray();

    // form-builder formId (hex) → local form doc.
    const formMap = new Map<string, Record<string, unknown>>();
    for (const f of localForms) {
      if (f.formId) formMap.set(f.formId.toString(), f);
    }

    let syncedCount = 0;
    let defectsCreatedCount = 0;
    const errors: string[] = [];

    for (const fbSub of fbSubmissions) {
      const externalId = fbSub._id.toString();
      if (existingExternalIds.has(externalId)) continue;

      // Submissions store `recordId` (not `formId`) — the form id lives on the
      // linked record — so resolve via the record first, else a direct formId.
      let formIdForLookup = fbSub.formId?.toString();
      if (!formIdForLookup && fbSub.recordId) {
        const record = await fbDb
          .collection('records')
          .findOne({ _id: new ObjectId(fbSub.recordId.toString()) });
        if (record?.formId) formIdForLookup = record.formId.toString();
      }
      if (!formIdForLookup) continue;

      const localForm = formMap.get(formIdForLookup);
      if (!localForm) continue; // form not synced to asset-manager yet

      const localFormId = (localForm.formId as ObjectId).toString();

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

    return {
      status: 'ok',
      totalFound: fbSubmissions.length,
      synced: syncedCount,
      defectsCreated: defectsCreatedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } finally {
    await fbClient.close();
  }
}
