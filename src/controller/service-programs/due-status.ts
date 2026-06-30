/**
 * Service due-status engine (query-time, no scheduler — matches Whip Around v1).
 *
 * For each program assigned to an asset we compute, per condition, whether the
 * service is `ok` / `due_soon` / `overdue` / `unknown`, from the program's
 * `interval` (repeat: mileage / engine-hours / calendar — or one-time conditions)
 * + `reminders` thresholds, vs the asset's current meter / today's date and the
 * last time the program was performed (from serviceHistory, falling back to the
 * asset's last-service fields, then to "now"/current meter so a freshly-assigned
 * program never reads as already overdue).
 */
import { ObjectId } from 'mongodb';
import {
  getAssetsCollection,
  getServiceProgramsCollection,
  getServiceHistoryCollection,
} from '@/lib/mongodb';

export type ServiceStatus = 'ok' | 'due_soon' | 'overdue' | 'unknown';

interface MeterCondition { enabled?: boolean; every?: number }
interface CalendarCondition { enabled?: boolean; every?: number; unit?: string }
interface OneTimeMeter { enabled?: boolean; mode?: string; value?: number }
interface OneTimeDate { enabled?: boolean; date?: Date | string }

interface ProgramInterval {
  type?: string;
  mileage?: MeterCondition;
  engineHours?: MeterCondition;
  calendar?: CalendarCondition;
  dueMileage?: OneTimeMeter;
  dueEngineHours?: OneTimeMeter;
  dueOnDate?: OneTimeDate;
}

interface ProgramReminders {
  thresholdMileage?: { enabled?: boolean; value?: number };
  thresholdEngineHours?: { enabled?: boolean; value?: number };
  thresholdCalendar?: { enabled?: boolean; value?: number; unit?: string };
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

/** Add a calendar interval (day/week/month/year) to a date. */
function addCalendar(base: Date, every: number, unit?: string): Date {
  const d = new Date(base);
  switch (unit) {
    case 'week': d.setDate(d.getDate() + every * 7); break;
    case 'month': d.setMonth(d.getMonth() + every); break;
    case 'year': d.setFullYear(d.getFullYear() + every); break;
    default: d.setDate(d.getDate() + every); // day
  }
  return d;
}

/** Convert a calendar amount to days (for threshold comparison). */
function toDays(value: number, unit?: string): number {
  switch (unit) {
    case 'week': return value * 7;
    case 'month': return value * 30;
    case 'year': return value * 365;
    default: return value;
  }
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function statusOf(remaining: number, threshold: number): ServiceStatus {
  if (remaining < 0) return 'overdue';
  if (threshold > 0 && remaining <= threshold) return 'due_soon';
  return 'ok';
}

/** Compute a program's status from its interval + reminders + baseline + current. */
export function computeProgramStatus(
  interval: ProgramInterval | undefined,
  reminders: ProgramReminders | undefined,
  baseline: Baseline,
  current: Current,
): { status: ServiceStatus; triggers: TriggerStatus[] } {
  const iv = interval || {};
  const rm = reminders || {};
  const results: TriggerStatus[] = [];

  const mileageThreshold = rm.thresholdMileage?.enabled ? rm.thresholdMileage.value || 0 : 0;
  const engineThreshold = rm.thresholdEngineHours?.enabled ? rm.thresholdEngineHours.value || 0 : 0;
  const calendarThresholdDays = rm.thresholdCalendar?.enabled
    ? toDays(rm.thresholdCalendar.value || 0, rm.thresholdCalendar.unit)
    : 0;

  const distance = (nextDue: number) => {
    if (current.odometer == null) {
      results.push({ triggerType: 'distance', status: 'unknown', label: 'No odometer reading', remaining: null });
      return;
    }
    const remaining = nextDue - current.odometer;
    results.push({
      triggerType: 'distance',
      status: statusOf(remaining, mileageThreshold),
      label: remaining < 0 ? `Overdue by ${-remaining} mi/km` : `Due in ${remaining} mi/km`,
      remaining,
    });
  };

  const engineHours = (nextDue: number) => {
    if (current.engineHours == null) {
      results.push({ triggerType: 'engine_hours', status: 'unknown', label: 'No engine-hours reading', remaining: null });
      return;
    }
    const remaining = nextDue - current.engineHours;
    results.push({
      triggerType: 'engine_hours',
      status: statusOf(remaining, engineThreshold),
      label: remaining < 0 ? `Overdue by ${-remaining} hour(s)` : `Due in ${remaining} hour(s)`,
      remaining,
    });
  };

  const onDate = (nextDue: Date) => {
    const remaining = daysBetween(current.now, nextDue);
    results.push({
      triggerType: 'time',
      status: statusOf(remaining, calendarThresholdDays),
      label: remaining < 0 ? `Overdue by ${-remaining} day(s)` : `Due in ${remaining} day(s)`,
      remaining,
    });
  };

  if (iv.type === 'one_time') {
    // A one-time service that's already been performed is satisfied.
    if (baseline.hasHistory) {
      return { status: 'ok', triggers: [{ triggerType: 'one_time', status: 'ok', label: 'Completed', remaining: null }] };
    }
    if (iv.dueMileage?.enabled) {
      const base = baseline.lastOdometer ?? current.odometer ?? 0;
      distance(iv.dueMileage.mode === 'in' ? base + (iv.dueMileage.value || 0) : iv.dueMileage.value || 0);
    }
    if (iv.dueEngineHours?.enabled) {
      const base = baseline.lastEngineHours ?? current.engineHours ?? 0;
      engineHours(iv.dueEngineHours.mode === 'in' ? base + (iv.dueEngineHours.value || 0) : iv.dueEngineHours.value || 0);
    }
    if (iv.dueOnDate?.enabled && iv.dueOnDate.date) {
      onDate(new Date(iv.dueOnDate.date));
    }
  } else {
    // Repeat — whichever condition occurs first.
    if (iv.mileage?.enabled && iv.mileage.every) {
      distance((baseline.lastOdometer ?? current.odometer ?? 0) + iv.mileage.every);
    }
    if (iv.engineHours?.enabled && iv.engineHours.every) {
      engineHours((baseline.lastEngineHours ?? current.engineHours ?? 0) + iv.engineHours.every);
    }
    if (iv.calendar?.enabled && iv.calendar.every) {
      onDate(addCalendar(baseline.lastDate, iv.calendar.every, iv.calendar.unit));
    }
  }

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
      program.interval as ProgramInterval | undefined,
      program.reminders as ProgramReminders | undefined,
      baseline,
      current,
    );

    if (status === 'overdue') summary.overdue++;
    else if (status === 'due_soon') summary.dueSoon++;
    else if (status === 'ok') summary.ok++;

    return {
      programId,
      title: (program.title as string) || '',
      status,
      triggers,
      serviceTaskIds: ((program.serviceTaskIds as ObjectId[]) || []).map((id) => id.toString()),
      lastPerformedAt: entry ? new Date(entry.performedAt as Date).toISOString() : null,
    };
  });

  return { items, summary };
}
