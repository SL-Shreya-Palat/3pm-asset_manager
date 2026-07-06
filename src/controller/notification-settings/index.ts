/**
 * Notification-settings controller — reads/writes the per-tenant routing config.
 *
 * `getEffectiveRules` merges the saved doc over `DEFAULT_RULES`, so every event
 * always resolves to a valid rule even before an admin saves anything.
 * `getRuleForType` is the single lookup the notification resolver uses at emit time.
 */
import { ObjectId } from 'mongodb';
import { getNotificationSettingsCollection } from '@/lib/mongodb';
import {
  AUDIENCE_VALUES,
  TEAM_ROLE_VALUES,
  CONFIGURABLE_EVENTS,
  CONFIGURABLE_EVENT_TYPES,
  defaultRuleFor,
  type Audience,
  type TeamRole,
  type NotificationRule,
  type NotificationSettingsDocument,
} from './types';

/** Coerce arbitrary stored/posted data into a valid rule (never throws). */
function normalizeRule(raw: unknown, fallback: NotificationRule): NotificationRule {
  const r = (raw ?? {}) as Partial<NotificationRule>;
  const audience: Audience = (AUDIENCE_VALUES as readonly string[]).includes(r.audience as string)
    ? (r.audience as Audience)
    : fallback.audience;
  const teamRoles = Array.isArray(r.teamRoles)
    ? r.teamRoles.filter((x): x is TeamRole => (TEAM_ROLE_VALUES as readonly string[]).includes(x as string))
    : [];
  return {
    audience,
    // A team rule with no roles selected would notify nobody — fall back to both.
    teamRoles: teamRoles.length > 0 ? teamRoles : ['managing', 'following'],
    ccAdmins: r.ccAdmins !== false, // default true
  };
}

/** Effective rules for every configurable event = saved merged over defaults. */
export async function getEffectiveRules(tenantId: string): Promise<Record<string, NotificationRule>> {
  const col = await getNotificationSettingsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const doc = (await col.findOne({ tenantId: tenantOid })) as NotificationSettingsDocument | null;

  const merged: Record<string, NotificationRule> = {};
  for (const event of CONFIGURABLE_EVENTS) {
    const fallback = defaultRuleFor(event);
    const saved = doc?.rules?.[event.type];
    merged[event.type] = saved ? normalizeRule(saved, fallback) : fallback;
  }
  return merged;
}

/**
 * The rule for one event type, or `null` when the type is NOT admin-configurable
 * (caller should then use its existing/default behaviour).
 */
export async function getRuleForType(tenantId: string, type: string): Promise<NotificationRule | null> {
  if (!CONFIGURABLE_EVENT_TYPES.has(type)) return null;
  const rules = await getEffectiveRules(tenantId);
  return rules[type] ?? null;
}

/** GET payload for the admin UI: the event catalogue + effective rules. */
export async function getNotificationSettings(tenantId: string) {
  const rules = await getEffectiveRules(tenantId);
  return { data: { events: CONFIGURABLE_EVENTS, rules }, error: null as string | null };
}

/** Upsert the routing rules (validates + drops unknown event keys). */
export async function upsertNotificationSettings(
  tenantId: string,
  userId: string,
  rulesInput: Record<string, unknown> | undefined,
) {
  if (!rulesInput || typeof rulesInput !== 'object') {
    return { data: null, error: 'rules must be an object' };
  }

  const cleaned: Record<string, NotificationRule> = {};
  for (const event of CONFIGURABLE_EVENTS) {
    const raw = rulesInput[event.type];
    if (raw && typeof raw === 'object') {
      cleaned[event.type] = normalizeRule(raw, defaultRuleFor(event));
    }
  }

  const col = await getNotificationSettingsCollection();
  const tenantOid = ObjectId.createFromHexString(tenantId);
  const userOid = ObjectId.createFromHexString(userId);

  await col.updateOne(
    { tenantId: tenantOid },
    {
      $set: { rules: cleaned, updatedAt: new Date(), updatedBy: userOid },
      $setOnInsert: { tenantId: tenantOid },
    },
    { upsert: true },
  );

  return getNotificationSettings(tenantId);
}
