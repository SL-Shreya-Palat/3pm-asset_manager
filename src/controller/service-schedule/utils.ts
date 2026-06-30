/**
 * Service Schedule computation utilities.
 * Pure functions -- no DB access. Accept documents, return computed results.
 */
import type { ServiceScheduleItem, DueDimension, ScheduleStatus } from './types';

/** Status priority for sorting (lower = more urgent). */
const STATUS_PRIORITY: Record<ScheduleStatus, number> = {
  overdue: 0,
  due_soon: 1,
  upcoming: 2,
};

/**
 * Determine status for a single dimension given remaining value.
 * @param remaining - positive means "not yet due", negative means "overdue"
 * @param threshold - the reminder threshold (how much "before due" triggers due_soon)
 */
export function computeDimensionStatus(
  remaining: number,
  threshold: number,
): ScheduleStatus {
  if (remaining <= 0) return 'overdue';
  if (remaining <= threshold) return 'due_soon';
  return 'upcoming';
}

/** Add N calendar units to a Date, returning a new Date. */
export function addCalendarInterval(
  base: Date,
  every: number,
  unit: 'day' | 'week' | 'month' | 'year',
): Date {
  const result = new Date(base);
  switch (unit) {
    case 'day':
      result.setDate(result.getDate() + every);
      break;
    case 'week':
      result.setDate(result.getDate() + every * 7);
      break;
    case 'month':
      result.setMonth(result.getMonth() + every);
      break;
    case 'year':
      result.setFullYear(result.getFullYear() + every);
      break;
  }
  return result;
}

/** Convert a calendar threshold to days for comparison. */
export function thresholdCalendarToDays(value: number, unit: string): number {
  switch (unit) {
    case 'day':
      return value;
    case 'week':
      return value * 7;
    case 'month':
      return value * 30;
    case 'year':
      return value * 365;
    default:
      return value;
  }
}

/** Compute the number of days between now and a future date. */
export function daysUntil(futureDate: Date, now: Date = new Date()): number {
  const diffMs = futureDate.getTime() - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** Extract a numeric threshold value from reminders sub-document. */
function getThreshold(
  reminders: Record<string, unknown>,
  key: 'thresholdMileage' | 'thresholdEngineHours',
): number {
  const t = reminders[key] as { enabled: boolean; value: number } | undefined;
  return t?.enabled ? t.value : 0;
}

/**
 * Compute a single schedule item for a (program, asset) pair.
 *
 * @param program  - The service program document (from DB)
 * @param asset    - The asset document (from DB)
 * @param taskTitleMap - Map of serviceTaskId → title for display
 * @returns The schedule item, or null if no enabled conditions exist
 */
export function computeScheduleItem(
  program: Record<string, unknown>,
  asset: Record<string, unknown>,
  taskTitleMap: Map<string, string>,
): ServiceScheduleItem | null {
  const interval = program.interval as Record<string, unknown> | undefined;
  if (!interval) return null;

  const programId = (program._id as { toString(): string }).toString();
  const assetId = (asset._id as { toString(): string }).toString();
  const serviceTaskIds = ((program.serviceTaskIds || []) as Array<{ toString(): string }>).map(
    (id) => id.toString(),
  );
  const serviceTaskTitles = serviceTaskIds.map((id) => taskTitleMap.get(id) || id);

  const dueDimensions: DueDimension[] = [];
  const reminders = (program.reminders || {}) as Record<string, unknown>;
  const intervalType = (interval.type as string) || 'repeat';

  // ── REPEAT intervals ──
  if (intervalType === 'repeat') {
    // Mileage
    const mileage = interval.mileage as { enabled: boolean; every: number } | undefined;
    if (mileage?.enabled && mileage.every > 0) {
      const lastMi = (asset.lastServiceMileage as number) || 0;
      const currentMi = (asset.currentOdometer as number) || 0;
      const nextDue = lastMi + mileage.every;
      const remaining = nextDue - currentMi;
      const threshold = getThreshold(reminders, 'thresholdMileage');
      dueDimensions.push({
        type: 'mileage',
        nextDueValue: nextDue,
        currentValue: currentMi,
        remaining,
        unit: 'mi',
        status: computeDimensionStatus(remaining, threshold),
      });
    }

    // Engine Hours
    const engineHours = interval.engineHours as { enabled: boolean; every: number } | undefined;
    if (engineHours?.enabled && engineHours.every > 0) {
      const lastHrs = (asset.lastServiceEngineHours as number) || 0;
      const currentHrs = (asset.currentEngineHours as number) || 0;
      const nextDue = lastHrs + engineHours.every;
      const remaining = nextDue - currentHrs;
      const threshold = getThreshold(reminders, 'thresholdEngineHours');
      dueDimensions.push({
        type: 'engineHours',
        nextDueValue: nextDue,
        currentValue: currentHrs,
        remaining,
        unit: 'hrs',
        status: computeDimensionStatus(remaining, threshold),
      });
    }

    // Calendar
    const calendar = interval.calendar as
      | { enabled: boolean; every: number; unit: string }
      | undefined;
    if (calendar?.enabled && calendar.every > 0) {
      const lastDate = asset.lastServiceDate
        ? new Date(asset.lastServiceDate as string | Date)
        : null;
      if (lastDate && !isNaN(lastDate.getTime())) {
        const nextDueDate = addCalendarInterval(
          lastDate,
          calendar.every,
          calendar.unit as 'day' | 'week' | 'month' | 'year',
        );
        const remaining = daysUntil(nextDueDate);
        const thresholdCal = reminders.thresholdCalendar as
          | { enabled: boolean; value: number; unit: string }
          | undefined;
        const threshold = thresholdCal?.enabled
          ? thresholdCalendarToDays(thresholdCal.value, thresholdCal.unit)
          : 0;
        dueDimensions.push({
          type: 'calendar',
          nextDueValue: nextDueDate.toISOString(),
          currentValue: new Date().toISOString(),
          remaining,
          unit: 'days',
          status: computeDimensionStatus(remaining, threshold),
        });
      }
    }
  }

  // ── ONE_TIME intervals ──
  if (intervalType === 'one_time') {
    // Due Mileage
    const dueMileage = interval.dueMileage as
      | { enabled: boolean; mode: string; value: number }
      | undefined;
    if (dueMileage?.enabled && dueMileage.value > 0) {
      const currentMi = (asset.currentOdometer as number) || 0;
      const nextDue =
        dueMileage.mode === 'at'
          ? dueMileage.value
          : ((asset.lastServiceMileage as number) || 0) + dueMileage.value;
      const remaining = nextDue - currentMi;
      const threshold = getThreshold(reminders, 'thresholdMileage');
      dueDimensions.push({
        type: 'mileage',
        nextDueValue: nextDue,
        currentValue: currentMi,
        remaining,
        unit: 'mi',
        status: computeDimensionStatus(remaining, threshold),
      });
    }

    // Due Engine Hours
    const dueEngineHours = interval.dueEngineHours as
      | { enabled: boolean; mode: string; value: number }
      | undefined;
    if (dueEngineHours?.enabled && dueEngineHours.value > 0) {
      const currentHrs = (asset.currentEngineHours as number) || 0;
      const nextDue =
        dueEngineHours.mode === 'at'
          ? dueEngineHours.value
          : ((asset.lastServiceEngineHours as number) || 0) + dueEngineHours.value;
      const remaining = nextDue - currentHrs;
      const threshold = getThreshold(reminders, 'thresholdEngineHours');
      dueDimensions.push({
        type: 'engineHours',
        nextDueValue: nextDue,
        currentValue: currentHrs,
        remaining,
        unit: 'hrs',
        status: computeDimensionStatus(remaining, threshold),
      });
    }

    // Due On Date
    const dueOnDate = interval.dueOnDate as
      | { enabled: boolean; date?: Date | string }
      | undefined;
    if (dueOnDate?.enabled && dueOnDate.date) {
      const dueDate = new Date(dueOnDate.date);
      if (!isNaN(dueDate.getTime())) {
        const remaining = daysUntil(dueDate);
        const thresholdCal = reminders.thresholdCalendar as
          | { enabled: boolean; value: number; unit: string }
          | undefined;
        const threshold = thresholdCal?.enabled
          ? thresholdCalendarToDays(thresholdCal.value, thresholdCal.unit)
          : 0;
        dueDimensions.push({
          type: 'calendar',
          nextDueValue: dueDate.toISOString(),
          currentValue: new Date().toISOString(),
          remaining,
          unit: 'days',
          status: computeDimensionStatus(remaining, threshold),
        });
      }
    }
  }

  // No enabled conditions → skip this pair
  if (dueDimensions.length === 0) return null;

  // Overall status is the worst across all dimensions
  const status = dueDimensions.reduce<ScheduleStatus>(
    (worst, dim) => (STATUS_PRIORITY[dim.status] < STATUS_PRIORITY[worst] ? dim.status : worst),
    'upcoming',
  );

  // Urgency value for secondary sort: the minimum remaining across all dimensions
  const urgencyValue = Math.min(...dueDimensions.map((d) => d.remaining));

  return {
    id: `${programId}_${assetId}`,
    programId,
    programTitle: program.title as string,
    assetId,
    assetName: asset.name as string,
    assetNumber: (asset.assetNumber as string) || undefined,
    serviceTaskIds,
    serviceTaskTitles,
    intervalType: intervalType as 'repeat' | 'one_time',
    dueDimensions,
    status,
    sortPriority: STATUS_PRIORITY[status],
    urgencyValue,
  };
}

/**
 * Sort schedule items by urgency.
 * Primary: sortPriority ascending (overdue=0 first).
 * Secondary: urgencyValue ascending (most overdue / nearest due first).
 */
export function sortScheduleItems(items: ServiceScheduleItem[]): ServiceScheduleItem[] {
  return items.sort((a, b) => {
    if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
    return a.urgencyValue - b.urgencyValue;
  });
}
