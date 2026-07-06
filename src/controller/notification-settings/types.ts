/**
 * Types for the `notificationSettings` collection — one singleton doc per tenant
 * that controls WHO receives each "manager fan-out" notification.
 *
 * The routing is honoured by the notify helpers in `@/controller/notifications`.
 * `CONFIGURABLE_EVENTS` + `DEFAULT_RULES` are the single source of truth for both
 * the admin UI and the server-side defaults, so the feature works with zero config.
 */
import { ObjectId } from 'mongodb';
import type { NotificationType } from '@/controller/notifications';

export const AUDIENCE_VALUES = ['team', 'all_managers', 'off'] as const;
export type Audience = (typeof AUDIENCE_VALUES)[number];

export const TEAM_ROLE_VALUES = ['managing', 'following'] as const;
export type TeamRole = (typeof TEAM_ROLE_VALUES)[number];

/** How one event type is routed. */
export interface NotificationRule {
  /** `team` = the team(s) linked to the asset/entity; `all_managers` = every owner/admin/manager; `off` = nobody. */
  audience: Audience;
  /** When `audience === 'team'`, which team membership roles receive it. */
  teamRoles: TeamRole[];
  /** Always also notify org Admins/Owner (safety net) — regardless of team. */
  ccAdmins: boolean;
}

/** Stored document — one per tenant. */
export interface NotificationSettingsDocument {
  _id?: ObjectId;
  tenantId: ObjectId;
  /** Keyed by the configurable NotificationType subset. Missing keys fall back to DEFAULT_RULES. */
  rules: Record<string, NotificationRule>;
  updatedAt: Date;
  updatedBy: ObjectId;
}

/** A configurable event, with UI metadata. `teamScoped` events default to team routing. */
export interface ConfigurableEvent {
  type: NotificationType;
  label: string;
  description: string;
  /** True when the event is tied to an asset (so team routing is meaningful). */
  teamScoped: boolean;
}

/**
 * The events an admin can route. Direct-to-user notifications (work-order *assigned*
 * to a mechanic, PO submitted/approved/rejected to a specific approver) are NOT here —
 * they already target one person and are left untouched.
 */
export const CONFIGURABLE_EVENTS: ConfigurableEvent[] = [
  { type: 'defect_created', label: 'Defect reported', description: 'A defect was raised — from a failed inspection or reported manually.', teamScoped: true },
  { type: 'fault_reported', label: 'Fault reported', description: 'A fault was reported against an asset.', teamScoped: true },
  { type: 'inspection_submitted', label: 'Inspection submitted', description: 'A pre-start / inspection was submitted for an asset.', teamScoped: true },
  { type: 'work_order_created', label: 'Work order created', description: 'A new work order was created for an asset.', teamScoped: true },
  { type: 'work_order_completed', label: 'Work order completed', description: 'A work order was marked complete.', teamScoped: true },
  { type: 'work_order_status_changed', label: 'Work order status changed', description: 'A work order moved to a new status.', teamScoped: true },
  { type: 'service_due', label: 'Service due', description: 'An asset service is coming due.', teamScoped: true },
  { type: 'service_overdue', label: 'Service overdue', description: 'An asset service is overdue.', teamScoped: true },
  { type: 'document_expiring', label: 'Compliance document expiring', description: 'An asset compliance document is expiring soon.', teamScoped: true },
  { type: 'document_expired', label: 'Compliance document expired', description: 'An asset compliance document has expired.', teamScoped: true },
  { type: 'part_low_stock', label: 'Part low stock', description: 'An inventory part dropped to its minimum level. (Parts are not team-scoped.)', teamScoped: false },
  { type: 'part_out_of_stock', label: 'Part out of stock', description: 'An inventory part reached zero stock. (Parts are not team-scoped.)', teamScoped: false },
];

/** Set of configurable type keys (for fast membership checks). */
export const CONFIGURABLE_EVENT_TYPES: ReadonlySet<string> = new Set(CONFIGURABLE_EVENTS.map((e) => e.type));

/** Build a fresh default rule so callers can never mutate shared state. */
export function defaultRuleFor(event: ConfigurableEvent): NotificationRule {
  return event.teamScoped
    ? { audience: 'team', teamRoles: ['managing', 'following'], ccAdmins: true }
    : { audience: 'all_managers', teamRoles: ['managing', 'following'], ccAdmins: true };
}
