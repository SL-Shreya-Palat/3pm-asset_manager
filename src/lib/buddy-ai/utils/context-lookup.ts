/**
 * Buddy AI — Context Lookup ("Same as Last Project")
 *
 * Fetches the last created project for the tenant to copy field values.
 * Supports field-specific and group-aware copying:
 *   - "same client" → copies just client
 *   - "same dates" → copies startDate + endDate (group)
 *   - "same as last project" → copies all copyable fields
 *
 * @see BUDDY_AI_V3_STRENGTHENING_PLAN.md Phase 2.5
 * @see BUDDY_AI_V3_UPGRADE_PLAN.md Phase 5
 */

import { ObjectId } from "mongodb";
import { getProjectsCollection } from "@/lib/mongodb";
import { Permissions } from "@/consts/getPermissions";
import { PERMISSION_LEVELS } from "@/constants";
import { stringToObjectId } from "@/lib/validation/objectIdServer";
import type { BuddyAIContext } from "./rbac";
import type { WorkflowFieldDefinition } from "../workflows/types";
import { isFieldEmpty } from "../field-engine/collector";
import { resolveValueToDisplay } from "./resolve-id-to-label";

export type LastProjectForContextLookup = {
  client?: string;
  startDate?: string;
  endDate?: string;
  projectManager?: string;
  site?: string;
  budget?: number;
};

function formatDate(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return undefined;
  return date.toISOString().split("T")[0];
}

/**
 * Fetch the last created project for the tenant (by createdAt desc).
 * Returns field values that can be copied into collectedData for create_project.
 */
export async function getLastProjectForContextLookup(
  context: BuddyAIContext
): Promise<LastProjectForContextLookup | null> {
  const { tenantId, permissionChecker, userId } = context;

  const viewLevel = permissionChecker.getPermissionLevel(
    Permissions.projects.project.form.view
  ) as "ALL" | "OWN" | "NONE";

  if (viewLevel === PERMISSION_LEVELS.VIEW_NONE) {
    return null;
  }

  const collection = await getProjectsCollection();
  const tenantObjectId = ObjectId.createFromHexString(tenantId);

  const matchStage: Record<string, unknown> = {
    tenantId: tenantObjectId,
  };

  if (viewLevel === PERMISSION_LEVELS.VIEW_OWN && userId) {
    matchStage.createdBy = stringToObjectId(userId);
  }

  const pipeline = [
    { $match: matchStage },
    { $sort: { createdAt: -1 } },
    { $limit: 1 },
    {
      $lookup: {
        from: "businessContacts",
        localField: "projectInformation.businessContactId",
        foreignField: "_id",
        as: "businessContactDetails",
      },
    },
    { $unwind: { path: "$businessContactDetails", preserveNullAndEmptyArrays: true } },
  ];

  const result = await collection.aggregate(pipeline).toArray();

  if (!result || result.length === 0) {
    return null;
  }

  const project = result[0] as Record<string, unknown>;
  const projectInfo = (project.projectInformation as Record<string, unknown>) || {};
  const projectSetup = (project.projectSetup as Record<string, unknown>) || {};
  const businessContactId = projectInfo.businessContactId;
  const siteId = projectInfo.siteId;
  const projectManager = projectSetup.projectManager;

  const toId = (v: unknown): string | undefined => {
    if (v instanceof ObjectId) return v.toString();
    if (typeof v === "string" && v.trim()) return v.trim();
    return undefined;
  };

  return {
    client: toId(businessContactId),
    startDate: formatDate(projectInfo.startDate as Date | string),
    endDate: formatDate(projectInfo.endDate as Date | string),
    projectManager: toId(projectManager),
    site: toId(siteId),
    budget: typeof project.budget === "number" ? project.budget : undefined,
  };
}

// ---------------------------------------------------------------------------
// Enhanced context lookup — field-specific + group-aware
// ---------------------------------------------------------------------------

export type ContextLookupResult =
  | { success: true; appliedFields: Record<string, unknown>; message: string }
  | { success: false; error: string };

const FIELD_KEYWORDS: Record<string, string[]> = {
  client: ["client", "contact", "customer"],
  startDate: ["start date"],
  endDate: ["end date", "deadline", "finish date"],
  projectManager: ["project manager", "manager"],
  site: ["site", "location"],
  budget: ["budget", "cost", "price"],
};

const GROUP_MAP: Record<string, string[]> = {
  dates: ["startDate", "endDate"],
};

const GROUP_KEYWORDS: Record<string, string[]> = {
  dates: ["dates", "schedule", "timeline"],
};

/**
 * Determine which fields to copy based on user's message.
 * - Group keywords (e.g., "same dates") → group fields
 * - Field keywords (e.g., "same client") → that field + group mates
 * - Generic (e.g., "same as last project") → all copyable fields
 */
function detectTargetFields(
  userMessage: string,
  allFields: WorkflowFieldDefinition[]
): string[] {
  const msg = userMessage.toLowerCase();
  const schemaNames = new Set(allFields.map((f) => f.name));

  for (const [group, keywords] of Object.entries(GROUP_KEYWORDS)) {
    if (keywords.some((kw) => msg.includes(kw))) {
      return (GROUP_MAP[group] ?? []).filter((f) => schemaNames.has(f));
    }
  }

  for (const [fieldName, keywords] of Object.entries(FIELD_KEYWORDS)) {
    if (!schemaNames.has(fieldName)) continue;
    if (keywords.some((kw) => msg.includes(kw))) {
      const def = allFields.find((f) => f.name === fieldName);
      if (def?.group && GROUP_MAP[def.group]) {
        return GROUP_MAP[def.group].filter((f) => schemaNames.has(f));
      }
      return [fieldName];
    }
  }

  return Object.keys(FIELD_KEYWORDS).filter((f) => schemaNames.has(f));
}

/**
 * Resolve a context lookup request into concrete field values.
 *
 * Determines which fields to copy based on the user message, applies values
 * from the last project, and returns a human-readable confirmation with
 * resolved labels (e.g., "Acme Corp" instead of an ObjectId).
 */
export async function resolveContextLookup(params: {
  currentFieldName: string;
  userMessage: string;
  lastProject: LastProjectForContextLookup;
  allFields: WorkflowFieldDefinition[];
  collectedData: Record<string, unknown>;
  context: BuddyAIContext;
}): Promise<ContextLookupResult> {
  const { userMessage, lastProject, allFields, collectedData, context } = params;

  const targetFields = detectTargetFields(userMessage, allFields);
  const appliedFields: Record<string, unknown> = {};
  const labels: string[] = [];

  for (const fn of targetFields) {
    const val = lastProject[fn as keyof LastProjectForContextLookup];
    if (val != null && isFieldEmpty(collectedData[fn])) {
      appliedFields[fn] = val;
      const fieldDef = allFields.find((f) => f.name === fn);
      if (fieldDef) {
        const displayVal = fieldDef.optionsFrom
          ? await resolveValueToDisplay(
              context,
              fieldDef,
              val,
              { ...collectedData, ...appliedFields }
            )
          : String(val);
        labels.push(`**${fieldDef.label}**: ${displayVal}`);
      }
    }
  }

  if (Object.keys(appliedFields).length === 0) {
    if (targetFields.length > 0) {
      return {
        success: false,
        error: "Those fields are already filled or not available from your last project.",
      };
    }
    return {
      success: false,
      error: "No previous project data available for those fields.",
    };
  }

  const message =
    labels.length === 1
      ? `Copied from your last project — ${labels[0]}`
      : `Copied from your last project:\n${labels.map((l) => `• ${l}`).join("\n")}`;

  return { success: true, appliedFields, message };
}
