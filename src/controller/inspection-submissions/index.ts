/**
 * Inspection-submission processing — the single source of truth for turning a
 * submitted pre-start form into an inspection record + auto-created defects.
 *
 * Every entry point calls this one function, so behaviour is identical whether a
 * submission arrives via the form-builder webhook, the polling sync fallback, or
 * a direct in-app submit:
 *
 *   1. Load the form (caller may pass a pre-loaded doc when batching).
 *   2. Build the field maps once and NORMALIZE the response to fieldKey keys
 *      (the form-builder keys answers by field.id — this is the fix that makes
 *      webhook submissions actually produce defects).
 *   3. Evaluate the response against the saved defect settings (pure).
 *   4. Resolve the asset (explicit id wins; else match the unit-number answer to
 *      an asset's number) so every defect is tied to its vehicle.
 *   5. Save the submission and create one defect per failed item (batch insert).
 */
import { ObjectId } from 'mongodb';
import {
  getFormsCollection,
  getPrestartFormDefectSettingsCollection,
  getInspectionSubmissionsCollection,
  getDefectsCollection,
  getAssetsCollection,
  getCountersCollection,
  getInspectionLaunchesCollection,
} from '@/lib/mongodb';
import {
  buildFormFieldMaps,
  normalizeResponseKeys,
  detectAssetFieldKey,
  type FormFieldMaps,
} from '@/controller/forms/schema-utils';
import { evaluateDefects, type EvaluationResult } from '@/controller/defect-settings/evaluator';
import { reserveDefectNumbers } from '@/controller/defects/utils';
import { notifyEvent } from '@/controller/notifications';
import { flagDriverUnfit, clearDriverFitnessFlag } from '@/controller/drivers';
import { classifyInspectionType } from '@/controller/forms';
import {
  writebackActivityIfLinked,
  writebackAvailabilityIfLinked,
} from '@/controller/command-connection/hooks';
import type { SeverityValue } from '@/controller/defect-settings/types';

export interface ProcessSubmissionParams {
  /** Current tenant (hex string). */
  tenantId: string;
  /** Form-builder formId (hex string). */
  formId: string;
  /** Raw answers — id-keyed or fieldKey-keyed; normalized internally. */
  rawResponse: Record<string, unknown>;
  /** Where the submission came from. */
  source: 'webhook' | 'sync' | 'manual';
  formVersion?: number;
  /** Explicit asset id (in-app path); takes priority over unit-number matching. */
  explicitAssetId?: string | null;
  submittedBy?: string | null;
  submitterInfo?: Record<string, unknown> | null;
  externalSubmissionId?: string | null;
  submittedAt?: Date;
  /** Acting user (in-app path) — stamped on created defects. */
  createdBy?: string | null;
  /** Pre-loaded form doc to avoid a re-read when batching (sync). */
  form?: Record<string, unknown> | null;
}

export interface ProcessSubmissionResult {
  status: 'processed' | 'form_not_found';
  submissionId?: string;
  result?: 'pass' | 'fail';
  defectsCreated: number;
  defectIds: string[];
  /** True when the submission was tied to a known asset. */
  assetLinked: boolean;
}

interface ResolvedAsset {
  id: ObjectId | null;
  name: string | null;
  unitNumber: string | null;
  /** Teams that own this asset — used to route defect/inspection notifications. */
  teamIds: ObjectId[];
}

/** Escape a user-supplied string for safe use inside a RegExp. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assetDisplayName(doc: Record<string, unknown>): string {
  return (doc.name as string) || (doc.assetNumber as string) || '';
}

/** Highest severity across a set of failed items (high > medium > low). */
const SEVERITY_ORDER: Record<string, number> = { low: 1, medium: 2, high: 3 };
function maxSeverity(list: SeverityValue[]): SeverityValue {
  let max: SeverityValue = 'low';
  for (const s of list) {
    if ((SEVERITY_ORDER[s] ?? 0) > (SEVERITY_ORDER[max] ?? 0)) max = s;
  }
  return max;
}

/**
 * Resolve which asset a submission belongs to.
 * - Explicit id (in-app submit) is authoritative.
 * - Otherwise match the unit-number answer to an asset's `assetNumber`
 *   (case-insensitive, exact, tenant-scoped). The raw unit number is always
 *   returned for traceability, even when no asset matches.
 */
async function resolveAsset(
  tenantOid: ObjectId,
  maps: FormFieldMaps,
  response: Record<string, unknown>,
  explicitAssetId: string | null,
): Promise<ResolvedAsset> {
  const assetsCol = await getAssetsCollection();

  if (explicitAssetId && ObjectId.isValid(explicitAssetId)) {
    const oid = ObjectId.createFromHexString(explicitAssetId);
    const doc = await assetsCol.findOne({ _id: oid, tenantId: tenantOid });
    return doc
      ? {
          id: oid,
          name: assetDisplayName(doc),
          unitNumber: (doc.assetNumber as string) ?? null,
          teamIds: (doc.teamIds as ObjectId[]) ?? [],
        }
      : { id: null, name: null, unitNumber: null, teamIds: [] };
  }

  const fieldKey = detectAssetFieldKey(maps);
  const raw = fieldKey ? response[fieldKey] : undefined;
  const unitNumber = typeof raw === 'string' ? raw.trim() : '';
  if (!unitNumber) return { id: null, name: null, unitNumber: null, teamIds: [] };

  const doc = await assetsCol.findOne({
    tenantId: tenantOid,
    assetNumber: { $regex: `^${escapeRegex(unitNumber)}$`, $options: 'i' },
    isArchived: { $ne: true },
  });
  return doc
    ? {
        id: doc._id as ObjectId,
        name: assetDisplayName(doc),
        unitNumber,
        teamIds: (doc.teamIds as ObjectId[]) ?? [],
      }
    : { id: null, name: null, unitNumber, teamIds: [] };
}

export async function processInspectionSubmission(
  params: ProcessSubmissionParams,
): Promise<ProcessSubmissionResult> {
  const {
    tenantId,
    formId,
    rawResponse,
    source,
    formVersion,
    explicitAssetId = null,
    submittedBy = null,
    submitterInfo = null,
    externalSubmissionId = null,
    submittedAt,
    createdBy = null,
  } = params;

  const tenantOid = ObjectId.createFromHexString(tenantId);
  const formOid = ObjectId.createFromHexString(formId);
  const now = new Date();

  // 1) Load the form (reuse the caller's doc when batching).
  const formsCol = await getFormsCollection();
  const form =
    params.form ?? (await formsCol.findOne({ formId: formOid, tenantId: tenantOid }));
  if (!form) {
    return { status: 'form_not_found', defectsCreated: 0, defectIds: [], assetLinked: false };
  }
  const formTitle = (form.formTitle as string) || 'Inspection';
  const schema = form.schema as { pages?: unknown[]; versionNumber?: number } | undefined;

  // 2) Build field maps once, then normalize the response to fieldKey keys.
  const maps = buildFormFieldMaps(schema);
  const response = normalizeResponseKeys(maps, rawResponse);

  // 3) Evaluate against saved defect settings (pure).
  const settingsCol = await getPrestartFormDefectSettingsCollection();
  const settings = await settingsCol.findOne({ tenantId: tenantOid, formId: formOid });
  const evaluation: EvaluationResult = settings?.defectAnswers
    ? evaluateDefects(
        settings.defectAnswers as Record<string, string[]>,
        (settings.severityByField || {}) as Record<string, SeverityValue>,
        response,
        maps.typeByFieldKey,
        maps.labelByFieldKey,
        maps.optionsByFieldKey,
      )
    : { result: 'pass', defects: [] };

  // 4) Resolve the asset. Priority: explicit id → asset-first launch correlation
  //    → unit-number match. The launch ties an iframe submission to the asset the
  //    user picked (consumed once), so linking is deterministic without typing.
  let effectiveAssetId = explicitAssetId;
  let operatorId: ObjectId | null = null;
  let operatorName: string | null = null;
  let driverId: ObjectId | null = null;
  if (!effectiveAssetId) {
    const launches = await getInspectionLaunchesCollection();
    const launch = await launches.findOneAndUpdate(
      { tenantId: tenantOid, formId: formOid, status: 'pending' },
      { $set: { status: 'consumed', consumedAt: now } },
      { sort: { createdAt: -1 }, returnDocument: 'after' },
    );
    if (launch) {
      if (launch.assetId) effectiveAssetId = (launch.assetId as ObjectId).toHexString();
      // Operator = whoever launched the inspection (passed just like the asset).
      operatorId = (launch.userId as ObjectId) ?? null;
      operatorName = (launch.userName as string) || (launch.userEmail as string) || null;
      // Driver = the driver this inspection was launched for (driver wellness flow).
      if (launch.driverId) driverId = launch.driverId as ObjectId;
    }
  }
  const asset = await resolveAsset(tenantOid, maps, response, effectiveAssetId ?? null);

  // 5) Save the inspection submission.
  const submissionsCol = await getInspectionSubmissionsCollection();
  const inspectionNumber = await generateInspectionNumber(tenantId);
  const submissionDoc = {
    tenantId: tenantOid,
    inspectionNumber,
    formId: formOid,
    formTitle,
    formVersion: formVersion ?? schema?.versionNumber ?? 1,
    assetId: asset.id,
    assetName: asset.name,
    unitNumber: asset.unitNumber,
    driverId,
    operatorId,
    operatorName,
    response,
    result: evaluation.result,
    defects: evaluation.defects,
    faultsComments: (response.faults_comments as string) ?? null,
    photos: response.photos ?? null,
    safeToOperate: response.safe_to_operate ?? null,
    submittedBy:
      submittedBy && ObjectId.isValid(submittedBy) ? new ObjectId(submittedBy) : submittedBy,
    submitterInfo,
    externalSubmissionId,
    submittedAt: submittedAt ?? now,
    createdAt: now,
    updatedAt: now,
    source,
  };
  const insertResult = await submissionsCol.insertOne(submissionDoc);
  const submissionId = insertResult.insertedId;

  // 5b) DRIVER inspection flow — flag the DRIVER, not the asset.
  //     A form is a driver check when it's typed 'driver' (manual toggle / smart
  //     default) OR it was launched for a driver. Such a check is about
  //     fitness-for-duty (fatigue/alcohol/…), so it must NOT create an asset
  //     maintenance defect or ground a vehicle. Instead: flag the driver unfit +
  //     notify; a passing check clears any prior flag.
  const inspectionType =
    (form.inspectionType as 'asset' | 'driver' | undefined) ?? classifyInspectionType(formTitle);
  const isDriverCheck = inspectionType === 'driver' || driverId !== null;

  if (isDriverCheck) {
    if (evaluation.defects.length > 0) {
      const severity = maxSeverity(evaluation.defects.map((d) => d.severity));
      const reasons = evaluation.defects.map((d) => {
        const answer = Array.isArray(d.answer) ? d.answer.join(', ') : d.answer;
        return `${d.label}: ${answer}`;
      });

      // Flag the specific driver when we know who it is (driver-launched flow).
      let driverName = 'A driver';
      let teamIds: ObjectId[] = [];
      if (driverId) {
        const driver = await flagDriverUnfit(tenantId, driverId.toHexString(), {
          severity,
          reasons,
          inspectionSubmissionId: submissionId,
        });
        if (driver) {
          driverName = driver.name;
          teamIds = driver.teamId ? [driver.teamId] : [];
        }
      }

      await notifyEvent(
        tenantId,
        {
          type: 'driver_check_failed',
          title: `${driverName} flagged unfit for duty`,
          body: `${driverName} failed the check "${formTitle}" — ${reasons.length} issue${reasons.length > 1 ? 's' : ''} (${severity} severity). Review before they start work.`,
          link: driverId ? `/people/drivers/${driverId.toHexString()}` : '/inspections/history',
          entityType: 'inspectionSubmission',
          entityId: submissionId.toString(),
        },
        { teamIds },
      );
    } else if (driverId) {
      // Passed → clear any prior unfit flag so the driver is cleared for work.
      await clearDriverFitnessFlag(tenantId, driverId.toHexString());
    }

    return {
      status: 'processed',
      submissionId: submissionId.toString(),
      result: evaluation.result,
      defectsCreated: 0,
      defectIds: [],
      assetLinked: false,
    };
  }

  // 6) Create one defect per failed item (single batch insert).
  const defectIds: string[] = [];
  if (evaluation.defects.length > 0) {
    const numbers = await reserveDefectNumbers(tenantId, evaluation.defects.length);
    // Attribute the defect to the operator who performed the inspection.
    const createdByOid =
      createdBy && ObjectId.isValid(createdBy) ? new ObjectId(createdBy) : operatorId;
    const operatorNotes = response.faults_comments
      ? `\n\nOperator notes: ${response.faults_comments}`
      : '';
    // Who inspected the asset — from the launch, falling back to the submitter info.
    const inspectorName =
      operatorName ||
      (submitterInfo && typeof submitterInfo === 'object'
        ? ((submitterInfo.name as string) || (submitterInfo.email as string) || null)
        : null);

    const defectDocs = evaluation.defects.map((defect, i) => {
      const answerStr = Array.isArray(defect.answer) ? defect.answer.join(', ') : defect.answer;
      return {
        tenantId: tenantOid,
        defectNumber: numbers[i],
        name: `${defect.label} — ${answerStr}`,
        date: now,
        comment: `Auto-generated from pre-start inspection "${formTitle}". Field "${defect.label}" answered "${answerStr}".${operatorNotes}`,
        assetId: asset.id,
        assetName: asset.name ?? '',
        // Inherit the asset's teams so the Defects tab is populated and defect
        // notifications route to the responsible team(s).
        teamIds: asset.teamIds,
        // Operator = whoever performed the inspection (shown as "Operator" in the UI).
        driverId: operatorId,
        driverName: inspectorName,
        priority: defect.severity,
        severity: defect.severity,
        status: 'new',
        attachments: [],
        source: 'prestart_inspection',
        inspectionSubmissionId: submissionId,
        sourceFieldKey: defect.fieldKey,
        createdBy: createdByOid,
        updatedBy: createdByOid,
        createdAt: now,
        updatedAt: now,
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
      };
    });

    const res = await (await getDefectsCollection()).insertMany(defectDocs);
    for (const id of Object.values(res.insertedIds)) defectIds.push(id.toString());

    // Ground the asset when a defect is raised on a field mapped as "Out of
    // Service" in Defect Settings (e.g. "Safe to operate → Off"). The mapping is
    // per-field, so admins choose exactly which questions take the asset off the
    // road. Completing a work order returns it to service (see completeWorkOrder).
    const oosMap = (settings?.outOfServiceByField || {}) as Record<string, boolean>;
    const grounded = evaluation.defects.some((d) => oosMap[d.fieldKey]);
    if (grounded && asset.id) {
      await (await getAssetsCollection()).updateOne(
        { _id: asset.id, tenantId: tenantOid },
        { $set: { status: 'out_of_service', updatedAt: now } },
      );
      // Command-linked assets: mirror the grounding so Command pickers exclude it.
      // Fire-and-forget — an outbound Command HTTP call (up to several seconds on
      // a slow/unreachable Command) must never delay the driver's submission from
      // completing; the outbox retries it if Command doesn't accept it immediately.
      void writebackAvailabilityIfLinked(
        tenantId,
        asset.id,
        true,
        `Failed pre-start inspection "${formTitle}"`,
      ).catch(() => {});
    }

    // Notify the tenant's managers that new defects need review (best-effort).
    const assetLabel = asset.name || asset.unitNumber || 'An asset';
    await notifyEvent(
      tenantId,
      {
        type: 'defect_created',
        title: `${defectIds.length} new defect${defectIds.length > 1 ? 's' : ''} reported`,
        body: `${assetLabel} failed inspection "${formTitle}" — ${defectIds.length} defect${defectIds.length > 1 ? 's' : ''} need review.${grounded ? ' Asset marked Under Maintenance.' : ''}`,
        link: '/maintenance/defects',
        entityType: 'inspectionSubmission',
        entityId: submissionId.toString(),
      },
      { teamIds: asset.teamIds },
    );
  }

  // Notify managers when an inspection is submitted with NO defects (the defect
  // case above already notifies). Best-effort — never blocks the submission.
  if (defectIds.length === 0) {
    await notifyEvent(
      tenantId,
      {
        type: 'inspection_submitted',
        title: `Inspection completed: ${formTitle}`,
        body: `${asset.name || 'An asset'} passed inspection "${formTitle}".`,
        link: '/inspections',
        entityType: 'inspectionSubmission',
        entityId: submissionId.toString(),
      },
      { teamIds: asset.teamIds },
    );
  }

  // Command-linked assets: append the pre-start to the Command activity timeline.
  // Fire-and-forget, same reasoning as the availability write-back above — this
  // is a nice-to-have mirror, not something the caller needs to wait on.
  void writebackActivityIfLinked(tenantId, asset.id, {
    type: 'prestart_submitted',
    summary: `Pre-start "${formTitle}" submitted — ${evaluation.result === 'pass' ? 'passed' : 'failed'}${
      defectIds.length ? ` (${defectIds.length} defect${defectIds.length > 1 ? 's' : ''})` : ''
    }`,
    details: {
      inspectionNumber,
      result: evaluation.result,
      defectsCreated: defectIds.length,
      ...(operatorName ? { operator: operatorName } : {}),
    },
  }).catch(() => {});

  return {
    status: 'processed',
    submissionId: submissionId.toString(),
    result: evaluation.result,
    defectsCreated: defectIds.length,
    defectIds,
    assetLinked: asset.id !== null,
  };
}

// ── inspection number + history (list / detail) ────────────────────────────────

/** Next per-tenant inspection number (INS-0001) via the atomic counter. */
async function generateInspectionNumber(tenantId: string): Promise<string> {
  const counters = await getCountersCollection();
  const result = await counters.findOneAndUpdate(
    { _id: `inspection_${tenantId}` as unknown as ObjectId },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  const seq = (result?.seq as number) || 1;
  return `INS-${String(seq).padStart(4, '0')}`;
}

function serializeSubmission(
  doc: Record<string, unknown>,
  opts: { full?: boolean } = {},
) {
  const base = {
    id: (doc._id as ObjectId).toString(),
    inspectionNumber: (doc.inspectionNumber as string) ?? null,
    formId: doc.formId ? (doc.formId as ObjectId).toString() : null,
    formTitle: (doc.formTitle as string) ?? '',
    formVersion: (doc.formVersion as number) ?? 1,
    assetId: doc.assetId ? (doc.assetId as ObjectId).toString() : null,
    assetName: (doc.assetName as string) ?? null,
    unitNumber: (doc.unitNumber as string) ?? null,
    driverId: doc.driverId ? (doc.driverId as ObjectId).toString() : null,
    operatorId: doc.operatorId ? String(doc.operatorId) : null,
    operatorName: (doc.operatorName as string) ?? null,
    submittedBy: doc.submittedBy ? String(doc.submittedBy) : null,
    result: (doc.result as string) ?? 'pass',
    defectCount: Array.isArray(doc.defects) ? (doc.defects as unknown[]).length : 0,
    submittedAt: doc.submittedAt ? new Date(doc.submittedAt as Date).toISOString() : null,
    source: (doc.source as string) ?? null,
    teamIds: Array.isArray(doc.teamIds)
      ? (doc.teamIds as ObjectId[]).map((id) => id.toString())
      : [],
  };
  if (!opts.full) return base;
  return {
    ...base,
    response: (doc.response as Record<string, unknown>) ?? {},
    defects: (doc.defects as unknown[]) ?? [],
    faultsComments: (doc.faultsComments as string) ?? null,
    photos: doc.photos ?? null,
    safeToOperate: doc.safeToOperate ?? null,
    submitterInfo: (doc.submitterInfo as Record<string, unknown>) ?? null,
  };
}

/** Paginated inspection history for the tenant (newest first). */
export async function listInspectionSubmissions(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string; result?: string; assetId?: string; driverId?: string; teamId?: string; full?: boolean; ownUserId?: string; teamIds?: string[] },
) {
  const col = await getInspectionSubmissionsCollection();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const skip = (page - 1) * limit;
  const tenantOid = ObjectId.createFromHexString(tenantId);

  const filter: Record<string, unknown> = { tenantId: tenantOid };
  if (options.result) filter.result = options.result;
  if (options.assetId && ObjectId.isValid(options.assetId)) {
    filter.assetId = ObjectId.createFromHexString(options.assetId);
  }
  if (options.driverId && ObjectId.isValid(options.driverId)) {
    filter.driverId = ObjectId.createFromHexString(options.driverId);
  }
  // Team restriction (team-scoped roles) composes with the explicit teamId filter.
  if (options.teamIds) {
    const allowed = options.teamIds.filter((id) => ObjectId.isValid(id));
    const effective = options.teamId ? allowed.filter((id) => id === options.teamId) : allowed;
    filter.teamIds = { $in: effective.map((id) => ObjectId.createFromHexString(id)) };
  } else if (options.teamId && ObjectId.isValid(options.teamId)) {
    filter.teamIds = ObjectId.createFromHexString(options.teamId);
  }
  // "OWN" view scope — only the caller's own submissions (as submitter or operator).
  // Kept in $and so it composes with the search $or below.
  if (options.ownUserId && ObjectId.isValid(options.ownUserId)) {
    const userOid = ObjectId.createFromHexString(options.ownUserId);
    filter.$and = [{ $or: [{ submittedBy: userOid }, { operatorId: userOid }] }];
  }
  if (options.search) {
    const regex = { $regex: options.search, $options: 'i' };
    filter.$or = [
      { inspectionNumber: regex },
      { formTitle: regex },
      { assetName: regex },
      { unitNumber: regex },
    ];
  }

  const [items, total] = await Promise.all([
    col.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  return {
    items: items.map((d) => serializeSubmission(d as Record<string, unknown>, { full: options.full })),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}

/** Full inspection record (responses + defects) for the detail view. */
export async function getInspectionSubmissionById(tenantId: string, id: string) {
  if (!ObjectId.isValid(id)) return null;
  const col = await getInspectionSubmissionsCollection();
  const doc = await col.findOne({
    _id: ObjectId.createFromHexString(id),
    tenantId: ObjectId.createFromHexString(tenantId),
  });
  return doc ? serializeSubmission(doc as Record<string, unknown>, { full: true }) : null;
}

// ── Team assignment ─────────────────────────────────────────────────────────

/** Bulk-add a team to multiple inspection submissions. */
export async function addTeamToInspections(
  tenantId: string,
  userId: string,
  teamId: string,
  inspectionIds: string[],
) {
  const col = await getInspectionSubmissionsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const teamOid = ObjectId.createFromHexString(teamId);
  const userOid = ObjectId.createFromHexString(userId);
  const inspectionOids = inspectionIds.map((id) => ObjectId.createFromHexString(id));

  const result = await col.updateMany(
    {
      _id: { $in: inspectionOids },
      tenantId: tenantOid,
    },
    {
      $addToSet: { teamIds: teamOid },
      $set: { updatedBy: userOid, updatedAt: new Date() },
    },
  );

  return result.modifiedCount;
}

/** Remove a team from an inspection submission. */
export async function removeTeamFromInspection(
  tenantId: string,
  userId: string,
  teamId: string,
  inspectionId: string,
) {
  const col = await getInspectionSubmissionsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const teamOid = ObjectId.createFromHexString(teamId);
  const inspectionOid = ObjectId.createFromHexString(inspectionId);
  const userOid = ObjectId.createFromHexString(userId);

  const result = await col.updateOne(
    {
      _id: inspectionOid,
      tenantId: tenantOid,
    },
    {
      $pull: { teamIds: teamOid },
      $set: { updatedBy: userOid, updatedAt: new Date() },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  );

  return result.modifiedCount > 0;
}
