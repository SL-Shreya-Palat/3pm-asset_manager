/**
 * Service due-status engine (query-time, no scheduler — matches Whip Around v1).
 *
 * For each program assigned to an asset we compute, per trigger, whether the
 * service is `ok` / `due_soon` / `overdue` / `unknown`, based on the asset's
 * current meter + today's date vs the interval and the last time the program
 * was performed (derived from serviceHistory, falling back to the asset's
 * last-service fields, then to "now"/current meter so a freshly-assigned
 * program never reads as already overdue).
 */
import { ObjectId } from 'mongodb';
import {
  getAssetsCollection,
  getServiceProgramsCollection,
  getServiceHistoryCollection,
} from '@/lib/mongodb';

export type ServiceStatus = 'ok' | 'due_soon' | 'overdue' | 'unknown';

interface Trigger {
  triggerType: string;
  intervalType: string;
  interval: number;
  timeUnit?: string;
  reminderThreshold?: number;
}

interface Baseline {
  lastDate: Date;
  lastOdometer: number | null;
  lastEngineHours: number | null;
  hasHistory: boolean;
}

interface Current {
  now: Date;
  odometer: number | null;
  engineHours: number | null;
}

export interface TriggerStatus {
  triggerType: string;
  status: ServiceStatus;
  label: string;
  remaining: number | null;
}

const STATUS_RANK: Record<ServiceStatus, number> = { overdue: 3, due_soon: 2, ok: 1, unknown: 0 };

function addTime(base: Date, interval: number, unit?: string): Date {
  const d = new Date(base);
  if (unit === 'weeks') d.setDate(d.getDate() + interval * 7);
  else if (unit === 'months') d.setMonth(d.getMonth() + interval);
  else d.setDate(d.getDate() + interval); // days (default)
  return d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function meterStatusOf(remaining: number, threshold: number): ServiceStatus {
  if (remaining < 0) return 'overdue';
  if (threshold > 0 && remaining <= threshold) return 'due_soon';
  return 'ok';
}

/** Pure: compute a program's status from its triggers + baseline + current. */
export function computeProgramStatus(
  triggers: Trigger[],
  baseline: Baseline,
  current: Current,
): { status: ServiceStatus; triggers: TriggerStatus[] } {
  const results: TriggerStatus[] = triggers.map((t) => {
    const threshold = t.reminderThreshold ?? 0;

    // One-time service already performed → satisfied.
    if (t.intervalType === 'one_time' && baseline.hasHistory) {
      return { triggerType: t.triggerType, status: 'ok', label: 'Completed', remaining: null };
    }

    if (t.triggerType === 'time') {
      const nextDue = addTime(baseline.lastDate, t.interval, t.timeUnit);
      const remaining = daysBetween(current.now, nextDue);
      const status: ServiceStatus = remaining < 0 ? 'overdue' : threshold > 0 && remaining <= threshold ? 'due_soon' : 'ok';
      const label = remaining < 0 ? `Overdue by ${-remaining} day(s)` : `Due in ${remaining} day(s)`;
      return { triggerType: t.triggerType, status, label, remaining };
    }

    if (t.triggerType === 'distance') {
      if (current.odometer == null) {
        return { triggerType: t.triggerType, status: 'unknown', label: 'No odometer reading', remaining: null };
      }
      const base = baseline.lastOdometer ?? current.odometer;
      const nextDue = base + t.interval;
      const remaining = nextDue - current.odometer;
      const status = meterStatusOf(remaining, threshold);
      const label = remaining < 0 ? `Overdue by ${-remaining} mi/km` : `Due in ${remaining} mi/km`;
      return { triggerType: t.triggerType, status, label, remaining };
    }

    if (t.triggerType === 'engine_hours') {
      if (current.engineHours == null) {
        return { triggerType: t.triggerType, status: 'unknown', label: 'No engine-hours reading', remaining: null };
      }
      const base = baseline.lastEngineHours ?? current.engineHours;
      const nextDue = base + t.interval;
      const remaining = nextDue - current.engineHours;
      const status = meterStatusOf(remaining, threshold);
      const label = remaining < 0 ? `Overdue by ${-remaining} hour(s)` : `Due in ${remaining} hour(s)`;
      return { triggerType: t.triggerType, status, label, remaining };
    }

    return { triggerType: t.triggerType, status: 'unknown', label: '', remaining: null };
  });

  const status = results.reduce<ServiceStatus>(
    (worst, r) => (STATUS_RANK[r.status] > STATUS_RANK[worst] ? r.status : worst),
    'unknown',
  );
  return { status: results.length ? status : 'unknown', triggers: results };
}

/** Compute service status for every program assigned to an asset. */
export async function getAssetServiceStatus(tenantId: string, assetId: string) {
  if (!ObjectId.isValid(assetId)) return { items: [], summary: { overdue: 0, dueSoon: 0, ok: 0 } };
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const assetOid = ObjectId.createFromHexString(assetId);

  const [assetsCol, programsCol, historyCol] = await Promise.all([
    getAssetsCollection(),
    getServiceProgramsCollection(),
    getServiceHistoryCollection(),
  ]);

  const asset = await assetsCol.findOne({ _id: assetOid, tenantId: tenantOid });
  if (!asset) return { items: [], summary: { overdue: 0, dueSoon: 0, ok: 0 } };

  const programs = await programsCol
    .find({ tenantId: tenantOid, assetIds: assetOid, isArchived: { $ne: true } })
    .sort({ title: 1 })
    .toArray();
  if (programs.length === 0) return { items: [], summary: { overdue: 0, dueSoon: 0, ok: 0 } };

  const history = await historyCol
    .find({ tenantId: tenantOid, assetId: assetOid })
    .sort({ performedAt: -1 })
    .toArray();

  const now = new Date();
  const current: Current = {
    now,
    odometer: typeof asset.currentOdometer === 'number' ? asset.currentOdometer : null,
    engineHours: typeof asset.currentEngineHours === 'number' ? asset.currentEngineHours : null,
  };

  const summary = { overdue: 0, dueSoon: 0, ok: 0 };

  const items = programs.map((program) => {
    const programId = program._id.toString();
    const entry = history.find((h) =>
      Array.isArray(h.servicePrograms) && (h.servicePrograms as ObjectId[]).some((id) => id.toString() === programId),
    );

    const baseline: Baseline = entry
      ? {
          lastDate: entry.performedAt as Date,
          lastOdometer: entry.meterType === 'odometer' && typeof entry.meterAtService === 'number'
            ? (entry.meterAtService as number)
            : (asset.lastServiceMileage as number) ?? current.odometer,
          lastEngineHours: entry.meterType === 'engine_hours' && typeof entry.meterAtService === 'number'
            ? (entry.meterAtService as number)
            : (asset.lastServiceEngineHours as number) ?? current.engineHours,
          hasHistory: true,
        }
      : {
          lastDate: (asset.lastServiceDate as Date) ?? now,
          lastOdometer: (asset.lastServiceMileage as number) ?? current.odometer,
          lastEngineHours: (asset.lastServiceEngineHours as number) ?? current.engineHours,
          hasHistory: false,
        };

    const { status, triggers } = computeProgramStatus(
      (program.triggers as Trigger[]) || [],
      baseline,
      current,
    );

    if (status === 'overdue') summary.overdue++;
    else if (status === 'due_soon') summary.dueSoon++;
    else if (status === 'ok') summary.ok++;

    return {
      programId,
      title: (program.title as string) || '',
      category: (program.category as string) || '',
      status,
      triggers,
      serviceTaskIds: ((program.serviceTaskIds as ObjectId[]) || []).map((id) => id.toString()),
      lastPerformedAt: entry ? new Date(entry.performedAt as Date).toISOString() : null,
    };
  });

  return { items, summary };
}
