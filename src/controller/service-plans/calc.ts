/**
 * Hierarchical next-service calculation — ported verbatim (behavior-for-behavior)
 * from construction-portal/lib/assets/nextServiceCalculation.ts so Asset Manager
 * computes servicing identically to Command.
 *
 * Hierarchy rule: schedules sharing a `serviceGroup` are linked by `sortOrder`.
 * A service log for a higher-sortOrder schedule counts as servicing every
 * lower-sortOrder schedule in the same group (Service C resets A + B). The most
 * urgent result across all schedules wins for the asset's rollup badge.
 */

import type { ScheduleItem } from './types';

export type NextServiceStatus = 'overdue' | 'due' | 'upcoming' | 'planned' | 'no-plan';

export interface NextServiceResult {
  value: number | null;
  unit: string;
  status: NextServiceStatus;
  nextCalendarDate?: Date | null;
}

/** Normalized service log (one completed service). Built from serviceHistory. */
export interface ServiceLog {
  /** The schedule this service was logged against — schedule id OR name. */
  scheduleRef: string | null;
  serviceDate: Date | null;
  odometer: number | null;
  hubometer: number | null;
  engineHours: number | null;
  /** Tie-breaker when two logs share a serviceDate. */
  createdAt?: Date | null;
}

export interface CurrentMeterReadings {
  odometer?: number | null;
  hubometer?: number | null;
  engineHours?: number | null;
}

export interface PerScheduleServiceInfo {
  scheduleId: string;
  scheduleName: string;
  unit: string;
  value: number | null;
  status: NextServiceStatus;
  interval: number;
  nextServiceAt: number | null;
  lastServiceReading: number | null;
  lastServicedAt: Date | null;
  nextCalendarDate: Date | null;
  currentReading: number | null;
  serviceGroup: number | null;
  /** Lower-order schedules implicitly completed when this one is serviced. */
  completedSchedules: string[];
  /** Service task this schedule performs, if one is linked — powers "Create Work Order". */
  serviceTaskId: string | null;
}

// ─── Thresholds (identical to Command) ──────────────────────────────────────
const DUE_THRESHOLD_KM = 100;
const DUE_THRESHOLD_HOURS = 10;
const DUE_THRESHOLD_DAYS = 7;
const UPCOMING_THRESHOLD_KM = 500;
const UPCOMING_THRESHOLD_HOURS = 50;
const UPCOMING_THRESHOLD_DAYS = 30;

const STATUS_RANK: Record<NextServiceStatus, number> = {
  overdue: 0,
  due: 1,
  upcoming: 2,
  planned: 3,
  'no-plan': 4,
};

// ─── Unit helpers ───────────────────────────────────────────────────────────
export function unitMatches(unit: string, pattern: string): boolean {
  const u = (unit || '').toLowerCase();
  if (pattern === 'Days') return u === 'days';
  if (pattern === 'Months') return u === 'months';
  if (pattern === 'Kilometers')
    return u.includes('km') || u.includes('kilometer') || u.includes('distance');
  if (pattern === 'Hours') return u.includes('hour') || u.includes('hr');
  return false;
}
function isCalendarUnit(unit: string): boolean {
  return unitMatches(unit, 'Days') || unitMatches(unit, 'Months');
}
function isMeterUnit(unit: string): boolean {
  return unitMatches(unit, 'Kilometers') || unitMatches(unit, 'Hours');
}
function displayUnit(unit: string): string {
  if (unitMatches(unit, 'Kilometers')) return 'Kms';
  if (unitMatches(unit, 'Hours')) return 'Hrs';
  if (unitMatches(unit, 'Days')) return 'Days';
  if (unitMatches(unit, 'Months')) return 'Months';
  return unit;
}

function scheduleIsActive(s: ScheduleItem): boolean {
  if (s.archived) return false;
  if (!s.recurring) return false;
  const n = Number(s.serviceInterval);
  return Number.isFinite(n) && n > 0;
}
function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function meterStatus(value: number, isKm: boolean): NextServiceStatus {
  const due = isKm ? DUE_THRESHOLD_KM : DUE_THRESHOLD_HOURS;
  const upcoming = isKm ? UPCOMING_THRESHOLD_KM : UPCOMING_THRESHOLD_HOURS;
  if (value < 0) return 'overdue';
  if (value <= due) return 'due';
  if (value <= upcoming) return 'upcoming';
  return 'planned';
}

function pickMoreUrgent(a: NextServiceResult, b: NextServiceResult): NextServiceResult {
  if (a.status === 'no-plan') return b.status === 'no-plan' ? a : b;
  if (b.status === 'no-plan') return a;
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status])
    return STATUS_RANK[a.status] < STATUS_RANK[b.status] ? a : b;
  const sameFamily =
    (isCalendarUnit(a.unit) && isCalendarUnit(b.unit)) ||
    (unitMatches(a.unit, 'Kilometers') && unitMatches(b.unit, 'Kilometers')) ||
    (unitMatches(a.unit, 'Hours') && unitMatches(b.unit, 'Hours'));
  if (sameFamily && a.value != null && b.value != null) return a.value <= b.value ? a : b;
  return a;
}

// ─── Hierarchy helpers (identical logic to Command) ─────────────────────────
interface GroupInfo {
  serviceGroup: number | null;
  sortOrder: number;
}

function buildGroupHelpers(active: ScheduleItem[]): {
  refToName: Map<string, string>;
  getGroupMatchNames: (name: string) => Set<string>;
  getCompletedSchedules: (name: string) => string[];
} {
  const refToName = new Map<string, string>();
  const groupInfo = new Map<string, GroupInfo>();

  for (const s of active) {
    const name = s.name || '';
    if (!name) continue;
    // A service log may reference the schedule by id OR name — map both to name.
    if (s.id) refToName.set(String(s.id), name);
    refToName.set(name, name);
    groupInfo.set(name, { serviceGroup: s.serviceGroup ?? null, sortOrder: s.sortOrder ?? 0 });
  }

  function getGroupMatchNames(scheduleName: string): Set<string> {
    const info = groupInfo.get(scheduleName);
    if (!info || info.serviceGroup == null) return new Set([scheduleName]);
    const names = new Set<string>();
    for (const [name, g] of groupInfo.entries()) {
      if (g.serviceGroup === info.serviceGroup && g.sortOrder >= info.sortOrder) names.add(name);
    }
    return names;
  }

  function getCompletedSchedules(scheduleName: string): string[] {
    const info = groupInfo.get(scheduleName);
    if (!info || info.serviceGroup == null) return [];
    const result: string[] = [];
    for (const [name, g] of groupInfo.entries()) {
      if (name !== scheduleName && g.serviceGroup === info.serviceGroup && g.sortOrder < info.sortOrder) {
        result.push(name);
      }
    }
    return result.sort(
      (a, b) => (groupInfo.get(a)?.sortOrder ?? 0) - (groupInfo.get(b)?.sortOrder ?? 0),
    );
  }

  return { refToName, getGroupMatchNames, getCompletedSchedules };
}

function findLogForGroup(
  logsNewestFirst: ServiceLog[],
  validNames: Set<string>,
  refToName: Map<string, string>,
): ServiceLog | undefined {
  return logsNewestFirst.find((l) => {
    if (l.scheduleRef == null) return false;
    const ref = String(l.scheduleRef);
    const resolvedName = refToName.get(ref) ?? ref;
    return validNames.has(resolvedName);
  });
}

// ─── Core calculation ───────────────────────────────────────────────────────
export function calculateAllScheduleServices(
  schedules: ScheduleItem[] | undefined,
  logsNewestFirst: ServiceLog[],
  currentMeters: CurrentMeterReadings,
): { perSchedule: PerScheduleServiceInfo[]; mostUrgent: NextServiceResult } {
  const emptyUrgent: NextServiceResult = { value: null, unit: '', status: 'no-plan', nextCalendarDate: null };
  if (!schedules?.length) return { perSchedule: [], mostUrgent: emptyUrgent };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const active = schedules.filter(scheduleIsActive);
  if (!active.length) return { perSchedule: [], mostUrgent: emptyUrgent };

  const sorted = [...logsNewestFirst].sort((a, b) => {
    const da = parseDate(a.serviceDate)?.getTime() ?? 0;
    const db = parseDate(b.serviceDate)?.getTime() ?? 0;
    if (db !== da) return db - da;
    const ca = parseDate(a.createdAt)?.getTime() ?? 0;
    const cb = parseDate(b.createdAt)?.getTime() ?? 0;
    return cb - ca;
  });

  const { refToName, getGroupMatchNames, getCompletedSchedules } = buildGroupHelpers(active);

  const perSchedule: PerScheduleServiceInfo[] = [];
  let mostUrgent: NextServiceResult | null = null;

  for (const schedule of active) {
    const scheduleName = schedule.name || '';
    const unit = schedule.unitOfMeasurement || '';
    const interval = Number(schedule.serviceInterval);

    const validNames = getGroupMatchNames(scheduleName);
    const lastLog = findLogForGroup(sorted, validNames, refToName);

    let value: number | null = null;
    let status: NextServiceStatus = 'no-plan';
    let nextServiceAt: number | null = null;
    let lastServiceReading: number | null = null;
    let lastServicedAt: Date | null = null;
    let nextCalendarDate: Date | null = null;
    let currentReading: number | null = null;

    if (isCalendarUnit(unit)) {
      lastServicedAt = lastLog ? parseDate(lastLog.serviceDate) : null;
      const base = lastServicedAt ? new Date(lastServicedAt) : new Date(today);
      base.setHours(0, 0, 0, 0);
      const nextDate = new Date(base);
      if (unitMatches(unit, 'Days')) nextDate.setDate(nextDate.getDate() + interval);
      else nextDate.setMonth(nextDate.getMonth() + interval);
      nextDate.setHours(0, 0, 0, 0);
      nextCalendarDate = nextDate;
      value = Math.ceil((nextDate.getTime() - today.getTime()) / 86400000);
      status =
        value <= 0 ? 'overdue' : value <= DUE_THRESHOLD_DAYS ? 'due' : value <= UPCOMING_THRESHOLD_DAYS ? 'upcoming' : 'planned';
    } else if (isMeterUnit(unit)) {
      const isKm = unitMatches(unit, 'Kilometers');
      currentReading = isKm
        ? currentMeters.odometer ?? currentMeters.hubometer ?? null
        : currentMeters.engineHours ?? null;
      if (lastLog) {
        lastServicedAt = parseDate(lastLog.serviceDate);
        lastServiceReading = isKm ? lastLog.odometer ?? lastLog.hubometer : lastLog.engineHours;
      }
      const effectiveCurrent = currentReading ?? 0;
      if (lastServiceReading != null) {
        nextServiceAt = lastServiceReading + interval;
        value = nextServiceAt - effectiveCurrent;
      } else {
        nextServiceAt = interval;
        value = interval - effectiveCurrent;
      }
      status = meterStatus(value, isKm);
    } else {
      continue;
    }

    const info: PerScheduleServiceInfo = {
      scheduleId: schedule.id,
      scheduleName,
      unit: displayUnit(unit),
      value,
      status,
      interval,
      nextServiceAt,
      lastServiceReading,
      lastServicedAt,
      nextCalendarDate,
      currentReading,
      serviceGroup: schedule.serviceGroup ?? null,
      completedSchedules: getCompletedSchedules(scheduleName),
      serviceTaskId: schedule.serviceTaskId ? String(schedule.serviceTaskId) : null,
    };
    perSchedule.push(info);

    const asResult: NextServiceResult = { value, unit: info.unit, status, nextCalendarDate };
    mostUrgent = mostUrgent ? pickMoreUrgent(mostUrgent, asResult) : asResult;
  }

  return { perSchedule, mostUrgent: mostUrgent ?? emptyUrgent };
}

/**
 * When a schedule is serviced, the hierarchy says lower-order schedules in its
 * group are implicitly done too. Returns the schedule NAMES that a service of
 * `scheduleId` also satisfies (for stamping onto the service-history record).
 */
export function schedulesCompletedBy(
  schedules: ScheduleItem[],
  scheduleId: string,
): string[] {
  const active = schedules.filter((s) => !s.archived);
  const { getCompletedSchedules } = buildGroupHelpers(active);
  const target = active.find((s) => s.id === scheduleId || s.name === scheduleId);
  if (!target) return [];
  return getCompletedSchedules(target.name);
}
