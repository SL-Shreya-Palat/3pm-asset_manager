/**
 * Buddy AI — Express Path Field Resolver
 *
 * Resolves extracted fields (from LLM routing) through entity resolvers.
 * Used by both create and update orchestrators to deduplicate the
 * entity resolution loop that previously existed in 4+ places.
 *
 * Returns one of three outcomes:
 *   - resolved: all fields resolved, collectedData ready
 *   - ambiguous: one field has multiple matches, needs user disambiguation
 *   - not_found: one field couldn't be resolved
 *
 * @see BUDDY_AI_V3_UPGRADE_PLAN.md Phase 3
 */

import type { BuddyAIContext } from "../utils/rbac";
import type { WorkflowFieldDefinition } from "../workflows/types";
import type { EntityResolver } from "../workflows/generic-types";

export type ResolveResult =
  | {
      status: "resolved";
      collectedData: Record<string, unknown>;
    }
  | {
      status: "ambiguous";
      field: WorkflowFieldDefinition;
      matches: { value: string; label: string }[];
      collectedData: Record<string, unknown>;
    }
  | {
      status: "not_found";
      field: WorkflowFieldDefinition;
      originalValue: string;
      collectedData: Record<string, unknown>;
    };

/**
 * Resolve extracted fields through entity resolvers.
 *
 * Iterates fields in schema order (required first, then optional).
 * For each field with an extracted value:
 *   - If an entity resolver exists → resolve (fuzzy match name → ID)
 *   - Otherwise → use the raw extracted value
 *
 * Stops on the first ambiguous or not-found field.
 *
 * @param context      - Buddy AI context (org, user, etc.)
 * @param extracted    - Raw extracted fields from routing (e.g. { name: "Fish Land", client: "Acme" })
 * @param fieldOrder   - Fields in order of resolution (typically [...requiredFields, ...optionalFields])
 * @param resolvers    - Entity resolvers keyed by field name
 * @param baseData     - Existing collected data to merge into
 */
export async function resolveExtractedFields(
  context: BuddyAIContext,
  extracted: Record<string, unknown>,
  fieldOrder: WorkflowFieldDefinition[],
  resolvers: Record<string, EntityResolver>,
  baseData: Record<string, unknown> = {}
): Promise<ResolveResult> {
  const collectedData = { ...baseData };

  for (const field of fieldOrder) {
    const raw = extracted[field.name];
    if (raw == null) continue;
    if (Array.isArray(raw) && raw.length === 0) continue;
    if (typeof raw === "string" && raw.trim() === "") continue;

    const resolver = resolvers[field.name];
    if (resolver) {
      const resolved = await resolver(context, String(raw), collectedData);
      if (resolved && "id" in resolved) {
        collectedData[field.name] = resolved.id;
      } else if (resolved && "status" in resolved && resolved.status === "ambiguous") {
        return { status: "ambiguous", field, matches: resolved.matches, collectedData };
      } else {
        return { status: "not_found", field, originalValue: String(raw), collectedData };
      }
    } else {
      collectedData[field.name] = raw;
    }
  }

  return { status: "resolved", collectedData };
}

/** Split role string by comma, " and ", or " & " — no regex. */
function splitRoleString(s: string): string[] {
  let result = [s];
  for (const delim of [",", " and ", " & "]) {
    result = result.flatMap((p) =>
      p.split(delim).map((x) => x.trim()).filter(Boolean)
    );
  }
  return result.map((x) => x.toLowerCase()).filter(Boolean);
}

/**
 * Normalize extracted field names from routing.
 * The LLM router sometimes returns `projectName` instead of `name`,
 * or `project` instead of `projectId`, or `role` instead of `roles`.
 */
export function normalizeExtractedFields(
  raw: Record<string, string | number | string[]> | undefined
): Record<string, string | number | string[]> | undefined {
  if (!raw || Object.keys(raw).length === 0) return undefined;

  const normalized = { ...raw } as Record<string, unknown>;

  if (normalized.projectName != null && normalized.name == null) {
    normalized.name = normalized.projectName;
  }

  if (normalized.clientName != null && normalized.client == null) {
    normalized.client = normalized.clientName;
  }

  if (normalized.contactName != null && normalized.contactId == null) {
    normalized.contactId = normalized.contactName;
  }

  if (normalized.projectName != null && normalized.projectId == null) {
    normalized.projectId = normalized.projectName;
  }

  if (normalized.role != null && normalized.roles == null) {
    const r = normalized.role;
    normalized.roles = Array.isArray(r)
      ? r
      : typeof r === "string"
        ? splitRoleString(String(r))
        : [String(r)];
  }

  return normalized as Record<string, string | number | string[]>;
}

/**
 * Check whether routing extracted enough fields for an express path
 * to reviewing (confirmation card) for a create workflow.
 *
 * Returns true when ALL required field names are present in extracted.
 */
export function canExpressToReview(
  extracted: Record<string, string | number | string[]>,
  requiredFields: WorkflowFieldDefinition[]
): boolean {
  return requiredFields.every((f) => {
    const v = extracted[f.name];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return String(v).trim() !== "";
  });
}

/**
 * Derive possible extraction keys for an entity field.
 * e.g. contactId → contactId, contactName, contact
 * Uses string methods only — works for any field ending in "Id".
 */
export function getEntityRefKeys(entityIdFieldName: string): {
  primary: string;
  nameSuffix: string;
  shortName: string;
} {
  const primary = entityIdFieldName;
  const shortName = entityIdFieldName.endsWith("Id")
    ? entityIdFieldName.slice(0, -2)
    : entityIdFieldName;
  const nameSuffix = shortName + "Name";
  return { primary, nameSuffix, shortName };
}

/**
 * Get entity reference from extracted fields using dynamic key derivation.
 */
export function getEntityRefFromExtracted(
  extracted: Record<string, string | number | string[]>,
  entityIdFieldName: string
): string | number | string[] | undefined {
  const { primary, nameSuffix, shortName } = getEntityRefKeys(entityIdFieldName);
  return extracted[primary] ?? extracted[nameSuffix] ?? extracted[shortName];
}

/**
 * For update workflows: determine what kind of express path to use.
 *
 * Returns:
 *   - "express_confirm" — entity resolved + change fields present → show confirmation
 *   - "express_collect" — entity resolved, no changes → show "which fields?" selector
 *   - "normal"          — no entity provided → normal collection flow
 */
export function classifyUpdateExpressPath(
  extracted: Record<string, string | number | string[]>,
  entityIdFieldName: string,
  changeFieldNames: string[]
): "express_confirm" | "express_collect" | "normal" {
  const entityRef = getEntityRefFromExtracted(extracted, entityIdFieldName);

  if (!entityRef || String(entityRef).trim() === "") return "normal";

  const hasChanges = changeFieldNames.some(
    (name) => extracted[name] != null && String(extracted[name]).trim() !== ""
  );

  return hasChanges ? "express_confirm" : "express_collect";
}
