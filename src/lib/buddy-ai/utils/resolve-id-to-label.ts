/**
 * Buddy AI — Global ID-to-label resolver
 *
 * NEVER expose raw IDs to users. This util resolves IDs to human-readable labels
 * for any workflow, entity, or future feature. Schema-driven via optionsFrom.
 *
 * Usage:
 * - Confirmation summaries: buildResolvedSummary(context, fields, collectedData)
 * - Edit selectors: resolveValueToDisplay() per field with optionsFrom
 * - Any UI displaying collected data: use these helpers
 *
 * To add support for new entities:
 * 1. Extend OptionsFromTool in workflows/types.ts
 * 2. Add the case in getOptionsForField() below
 */

import type { BuddyAIContext } from "./rbac";
import type { WorkflowFieldDefinition } from "../workflows/types";
import type { DropdownOption } from "../types";
import {
  listBusinessContacts,
  getStaffDirectory,
  getSitesForContact,
  listProjects,
} from "../tools";
import { canAccessTool } from "./rbac";

/** Get dropdown options for a field. Used by orchestrators and resolver. */
export async function getOptionsForField(
  context: BuddyAIContext,
  field: WorkflowFieldDefinition,
  collectedData: Record<string, unknown>
): Promise<DropdownOption[]> {
  if (!field.optionsFrom) return [];

  switch (field.optionsFrom) {
    case "list_business_contacts": {
      if (!canAccessTool(context, "list_business_contacts")) return [];
      const role = field.roleFilter;
      const result = await listBusinessContacts(context, {
        ...(role && { role }),
        limit: 100,
      });
      return result.businessContacts.map((c) => ({ value: c.id, label: c.name }));
    }
    case "get_staff_directory": {
      if (!canAccessTool(context, "get_staff_directory")) return [];
      const result = await getStaffDirectory(context);
      return result.staff.map((s) => ({ value: s.id, label: s.name }));
    }
    case "get_sites_for_contact": {
      const clientId = collectedData.client as string | undefined;
      if (!clientId?.trim()) return [];
      const result = await getSitesForContact(context, clientId);
      return result.sites;
    }
    case "list_projects": {
      if (!canAccessTool(context, "list_projects")) return [];
      const result = await listProjects(context);
      return result.projects.map((p) => ({ value: p.id, label: p.name }));
    }
    default:
      return [];
  }
}

/**
 * Resolve a single ID value to its display label.
 * For fields with optionsFrom: fetches options, finds match, returns label.
 * For other fields: returns value as-is (already human-readable).
 */
export async function resolveValueToDisplay(
  context: BuddyAIContext,
  field: WorkflowFieldDefinition,
  value: unknown,
  collectedData: Record<string, unknown>
): Promise<string> {
  if (field.chipOptions && Array.isArray(value)) {
    const labels = value
      .map((v) => field.chipOptions!.find((o) => o.value === String(v).trim())?.label)
      .filter(Boolean);
    return labels.length > 0 ? labels.join(", ") : "—";
  }
  if (!field.optionsFrom) {
    return String(value ?? "");
  }
  const options = await getOptionsForField(context, field, collectedData);
  const strValue = String(value ?? "").trim();
  const option = options.find((o) => o.value === strValue);
  return option?.label ?? "—";
}

/**
 * Build a summary object with all IDs resolved to labels.
 * Use this for confirmation steps, edit selectors, or any UI displaying collected data.
 *
 * @param context — Buddy AI context
 * @param fields — All fields (required + optional) from workflow schema
 * @param collectedData — Raw collected data (may contain IDs)
 * @returns Summary with human-readable values only (only includes fields the user has filled)
 */
export async function buildResolvedSummary(
  context: BuddyAIContext,
  fields: WorkflowFieldDefinition[],
  collectedData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const summary: Record<string, unknown> = {};
  for (const f of fields) {
    const v = collectedData[f.name];
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    summary[f.label] =
      f.chipOptions || f.optionsFrom
        ? await resolveValueToDisplay(context, f, v, collectedData)
        : v;
  }
  return summary;
}
