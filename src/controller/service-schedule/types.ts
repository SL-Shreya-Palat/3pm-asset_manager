/**
 * Service Schedule domain types -- computed view, no collection.
 * Each item represents one (asset × plan schedule) pair with computed due info.
 */

/** Schedule item status. */
export const SCHEDULE_STATUSES = ['overdue', 'due_soon', 'upcoming'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

/** Due info for a single trigger dimension (mileage, engine hours, or calendar). */
export interface DueDimension {
  type: 'mileage' | 'engineHours' | 'calendar';
  /** The threshold at which service is next due. */
  nextDueValue: number | string;
  /** Current reading (number for meters, ISO string for calendar). */
  currentValue: number | string;
  /** How much remains (positive = not yet due, negative = overdue). */
  remaining: number;
  /** Unit label for display: 'mi', 'hrs', 'days'. */
  unit: string;
  /** Status for this individual dimension. */
  status: ScheduleStatus;
}

/** A single schedule row (one program-asset pair). */
export interface ServiceScheduleItem {
  /** Composite key: `${programId}_${assetId}` */
  id: string;
  programId: string;
  programTitle: string;
  assetId: string;
  assetName: string;
  assetNumber?: string;
  serviceTaskIds: string[];
  serviceTaskTitles: string[];
  intervalType: 'repeat' | 'one_time';
  /** All enabled due dimensions, computed. */
  dueDimensions: DueDimension[];
  /** Overall status: worst status across all dimensions. */
  status: ScheduleStatus;
  /** Sort priority: 0=overdue, 1=due_soon, 2=upcoming */
  sortPriority: number;
  /** The single "most urgent" remaining value for secondary sort. */
  urgencyValue: number;
}
