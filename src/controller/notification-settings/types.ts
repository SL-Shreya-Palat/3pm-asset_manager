/**
 * Types for the `notificationSettings` collection — one singleton doc per tenant
 * that controls WHO receives each fan-out notification.
 *
 * The routing model is SCOPE × ROLES:
 *   - scope  = how wide to look: the asset's `team`, the whole `company`, or `off`.
 *   - roles  = which role(s) within that scope receive it (intersection).
 *              An empty `roles` array means "everyone in scope".
 *
 * Example — "only the mechanic on the asset's team":
 *   { scope: 'team', roles: ['mechanic'] }
 *
 * Fallback (honoured by the resolver in `@/controller/notifications`): a `team`
 * rule on an asset with NO team falls back to the SAME roles company-wide, and
 * ultimately to the tenant's managers/owner — so an alert is never dropped.
 *
 * `CONFIGURABLE_EVENTS` + per-event `defaultRule` are the single source of truth
 * for both the admin UI and the server defaults, so the feature works with zero config.
 */
import { ObjectId } from 'mongodb';
import type { NotificationType } from '@/controller/notifications';

/** How wide to notify. */
export const SCOPE_VALUES = ['team', 'company', 'off'] as const;
export type NotificationScope = (typeof SCOPE_VALUES)[number];

/** Role buckets, aligned to the boolean flags on each role document. */
export const NOTIFY_ROLE_VALUES = ['admin', 'manager', 'team_manager', 'mechanic', 'driver'] as const;
export type NotifyRole = (typeof NOTIFY_ROLE_VALUES)[number];

/** How one event type is routed. */
export interface NotificationRule {
  /** `team` = the asset's team(s); `company` = whole org; `off` = nobody. */
  scope: NotificationScope;
  /** Which roles within the scope receive it. Empty = everyone in scope. */
  roles: NotifyRole[];
}

/** Stored document — one per tenant. */
export interface NotificationSettingsDocument {
  _id?: ObjectId;
  tenantId: ObjectId;
  /** Keyed by the configurable NotificationType subset. Missing keys fall back to the event default. */
  rules: Record<string, NotificationRule>;
  updatedAt: Date;
  updatedBy: ObjectId;
}

/** A configurable event, with UI metadata + its out-of-the-box routing. */
export interface ConfigurableEvent {
  type: NotificationType;
  label: string;
  description: string;
  /** True when the event is tied to an asset (so team scope is meaningful). */
  teamScoped: boolean;
  /** Out-of-the-box routing used until an admin saves something else. */
  defaultRule: NotificationRule;
}

/**
 * The events an admin can route. Direct-to-user notifications (work-order *assigned*
 * to a mechanic, PO submitted/approved/rejected to a specific approver) are NOT here —
 * they already target one person and are left untouched.
 *
 * Defaults are sensible per event: whoever acts on it (mechanic) + whoever oversees it
 * (manager), scoped to the asset's team; parts (no team) go to managers company-wide.
 */
export const CONFIGURABLE_EVENTS: ConfigurableEvent[] = [
  { type: 'defect_created', label: 'Defect reported', description: 'A defect was raised — from a failed inspection or reported manually.', teamScoped: true, defaultRule: { scope: 'team', roles: ['mechanic', 'manager'] } },
  { type: 'fault_reported', label: 'Fault reported', description: 'A fault was reported against an asset.', teamScoped: true, defaultRule: { scope: 'team', roles: ['mechanic', 'manager'] } },
  { type: 'inspection_submitted', label: 'Inspection submitted', description: 'A pre-start / inspection was submitted for an asset.', teamScoped: true, defaultRule: { scope: 'team', roles: ['manager'] } },
  { type: 'driver_check_failed', label: 'Driver failed wellness check', description: "A driver's wellness / pre-start check flagged them unfit for duty (fatigue, alcohol, etc.).", teamScoped: true, defaultRule: { scope: 'team', roles: ['manager', 'team_manager'] } },
  { type: 'work_order_created', label: 'Work order created', description: 'A new work order was created for an asset.', teamScoped: true, defaultRule: { scope: 'team', roles: ['mechanic', 'manager'] } },
  { type: 'work_order_completed', label: 'Work order completed', description: 'A work order was marked complete.', teamScoped: true, defaultRule: { scope: 'team', roles: ['manager'] } },
  { type: 'work_order_status_changed', label: 'Work order status changed', description: 'A work order moved to a new status.', teamScoped: true, defaultRule: { scope: 'team', roles: ['manager'] } },
  { type: 'service_due', label: 'Service due', description: 'An asset service is coming due.', teamScoped: true, defaultRule: { scope: 'team', roles: ['manager'] } },
  { type: 'service_overdue', label: 'Service overdue', description: 'An asset service is overdue.', teamScoped: true, defaultRule: { scope: 'team', roles: ['manager', 'admin'] } },
  { type: 'document_expiring', label: 'Compliance document expiring', description: 'An asset compliance document is expiring soon.', teamScoped: true, defaultRule: { scope: 'team', roles: ['manager'] } },
  { type: 'document_expired', label: 'Compliance document expired', description: 'An asset compliance document has expired.', teamScoped: true, defaultRule: { scope: 'team', roles: ['manager', 'admin'] } },
  { type: 'part_low_stock', label: 'Part low stock', description: 'An inventory part dropped to its minimum level. (Parts are not team-scoped.)', teamScoped: false, defaultRule: { scope: 'company', roles: ['manager'] } },
  { type: 'part_out_of_stock', label: 'Part out of stock', description: 'An inventory part reached zero stock. (Parts are not team-scoped.)', teamScoped: false, defaultRule: { scope: 'company', roles: ['manager'] } },
];

/** Set of configurable type keys (for fast membership checks). */
export const CONFIGURABLE_EVENT_TYPES: ReadonlySet<string> = new Set(CONFIGURABLE_EVENTS.map((e) => e.type));

/** Build a fresh default rule so callers can never mutate shared state. */
export function defaultRuleFor(event: ConfigurableEvent): NotificationRule {
  return { scope: event.defaultRule.scope, roles: [...event.defaultRule.roles] };
}
