/**
 * Driver-inspection-settings controller (per-tenant singleton in
 * `driverInspectionSettings`).
 *
 * One org-wide policy: are driver inspections required, which driver-type form
 * must be completed, and how often (daily / weekly / monthly). When enabled, a
 * driver who hasn't completed the assigned form in the current period is blocked
 * by the in-app gate (see /api/inspections/my-due + DriverInspectionGate) until
 * they submit it.
 *
 * Status is computed on the fly from the `inspectionSubmissions` history — there
 * is no separate per-driver state to keep in sync.
 */
import { ObjectId } from 'mongodb';
import {
  getDriverInspectionSettingsCollection,
  getFormsCollection,
  getInspectionSubmissionsCollection,
} from '@/lib/mongodb';
import type {
  DriverInspectionSettingsDocument,
  DriverInspectionSettingsResponse,
  DriverInspectionSettingsInput,
  DriverInspectionFrequency,
  DriverInspectionDueResult,
  DriverInspectionStatus,
} from './types';
import { DRIVER_INSPECTION_FREQUENCIES } from './types';

const DEFAULT_FREQUENCY: DriverInspectionFrequency = 'daily';

function toOid(tenantId: ObjectId | string): ObjectId {
  return typeof tenantId === 'string' ? ObjectId.createFromHexString(tenantId) : tenantId;
}

/** Resolve a form's current title (empty when the form is missing). */
async function resolveFormTitle(tenantOid: ObjectId, formOid: ObjectId | null): Promise<string | null> {
  if (!formOid) return null;
  const forms = await getFormsCollection();
  const form = await forms.findOne(
    { formId: formOid, tenantId: tenantOid },
    { projection: { formTitle: 1 } },
  );
  return (form?.formTitle as string) ?? null;
}

async function serialize(
  tenantOid: ObjectId,
  doc: DriverInspectionSettingsDocument | null,
): Promise<DriverInspectionSettingsResponse> {
  const formId = (doc?.formId as ObjectId | null) ?? null;
  return {
    enabled: doc?.enabled ?? false,
    formId: formId ? formId.toHexString() : null,
    formTitle: await resolveFormTitle(tenantOid, formId),
    frequency: doc?.frequency ?? DEFAULT_FREQUENCY,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

/** Get the tenant's driver-inspection settings (defaults when never configured). */
export async function getDriverInspectionSettings(
  tenantId: string,
): Promise<DriverInspectionSettingsResponse> {
  const col = await getDriverInspectionSettingsCollection();
  const tenantOid = toOid(tenantId);
  const doc = (await col.findOne({ tenantId: tenantOid })) as DriverInspectionSettingsDocument | null;
  return serialize(tenantOid, doc);
}

/** Create or update the tenant's driver-inspection settings. */
export async function saveDriverInspectionSettings(
  tenantId: string,
  userId: string,
  input: DriverInspectionSettingsInput,
): Promise<DriverInspectionSettingsResponse> {
  const col = await getDriverInspectionSettingsCollection();
  const tenantOid = toOid(tenantId);
  const userOid = ObjectId.createFromHexString(userId);
  const now = new Date();

  const frequency: DriverInspectionFrequency = DRIVER_INSPECTION_FREQUENCIES.includes(input.frequency)
    ? input.frequency
    : DEFAULT_FREQUENCY;

  const formId =
    input.formId && ObjectId.isValid(input.formId) ? ObjectId.createFromHexString(input.formId) : null;

  await col.updateOne(
    { tenantId: tenantOid },
    {
      $set: {
        enabled: !!input.enabled,
        formId,
        frequency,
        updatedBy: userOid,
        updatedAt: now,
      },
      $setOnInsert: { tenantId: tenantOid, createdAt: now },
    },
    { upsert: true },
  );

  const doc = (await col.findOne({ tenantId: tenantOid })) as DriverInspectionSettingsDocument | null;
  return serialize(tenantOid, doc);
}

// ── Period maths (calendar periods, server-local time) ──────────────────────

/** Start of the current period for a frequency. */
function currentPeriodStart(frequency: DriverInspectionFrequency, now: Date): Date {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (frequency) {
    case 'daily':
      return new Date(y, m, d);
    case 'weekly': {
      // Week starts Monday. getDay(): 0=Sun … 6=Sat → Mon-based offset.
      const offset = (now.getDay() + 6) % 7;
      return new Date(y, m, d - offset);
    }
    case 'monthly':
      return new Date(y, m, 1);
  }
}

/** Start of the next period (used as "next due" for display). */
function nextPeriodStart(frequency: DriverInspectionFrequency, now: Date): Date {
  const start = currentPeriodStart(frequency, now);
  switch (frequency) {
    case 'daily':
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    case 'weekly':
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    case 'monthly':
      return new Date(start.getFullYear(), start.getMonth() + 1, 1);
  }
}

/** Start of the previous period (used to distinguish "due" from "overdue"). */
function previousPeriodStart(frequency: DriverInspectionFrequency, now: Date): Date {
  const start = currentPeriodStart(frequency, now);
  switch (frequency) {
    case 'daily':
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
    case 'weekly':
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
    case 'monthly':
      return new Date(start.getFullYear(), start.getMonth() - 1, 1);
  }
}

/**
 * Where a driver stands against the schedule right now.
 *
 * "Completed" = a submission of the assigned form tied to this driver within the
 * current period. Pass/fail doesn't matter here — that's the fitness flag's job;
 * this only tracks completion cadence.
 */
export async function computeDriverInspectionStatus(
  tenantId: string,
  driverId: string,
): Promise<DriverInspectionDueResult> {
  const tenantOid = toOid(tenantId);
  const settingsCol = await getDriverInspectionSettingsCollection();
  const settings = (await settingsCol.findOne({
    tenantId: tenantOid,
  })) as DriverInspectionSettingsDocument | null;

  const frequency = settings?.frequency ?? DEFAULT_FREQUENCY;
  const formOid = (settings?.formId as ObjectId | null) ?? null;
  const validDriver = ObjectId.isValid(driverId);

  const disabled = (): DriverInspectionDueResult => ({
    enabled: false,
    due: false,
    status: 'disabled',
    frequency,
    formId: formOid ? formOid.toHexString() : null,
    formTitle: null,
    driverId: validDriver ? driverId : null,
    lastCompletedAt: null,
    nextDueAt: null,
  });

  // Off, no form, or we can't identify the driver → nothing to enforce.
  if (!settings?.enabled || !formOid || !validDriver) return disabled();

  const driverOid = ObjectId.createFromHexString(driverId);
  const now = new Date();
  const periodStart = currentPeriodStart(frequency, now);
  const prevStart = previousPeriodStart(frequency, now);

  const submissionsCol = await getInspectionSubmissionsCollection();
  // Most recent completion of the assigned form for this driver (any time).
  const last = await submissionsCol.findOne(
    { tenantId: tenantOid, driverId: driverOid, formId: formOid },
    { projection: { submittedAt: 1 }, sort: { submittedAt: -1 } },
  );

  const lastAt = last?.submittedAt ? new Date(last.submittedAt as Date) : null;
  const formTitle = await resolveFormTitle(tenantOid, formOid);

  const completedThisPeriod = lastAt !== null && lastAt >= periodStart;

  let status: DriverInspectionStatus;
  if (completedThisPeriod) status = 'up_to_date';
  else if (lastAt === null || lastAt < prevStart) status = 'overdue';
  else status = 'due';

  return {
    enabled: true,
    due: status === 'due' || status === 'overdue',
    status,
    frequency,
    formId: formOid.toHexString(),
    formTitle,
    driverId,
    lastCompletedAt: lastAt ? lastAt.toISOString() : null,
    nextDueAt: nextPeriodStart(frequency, now).toISOString(),
  };
}
