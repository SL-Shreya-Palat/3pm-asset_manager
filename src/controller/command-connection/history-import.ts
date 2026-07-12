/**
 * Command → Asset Manager maintenance-history import (zero data loss).
 *
 * After the Zoho → Command migration lands everything in Command, this pulls
 * the asset-maintenance side into Asset Manager through the service channel:
 *
 *   service plans   → servicePlans      (1:1, schedules + hierarchy preserved)
 *   servicings      → serviceHistory    (+ $max last-service seeds on assets,
 *                                         + meterReadings trail)
 *   prestarts       → inspectionSubmissions under a synthetic legacy form
 *                                        (+ meterReadings trail)
 *   job cards/items → workOrders + faults (defects, source 'fault'),
 *                     parts lines as already-pushed Command stock
 *
 * Design rules:
 *  - IDEMPOTENT: every record keys on its Command id (command*Id) — re-runs
 *    refresh or skip, never duplicate. Prestarts are immutable → insert-if-missing.
 *  - RESUMABLE: callers loop batches ({ cursor } → { nextCursor, done }) so no
 *    single HTTP request runs unbounded.
 *  - LOSSLESS: unmappable fields ride along in a `commandData` payload on the
 *    AM doc rather than being dropped.
 *  - Requires assets to be imported first (records link via commandAssetId).
 */

import { ObjectId } from 'mongodb';
import {
  getAssetsCollection,
  getServicePlansCollection,
  getServiceTasksCollection,
  getServiceHistoryCollection,
  getMeterReadingsCollection,
  getInspectionSubmissionsCollection,
  getFormsCollection,
  getWorkOrdersCollection,
  getWorkOrderStatusesCollection,
  getDefectsCollection,
  getCountersCollection,
} from '@/lib/mongodb';
import { commandRequest } from '@/lib/command/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type HistoryEntity = 'servicePlans' | 'serviceHistory' | 'inspections' | 'workOrders';

export interface HistoryBatchResult {
  entity: HistoryEntity;
  processed: number;
  created: number;
  skipped: number;
  errors: string[];
  nextCursor: number | null;
  done: boolean;
  /** Service tasks auto-created from unique schedule names (servicePlans only). */
  tasksCreated?: number;
}

const PAGE_LIMIT = 100;
/** Job cards fan out to a comprehensive call each — keep batches small. */
const JOBCARD_BATCH = 25;
// Command's workshop LIST + per-card comprehensive endpoints are heavy
// aggregations that can exceed the transport's 5s default on large tenants and
// surface as `unreachable`. Match the master-data import's generous timeout.
const HISTORY_FETCH_TIMEOUT_MS = 20_000;

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Find the row array in a Command `{ data: ... }` body regardless of nesting. */
function extractRows(body: any): any[] {
  const d = body?.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    for (const key of Object.keys(d)) {
      if (Array.isArray(d[key])) return d[key];
    }
  }
  return [];
}

function extractHasMore(body: any, page: number, got: number): boolean {
  const pg = body?.data?.pagination ?? {};
  if (typeof pg.hasNextPage === 'boolean') return pg.hasNextPage;
  const total = num(pg.totalCount ?? pg.total);
  if (total != null) return page * PAGE_LIMIT < total;
  return got === PAGE_LIMIT;
}

/** One page of any Command list endpoint. Throws on failure (caller surfaces). */
async function fetchPage(
  path: string,
  authTenantId: string,
  page: number,
  limit = PAGE_LIMIT,
): Promise<{ rows: any[]; hasMore: boolean }> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await commandRequest<any>(`${path}${sep}page=${page}&limit=${limit}`, authTenantId, {
    timeoutMs: HISTORY_FETCH_TIMEOUT_MS,
  });
  if (!res.ok) {
    throw new Error(`Command ${path} page ${page} failed: ${res.reason}${res.status ? ` ${res.status}` : ''}`);
  }
  const rows = extractRows(res.data);
  return { rows, hasMore: extractHasMore(res.data, page, rows.length) };
}

/** AM assets keyed by their Command id (import-and-link must have run). */
async function loadAssetMap(
  tenantOid: ObjectId,
): Promise<Map<string, { _id: ObjectId; name: string }>> {
  const assets = await getAssetsCollection();
  const docs = await assets
    .find(
      { tenantId: tenantOid, source: 'command', commandAssetId: { $exists: true } },
      { projection: { commandAssetId: 1, name: 1 } },
    )
    .toArray();
  return new Map(
    docs.map((d) => [String(d.commandAssetId), { _id: d._id, name: (d.name as string) || '' }]),
  );
}

/**
 * All workshop part lines, keyed by Command job-item id. The comprehensive
 * job-card payload only carries `partsIds` — the actual lines (quantity, unit
 * cost) live in Command's workshop parts register, so without this join every
 * imported work order lands with $0 parts cost.
 */
async function loadWorkshopPartsMap(
  authTenantId: string,
): Promise<Map<string, Array<{ partId?: string; partName: string; quantity: number; cost: number }>>> {
  const map = new Map<string, Array<{ partId?: string; partName: string; quantity: number; cost: number }>>();
  let page = 1;
  for (;;) {
    const { rows, hasMore } = await fetchPage('/api/workshop/parts', authTenantId, page);
    for (const r of rows) {
      const jobItemId = str(r.jobItemId);
      if (!jobItemId) continue;
      const list = map.get(jobItemId) || [];
      list.push({
        partId: str(r.partId),
        partName: str(r.partName) ?? 'Part',
        quantity: num(r.quantity) ?? 0,
        cost: num(r.cost) ?? 0,
      });
      map.set(jobItemId, list);
    }
    if (!hasMore) break;
    page++;
  }
  return map;
}

/** Reserve `count` sequential values on a tenant counter (atomic). */
async function reserveCounter(counterId: string, count: number): Promise<number> {
  const counters = await getCountersCollection();
  const result = await counters.findOneAndUpdate(
    { _id: counterId as unknown as ObjectId },
    { $inc: { seq: count } },
    { upsert: true, returnDocument: 'after' },
  );
  const end = (result?.seq as number) || count;
  return end - count + 1; // first reserved value
}

/** Insert a meterReadings row keyed by a Command ref (idempotent trail). */
async function upsertMeterReading(
  tenantOid: ObjectId,
  assetId: ObjectId,
  userOid: ObjectId,
  input: { meterType: 'odometer' | 'engine_hours'; value: number; readingAt: Date; source: string; commandRefId: string },
): Promise<void> {
  const col = await getMeterReadingsCollection();
  await col.updateOne(
    { tenantId: tenantOid, commandRefId: input.commandRefId, meterType: input.meterType },
    {
      $setOnInsert: {
        tenantId: tenantOid,
        assetId,
        meterType: input.meterType,
        value: input.value,
        readingAt: input.readingAt,
        source: input.source,
        commandRefId: input.commandRefId,
        createdBy: userOid,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
}

// ─── 1) Service plans → servicePlans (hierarchical, 1:1) ────────────────────

/**
 * Command service plan → ONE AM service plan, schedules preserved WITH their
 * serviceGroup + sortOrder (so the hierarchy/reset behaves exactly like Command).
 *
 * Servicing is AM-OWNED, so this is a SEED (insert-if-missing keyed on
 * commandServicePlanId) — a re-import never overwrites AM edits to a plan.
 * Assets are linked via asset.servicePlanId, only when the asset has no plan yet.
 */
async function importServicePlans(
  tenantOid: ObjectId,
  userOid: ObjectId,
  authTenantId: string,
): Promise<HistoryBatchResult> {
  const result: HistoryBatchResult = {
    entity: 'servicePlans', processed: 0, created: 0, skipped: 0, errors: [], nextCursor: null, done: true,
  };
  const assetMap = await loadAssetMap(tenantOid);

  const plans: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const { rows, hasMore } = await fetchPage('/api/service-plans', authTenantId, page);
    plans.push(...rows);
    if (!hasMore) break;
  }

  // Which Command assets sit on which plan (assets list rows carry assetDetails).
  const assetsByPlan = new Map<string, string[]>();
  for (let page = 1; page <= 200; page++) {
    const { rows, hasMore } = await fetchPage('/api/assets', authTenantId, page);
    for (const row of rows) {
      const planId = str(row.assetDetails?.servicePlan ?? row.servicePlan);
      const assetId = str(row._id);
      if (planId && assetId) {
        const list = assetsByPlan.get(planId) ?? [];
        list.push(assetId);
        assetsByPlan.set(planId, list);
      }
    }
    if (!hasMore) break;
  }

  const plansCol = await getServicePlansCollection();
  const assetsCol = await getAssetsCollection();
  const now = new Date();

  // ── Service tasks FIRST: one task per unique schedule name (tenant-wide) ──
  // Existing tasks (user-created or from a prior run) are reused by title
  // (case-insensitive); only the missing ones are inserted, in one insertMany.
  const normName = (s: string) => s.trim().toLowerCase();
  const wantedNames = new Map<string, string>(); // normalized → display title
  for (const plan of plans) {
    for (const s of Array.isArray(plan.schedules) ? plan.schedules : []) {
      const name = str(s?.name);
      if (name && s.archived !== true) wantedNames.set(normName(name), name);
    }
  }
  const taskByName = new Map<string, ObjectId>();
  if (wantedNames.size > 0) {
    const tasksCol = await getServiceTasksCollection();
    const existingTasks = await tasksCol
      .find({ tenantId: tenantOid }, { projection: { title: 1 } })
      .toArray();
    for (const t of existingTasks) {
      const key = normName(String(t.title ?? ''));
      if (key && !taskByName.has(key)) taskByName.set(key, t._id);
    }
    const missing = [...wantedNames].filter(([key]) => !taskByName.has(key));
    if (missing.length > 0) {
      const docs = missing.map(([, title]) => ({
        _id: new ObjectId(),
        tenantId: tenantOid,
        title,
        description: 'Created from Command service plan import',
        createdBy: userOid,
        updatedBy: userOid,
        createdAt: now,
        updatedAt: now,
        isActive: true,
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
      }));
      await tasksCol.insertMany(docs);
      for (const d of docs) taskByName.set(normName(d.title), d._id);
      result.tasksCreated = docs.length;
    }
  }

  for (const plan of plans) {
    result.processed++;
    const commandPlanId = str(plan._id);
    const planName = str(plan.servicePlan) ?? 'Service plan';
    if (!commandPlanId) { result.skipped++; continue; }
    try {

    // Preserve every schedule with its group + order (id from Command's schedule
    // _id when present, so servicing references resolve after import). Each
    // schedule links its service task (created above) by name.
    const schedules = (Array.isArray(plan.schedules) ? plan.schedules : []).map(
      (s: any, i: number) => {
        const name = str(s.name) ?? `Schedule ${i + 1}`;
        return {
          id: str(s._id) ?? `${commandPlanId}-${i}`,
          name,
          unitOfMeasurement: str(s.unitOfMeasurement) ?? '',
          serviceInterval: num(s.serviceInterval) ?? null,
          recurring: s.recurring !== false,
          archived: s.archived === true,
          sortOrder: num(s.sortOrder) ?? i + 1,
          serviceGroup: num(s.serviceGroup) ?? null,
          serviceTaskId: taskByName.get(normName(name)) ?? null,
        };
      },
    );

    // Unique task ids across this plan's schedules → plan-level serviceTaskIds.
    const planTaskIds: ObjectId[] = [];
    const seenTask = new Set<string>();
    for (const s of schedules) {
      if (s.serviceTaskId && !seenTask.has(String(s.serviceTaskId))) {
        seenTask.add(String(s.serviceTaskId));
        planTaskIds.push(s.serviceTaskId);
      }
    }

    const upsert = await plansCol.updateOne(
      { tenantId: tenantOid, commandServicePlanId: commandPlanId },
      {
        $setOnInsert: {
          tenantId: tenantOid,
          commandServicePlanId: commandPlanId,
          source: 'command',
          name: planName,
          schedules,
          serviceTaskIds: planTaskIds,
          createdBy: userOid,
          createdAt: now,
          updatedBy: userOid,
          updatedAt: now,
          isActive: true,
          isArchived: false,
          archivedAt: null,
          archivedBy: null,
        },
      },
      { upsert: true },
    );
    if (upsert.upsertedCount > 0) result.created++;

    // Plan existed already (seed-once): ADDITIVE task backfill only — add task
    // ids and fill schedule links that are still missing; never overwrites an
    // AM edit (an existing serviceTaskId or renamed schedule is left alone).
    // One filter per UNIQUE name: `$[st]` updates every matching element, and
    // per-index filters would conflict when a plan repeats a schedule name.
    if (upsert.upsertedCount === 0 && planTaskIds.length > 0) {
      const fillSet: Record<string, unknown> = {};
      const arrayFilters: Record<string, unknown>[] = [];
      const filteredNames = new Set<string>();
      schedules.forEach((s: { name: string; serviceTaskId: ObjectId | null }) => {
        if (!s.serviceTaskId || filteredNames.has(normName(s.name))) return;
        filteredNames.add(normName(s.name));
        const key = `st${arrayFilters.length}`;
        fillSet[`schedules.$[${key}].serviceTaskId`] = s.serviceTaskId;
        // `null` matches both explicit null and a missing field.
        arrayFilters.push({ [`${key}.name`]: s.name, [`${key}.serviceTaskId`]: null });
      });
      // No updatedAt bump: this only writes when a link/id is actually added,
      // so an idempotent re-run leaves untouched plans byte-for-byte identical.
      await plansCol.updateOne(
        { tenantId: tenantOid, commandServicePlanId: commandPlanId },
        {
          $set: fillSet,
          $addToSet: { serviceTaskIds: { $each: planTaskIds } },
        },
        { arrayFilters },
      );
    }

    // Resolve the AM plan id + link assets that don't already have a plan.
    const amPlan = await plansCol.findOne(
      { tenantId: tenantOid, commandServicePlanId: commandPlanId },
      { projection: { _id: 1 } },
    );
    const amAssetIds = (assetsByPlan.get(commandPlanId) ?? [])
      .map((cid) => assetMap.get(cid)?._id)
      .filter((id): id is ObjectId => Boolean(id));
    if (amPlan && amAssetIds.length > 0) {
      await assetsCol.updateMany(
        {
          _id: { $in: amAssetIds },
          tenantId: tenantOid,
          $or: [{ servicePlanId: null }, { servicePlanId: { $exists: false } }],
        },
        { $set: { servicePlanId: amPlan._id, updatedAt: now } },
      );
    }
    } catch (e) {
      // One bad plan must not abort the batch — report and keep going.
      result.errors.push(`${planName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

// ─── 2) Servicings → serviceHistory ─────────────────────────────────────────

async function importServiceHistory(
  tenantOid: ObjectId,
  userOid: ObjectId,
  authTenantId: string,
  cursor: number,
): Promise<HistoryBatchResult> {
  const result: HistoryBatchResult = {
    entity: 'serviceHistory', processed: 0, created: 0, skipped: 0, errors: [], nextCursor: null, done: false,
  };
  const assetMap = await loadAssetMap(tenantOid);
  const page = Math.max(1, cursor);
  const { rows, hasMore } = await fetchPage('/api/servicing', authTenantId, page);

  const historyCol = await getServiceHistoryCollection();
  const assetsCol = await getAssetsCollection();
  const now = new Date();

  // Map Command plan id → AM plan _id so history links to the imported plan
  // (drives the hierarchical group reset in calc.ts).
  const plansCol = await getServicePlansCollection();
  const planDocs = await plansCol
    .find({ tenantId: tenantOid, commandServicePlanId: { $exists: true } }, { projection: { commandServicePlanId: 1 } })
    .toArray();
  const planIdMap = new Map<string, ObjectId>(
    planDocs.map((p: any) => [String(p.commandServicePlanId), p._id as ObjectId]),
  );

  for (const row of rows) {
    result.processed++;
    const commandServicingId = str(row._id);
    const info = row.information ?? {};
    const asset = assetMap.get(str(info.assetId) ?? '');
    if (!commandServicingId || !asset) {
      result.skipped++;
      if (commandServicingId && !asset) result.errors.push(`servicing ${commandServicingId}: asset not imported (${str(info.assetId)})`);
      continue;
    }

    const performedAt = toDate(info.serviceDate) ?? toDate(row.createdAt) ?? now;
    const odo = num(info.odometer);
    const engine = num(info.engineHours);
    const meterType: 'odometer' | 'engine_hours' | null = odo != null ? 'odometer' : engine != null ? 'engine_hours' : null;
    const meterAtService = odo ?? engine ?? null;
    const costHours = row.costHours ?? {};
    const voided = str(row.status) === 'voided';
    // Only APPROVED servicings advance the asset's last-service baseline / meter
    // trail — matches Command, whose next-service calc counts approved only.
    const approved = str(row.status) === 'approved';

    const notes = [
      str(info.descriptionOfWork),
      str(info.faultDescriptions) ? `Faults: ${str(info.faultDescriptions)}` : undefined,
      str(info.jobSheetNumber) ? `Job sheet ${str(info.jobSheetNumber)}` : undefined,
      num(costHours.hours) ? `Hours: ${num(costHours.hours)}` : undefined,
      voided ? '(voided in Command)' : undefined,
    ].filter(Boolean).join(' · ');

    const upsert = await historyCol.updateOne(
      { tenantId: tenantOid, commandServicingId },
      {
        $set: {
          assetId: asset._id,
          performedAt,
          // Link to the imported plan + the serviced schedule (hierarchy reset).
          servicePlanId: planIdMap.get(str(info.servicePlan) ?? '') ?? null,
          servicePlanSchedule: str(info.servicePlanSchedule) ?? null,
          servicePlanScheduleName: str(info.servicePlanSchedule) ?? null,
          taskNames: [],
          meterType: meterAtService != null ? meterType : null,
          meterAtService,
          totalCost: num(costHours.additionalServiceCost) ?? null,
          notes: notes || null,
          performedByName:
            (Array.isArray(info.servicedByNames) && info.servicedByNames.length
              ? info.servicedByNames.join(', ')
              : str(info.supplierName)) ?? null,
          source: 'command',
          commandData: {
            serviceType: info.serviceType ?? null,
            servicedWith: info.servicedWith ?? null,
            status: row.status ?? null,
            hubometer: info.hubometer ?? null,
            serviceChecklists: row.serviceChecklists ?? null,
          },
        },
        $setOnInsert: {
          tenantId: tenantOid,
          commandServicingId,
          workOrderId: null,
          serviceTaskIds: [],
          performedById: userOid,
          createdAt: now,
        },
      },
      { upsert: true },
    );
    if (upsert.upsertedCount > 0) result.created++;

    if (approved) {
      // Advance the asset's last-service baseline ($max never regresses).
      const $max: Record<string, unknown> = { lastServiceDate: performedAt };
      if (meterAtService != null) {
        if (meterType === 'engine_hours') { $max.lastServiceEngineHours = meterAtService; $max.currentEngineHours = meterAtService; }
        else { $max.lastServiceMileage = meterAtService; $max.currentOdometer = meterAtService; }
      }
      await assetsCol.updateOne({ _id: asset._id, tenantId: tenantOid }, { $max, $set: { updatedAt: now } });

      if (meterAtService != null && meterType) {
        await upsertMeterReading(tenantOid, asset._id, userOid, {
          meterType, value: meterAtService, readingAt: performedAt, source: 'service', commandRefId: commandServicingId,
        });
      }
    }
  }

  result.nextCursor = hasMore ? page + 1 : null;
  result.done = !hasMore;
  return result;
}

// ─── 3) Prestarts → inspectionSubmissions ────────────────────────────────────

/** The synthetic AM form legacy Command pre-starts hang under (one per tenant). */
async function ensureLegacyPrestartForm(tenantOid: ObjectId, userOid: ObjectId): Promise<ObjectId> {
  const forms = await getFormsCollection();
  const now = new Date();
  await forms.updateOne(
    { tenantId: tenantOid, source: 'command-legacy' },
    {
      $setOnInsert: {
        tenantId: tenantOid,
        source: 'command-legacy',
        formId: `command-legacy-prestart-${tenantOid.toHexString()}`,
        formTitle: 'Pre-start (Command legacy)',
        schema: null,
        versionNumber: 1,
        createdBy: userOid,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  const doc = await forms.findOne({ tenantId: tenantOid, source: 'command-legacy' }, { projection: { _id: 1 } });
  return doc!._id;
}

/** Command prestart question id → question text (best-effort, cached per call). */
async function loadQuestionMap(authTenantId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    for (let page = 1; page <= 20; page++) {
      const { rows, hasMore } = await fetchPage('/api/prestart-questions', authTenantId, page, 200);
      for (const row of rows) {
        const id = str(row._id);
        const text = str(row.question) ?? str(row.text) ?? str(row.name) ?? str(row.title);
        if (id && text) map.set(id, text);
      }
      if (!hasMore) break;
    }
  } catch {
    // Missing question text degrades to ids in the response payload — not fatal.
  }
  return map;
}

async function importInspections(
  tenantOid: ObjectId,
  userOid: ObjectId,
  authTenantId: string,
  cursor: number,
): Promise<HistoryBatchResult> {
  const result: HistoryBatchResult = {
    entity: 'inspections', processed: 0, created: 0, skipped: 0, errors: [], nextCursor: null, done: false,
  };
  const assetMap = await loadAssetMap(tenantOid);
  const formOid = await ensureLegacyPrestartForm(tenantOid, userOid);
  const questionMap = await loadQuestionMap(authTenantId);

  const page = Math.max(1, cursor);
  const { rows, hasMore } = await fetchPage('/api/prestarts', authTenantId, page);
  const submissionsCol = await getInspectionSubmissionsCollection();

  // Pre-starts are immutable history: insert-if-missing (no upsert churn).
  const commandIds = rows.map((r) => str(r._id)).filter(Boolean) as string[];
  const existing = await submissionsCol
    .find({ tenantId: tenantOid, commandPrestartId: { $in: commandIds } }, { projection: { commandPrestartId: 1 } })
    .toArray();
  const existingIds = new Set(existing.map((d) => String(d.commandPrestartId)));

  const newRows = rows.filter((r) => {
    const id = str(r._id);
    return id && !existingIds.has(id);
  });
  let nextNumber = newRows.length > 0
    ? await reserveCounter(`inspection_${tenantOid.toHexString()}`, newRows.length)
    : 0;

  const now = new Date();
  for (const row of rows) {
    result.processed++;
    const commandPrestartId = str(row._id);
    if (!commandPrestartId) { result.skipped++; continue; }
    if (existingIds.has(commandPrestartId)) { result.skipped++; continue; }

    const info = row.assetInformation ?? {};
    const asset = assetMap.get(str(info.assetId) ?? '');
    // Keep the record even when the asset is unmapped (assetId null) — no loss.
    const response: Record<string, unknown> = {};
    for (const q of Array.isArray(row.questions) ? row.questions : []) {
      const qid = str(q.questionId) ?? 'question';
      const label = questionMap.get(qid) ?? qid;
      const parts = [str(q.answer) ?? ''];
      if (str(q.comment)) parts.push(`(comment: ${str(q.comment)})`);
      if (str(q.image)) parts.push(`(photo: ${str(q.image)})`);
      response[label] = parts.filter(Boolean).join(' ');
    }
    if (str(row.otherItemsChecked)) response['Other items checked'] = str(row.otherItemsChecked);

    const submittedAt = toDate(info.dateTime) ?? toDate(row.createdAt) ?? now;
    const odo = num(info.odometer);
    const engine = num(info.engineHours);

    await submissionsCol.insertOne({
      tenantId: tenantOid,
      commandPrestartId,
      inspectionNumber: `INS-${String(nextNumber++).padStart(4, '0')}`,
      formId: formOid,
      formTitle: 'Pre-start (Command legacy)',
      formVersion: 1,
      assetId: asset?._id ?? null,
      assetName: asset?.name ?? str(row._display_assetId) ?? str(info.assetName) ?? null,
      unitNumber: null,
      driverId: null,
      operatorId: null,
      operatorName: str(row._display_operatorId) ?? str(info.operatorName) ?? null,
      response,
      result: 'pass', // legacy pre-starts had no pass/fail — faults live in the payload
      defects: [],
      faultsComments: str(row.commentsAndFaults) ?? null,
      photos: Array.isArray(row.additionalImages) ? row.additionalImages : null,
      safeToOperate: null,
      submittedBy: null,
      submitterInfo: null,
      externalSubmissionId: null,
      submittedAt,
      createdAt: now,
      updatedAt: now,
      source: 'command',
      commandData: {
        projectName: str(row._display_projectId) ?? null,
        hubometer: info.hubometer ?? null,
        lubricantFluidUsed: row.lubricantFluidUsed ?? null,
      },
    });
    result.created++;

    if (asset) {
      if (odo != null) {
        await upsertMeterReading(tenantOid, asset._id, userOid, {
          meterType: 'odometer', value: odo, readingAt: submittedAt, source: 'prestart', commandRefId: commandPrestartId,
        });
      }
      if (engine != null) {
        await upsertMeterReading(tenantOid, asset._id, userOid, {
          meterType: 'engine_hours', value: engine, readingAt: submittedAt, source: 'prestart', commandRefId: commandPrestartId,
        });
      }
    }
  }

  result.nextCursor = hasMore ? page + 1 : null;
  result.done = !hasMore;
  return result;
}

// ─── 4) Job cards / items → workOrders + faults ──────────────────────────────

const COMPLETED_STATUS_RE = /completed|approved|closed|invoiced|done/i;

/** Map (creating if missing) a Command status label onto an AM WO status. */
async function resolveStatusId(
  tenantOid: ObjectId,
  userOid: ObjectId,
  cache: Map<string, ObjectId>,
  label: string,
): Promise<{ statusId: ObjectId; statusLabel: string }> {
  const key = label.toLowerCase();
  const cached = cache.get(key);
  if (cached) return { statusId: cached, statusLabel: label };

  const col = await getWorkOrderStatusesCollection();
  const now = new Date();
  await col.updateOne(
    { tenantId: tenantOid, label: { $regex: `^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, isArchived: { $ne: true } },
    {
      $setOnInsert: {
        tenantId: tenantOid,
        label,
        color: COMPLETED_STATUS_RE.test(label) ? '#10b981' : '#64748b',
        description: 'Imported from Command workshop',
        sequence: 100,
        createdBy: userOid,
        updatedBy: userOid,
        createdAt: now,
        updatedAt: now,
        isActive: true,
        isArchived: false,
      },
    },
    { upsert: true },
  );
  const doc = await col.findOne(
    { tenantId: tenantOid, label: { $regex: `^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, isArchived: { $ne: true } },
    { projection: { _id: 1, label: 1 } },
  );
  cache.set(key, doc!._id);
  return { statusId: doc!._id, statusLabel: (doc!.label as string) || label };
}

async function importWorkOrders(
  tenantOid: ObjectId,
  userOid: ObjectId,
  authTenantId: string,
  cursor: number,
): Promise<HistoryBatchResult> {
  const result: HistoryBatchResult = {
    entity: 'workOrders', processed: 0, created: 0, skipped: 0, errors: [], nextCursor: null, done: false,
  };
  const assetMap = await loadAssetMap(tenantOid);
  const workshopParts = await loadWorkshopPartsMap(authTenantId);
  const statusCache = new Map<string, ObjectId>();

  const page = Math.max(1, cursor);
  const { rows, hasMore } = await fetchPage('/api/workshop/job-cards', authTenantId, page, JOBCARD_BATCH);

  const woCol = await getWorkOrdersCollection();
  const defectsCol = await getDefectsCollection();
  const now = new Date();

  for (const row of rows) {
    result.processed++;
    const commandJobCardId = str(row._id);
    if (!commandJobCardId) { result.skipped++; continue; }

    // Comprehensive = job card + items (+ their parts) in one service call.
    let comp: any = null;
    const compRes = await commandRequest<any>(
      `/api/workshop/job-cards/${encodeURIComponent(commandJobCardId)}/comprehensive`,
      authTenantId,
      { timeoutMs: HISTORY_FETCH_TIMEOUT_MS },
    );
    if (compRes.ok) comp = compRes.data?.data ?? null;
    const card = comp?.jobCard ?? comp ?? row;
    const items: any[] = Array.isArray(comp?.jobItems) ? comp.jobItems
      : Array.isArray(comp?.jobItemsDetails) ? comp.jobItemsDetails
      : Array.isArray(card?.jobItemsDetails) ? card.jobItemsDetails
      : [];

    const asset = assetMap.get(str(card.assetId ?? row.assetId) ?? '');
    if (!asset) {
      result.skipped++;
      result.errors.push(`job card ${str(card.jobNumber) ?? commandJobCardId}: asset not imported/external (${str(card.assetId)})`);
      continue;
    }

    const statusLabelRaw =
      str(comp?.statusDetails?.name) ?? str(comp?.statusDetails?.label) ??
      str(row._display_statusId) ?? str(card.statusLabel) ?? 'Imported';
    const { statusId, statusLabel } = await resolveStatusId(tenantOid, userOid, statusCache, statusLabelRaw);
    const isCompleted = COMPLETED_STATUS_RE.test(statusLabel);

    // Parts on items → already-consumed Command stock lines (never re-pushed).
    // Joined from the workshop parts register by job-item id — the
    // comprehensive payload itself only carries partsIds, no quantities/costs.
    const parts: any[] = [];
    let partsCost = 0;
    for (const item of items) {
      const itemId = str(item._id ?? item.id);
      const registerParts = itemId ? workshopParts.get(itemId) || [] : [];
      const inlineParts: any[] = Array.isArray(item.parts) ? item.parts : Array.isArray(item.partsDetails) ? item.partsDetails : [];
      const itemParts: any[] = registerParts.length > 0 ? registerParts : inlineParts;
      for (const p of itemParts) {
        const qty = num(p.quantity) ?? 0;
        const unitCost = num(p.cost) ?? num(p.unitCost) ?? 0;
        const line = Math.round(qty * unitCost * 100) / 100;
        parts.push({
          partId: null,
          partName: str(p.partName) ?? str(p.name) ?? 'Part',
          partNumber: str(p.partNumber) ?? str(p.code) ?? '',
          quantity: qty,
          unitCost,
          lineTotal: line,
          source: 'command',
          commandStockId: str(p.partId) ?? str(p.stockId) ?? undefined,
          pushedToCommand: true, // consumption already happened in Command's ledger
          commandTransactionId: null,
        });
        partsCost += line;
      }
    }
    partsCost = Math.round(partsCost * 100) / 100;

    // Faults: one AM defect (source 'fault') per job item, idempotent.
    const faultIds: ObjectId[] = [];
    for (const item of items) {
      const commandJobItemId = str(item._id ?? item.id);
      if (!commandJobItemId) continue;
      const itemStatus = str(item.status) ?? 'open';
      const corrected = /completed|approved|invoiced/i.test(itemStatus);
      const upsert = await defectsCol.updateOne(
        { tenantId: tenantOid, commandJobItemId },
        {
          $set: {
            name: str(item.title) ?? str(item.name) ?? 'Workshop item',
            comment: str(item.description) ?? '',
            assetId: asset._id,
            assetName: asset.name,
            status: corrected ? 'corrected' : /in_progress|assigned|on_hold/i.test(itemStatus) ? 'in_progress' : 'new',
            priority: 'medium',
            severity: 'non_critical',
            source: 'fault',
            commandData: { status: itemStatus, reportedCount: item.reportedCount ?? null },
            updatedBy: userOid,
            updatedAt: now,
          },
          $setOnInsert: {
            tenantId: tenantOid,
            commandJobItemId,
            defectNumber: `WS-${commandJobItemId.slice(-6).toUpperCase()}`,
            date: toDate(item.createdAt) ?? now,
            teamIds: [],
            driverId: null,
            driverName: null,
            attachments: [],
            createdBy: userOid,
            createdAt: now,
            isArchived: false,
            archivedAt: null,
            archivedBy: null,
          },
        },
        { upsert: true },
      );
      const defectDoc = await defectsCol.findOne(
        { tenantId: tenantOid, commandJobItemId }, { projection: { _id: 1 } },
      );
      if (defectDoc) faultIds.push(defectDoc._id);
      void upsert;
    }

    const staffNames: string[] = Array.isArray(comp?.enrichment?.staffNames)
      ? comp.enrichment.staffNames
      : Array.isArray(row._display_assignedStaffIds)
        ? row._display_assignedStaffIds
        : [];

    const completedAt = isCompleted ? (toDate(card.updatedAt) ?? now) : null;
    // Fields Command owns while the WO has never been touched in AM.
    const refreshFields: Record<string, unknown> = {
      workOrderNumber: str(card.jobNumber) ?? `JC-${commandJobCardId.slice(-6).toUpperCase()}`,
      assetId: asset._id,
      assetName: asset.name,
      statusId,
      statusLabel,
      assigneeType: 'mechanic',
      assigneeId: null,
      assigneeName: staffNames.join(', '),
      dueDate: toDate(card.due_date ?? card.dueDate),
      description: [str(card.title), str(card.description)].filter(Boolean).join(' — '),
      parts,
      partsCost,
      faultIds,
      isCompleted,
      completedAt,
      completedBy: null,
      source: 'fault',
      commandData: {
        priority: card.priority ?? null,
        projectName: str(comp?.enrichment?.projectName) ?? null,
        scheduleStartDate: card.schedule_start_date ?? null,
        workshopComponentId: card.workshopComponentId ?? null,
      },
      updatedBy: userOid,
      updatedAt: now,
    };

    // Two-step upsert so a re-run NEVER overwrites work done in AM: (1) insert
    // the full doc when the job card is new (marked commandImportManaged),
    // (2) refresh only while still import-managed — the first AM edit or
    // completion clears the marker and freezes the doc. The single-$set
    // version wiped AM-added parts (including pushedToCommand markers, which
    // enabled a second Command stock consumption on re-complete).
    const upsert = await woCol.updateOne(
      { tenantId: tenantOid, commandJobCardId },
      {
        $setOnInsert: {
          tenantId: tenantOid,
          commandJobCardId,
          commandImportManaged: true,
          serviceTaskIds: [],
          defectIds: [],
          attachments: [],
          statusHistory: [],
          createdBy: userOid,
          createdAt: toDate(card.createdAt) ?? now,
          isActive: true,
          isArchived: card.isArchived === true,
          archivedAt: null,
          archivedBy: null,
          ...refreshFields,
        },
      },
      { upsert: true },
    );
    if (upsert.upsertedCount > 0) {
      result.created++;
    } else {
      await woCol.updateOne(
        {
          tenantId: tenantOid,
          commandJobCardId,
          commandImportManaged: { $ne: false },
          // Legacy safety net: docs from before the marker existed that carry a
          // pushed Command line were worked in AM — never refresh those.
          'parts.pushedToCommand': { $ne: true },
        },
        { $set: refreshFields },
      );
    }

    // Back-link the WO onto its fault defects.
    if (faultIds.length > 0) {
      const woDoc = await woCol.findOne({ tenantId: tenantOid, commandJobCardId }, { projection: { _id: 1 } });
      if (woDoc) {
        await defectsCol.updateMany(
          { _id: { $in: faultIds }, tenantId: tenantOid },
          { $set: { workOrderId: woDoc._id, updatedAt: now } },
        );
      }
    }
  }

  result.nextCursor = hasMore ? page + 1 : null;
  result.done = !hasMore;
  return result;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function importHistoryBatch(
  tenantId: string,
  userId: string,
  authTenantId: string,
  entity: HistoryEntity,
  cursor = 1,
): Promise<HistoryBatchResult> {
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.isValid(userId) ? ObjectId.createFromHexString(userId) : new ObjectId();

  // Everything links through commandAssetId — assets must be imported first.
  const assetCount = await (await getAssetsCollection()).countDocuments({
    tenantId: tenantOid,
    source: 'command',
  });
  if (assetCount === 0) {
    return {
      entity, processed: 0, created: 0, skipped: 0,
      errors: ['No Command assets imported yet — run the master-data import (assets) first.'],
      nextCursor: null, done: true,
    };
  }

  switch (entity) {
    case 'servicePlans':
      return importServicePlans(tenantOid, userOid, authTenantId);
    case 'serviceHistory':
      return importServiceHistory(tenantOid, userOid, authTenantId, cursor);
    case 'inspections':
      return importInspections(tenantOid, userOid, authTenantId, cursor);
    case 'workOrders':
      return importWorkOrders(tenantOid, userOid, authTenantId, cursor);
  }
}
