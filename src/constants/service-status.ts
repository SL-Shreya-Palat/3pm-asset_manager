/**
 * Canonical service-schedule status → colour mapping.
 *
 * Servicing status must read the same as every other status badge in the app
 * (asset status, faults, work orders all use the shared Badge `variant`s:
 * success=green, warning=yellow, destructive=red, secondary=grey). This module
 * is the single source of truth so the asset overview bar and the Service tab
 * stay in lock-step.
 */

export type ServiceScheduleStatus = 'overdue' | 'due' | 'upcoming' | 'planned' | 'no-plan';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';

/** Badge variant per status — same visual language as asset / fault / work-order badges. */
export const SERVICE_STATUS_VARIANT: Record<ServiceScheduleStatus, BadgeVariant> = {
  overdue: 'destructive',
  due: 'warning',
  upcoming: 'secondary',
  planned: 'success',
  'no-plan': 'outline',
};

export const SERVICE_STATUS_LABEL: Record<ServiceScheduleStatus, string> = {
  overdue: 'Overdue',
  due: 'Due',
  upcoming: 'Upcoming',
  planned: 'Planned',
  'no-plan': 'No plan',
};

/** Plain-text colour for figures shown outside a Badge (e.g. "value till next"). */
export const SERVICE_STATUS_TEXT: Record<ServiceScheduleStatus, string> = {
  overdue: 'text-destructive',
  due: 'text-yellow-700',
  upcoming: 'text-gray-600',
  planned: 'text-green-700',
  'no-plan': 'text-muted-foreground',
};

/** Progress-bar fill colour + fill % for the overview "Next Service" bar. */
export const SERVICE_STATUS_BAR: Record<ServiceScheduleStatus, { bar: string; value: number }> = {
  overdue: { bar: 'bg-destructive', value: 100 },
  due: { bar: 'bg-yellow-500', value: 70 },
  upcoming: { bar: 'bg-gray-400', value: 45 },
  planned: { bar: 'bg-green-500', value: 30 },
  'no-plan': { bar: 'bg-muted-foreground/40', value: 0 },
};
