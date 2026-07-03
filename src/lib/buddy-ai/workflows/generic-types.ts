/**
 * Buddy AI — Generic workflow config types
 *
 * Single config shape for all creation workflows.
 * Add new entities by defining a CreateWorkflowConfig — no new orchestrator needed.
 *
 * @see BUDDY_AI_GENERIC_WORKFLOW_PLAN.md
 */

import type { BuddyAIContext } from "../utils/rbac";
import type { WorkflowDefinition } from "./types";
import type { DropdownOption } from "../types";

/** Result from create tool */
export type CreateToolResult = {
  success: boolean;
  id?: string;
  error?: string;
};

/** Entity resolver result: resolved, ambiguous (show chips), or not_found */
export type EntityResolverResult =
  | { id: string; label: string }
  | { status: "ambiguous"; matches: DropdownOption[] }
  | null;

/** Entity resolver: user value (e.g. "Acme") → resolved id, ambiguous matches, or null. collectedData for dependent fields (e.g. site needs client). */
export type EntityResolver = (
  context: BuddyAIContext,
  value: string,
  collectedData: Record<string, unknown>
) => Promise<EntityResolverResult>;

/** Empty options meta: shown when dropdown has no data */
export type EmptyOptionsMeta = {
  entityLabel: string;
  createLink: string;
  createLinkLabel: string;
  message: string;
};

/**
 * Config for a generic creation workflow.
 * Each entity (create_project, create_leave_request, etc.) defines one of these.
 */
export type CreateWorkflowConfig = {
  /** Workflow schema: required/optional fields, choice gate */
  definition: WorkflowDefinition;

  /** Create tool: receives collectedData, returns success + id or error */
  createTool: (
    context: BuddyAIContext,
    data: Record<string, unknown>
  ) => Promise<CreateToolResult>;

  /** Pre-create validation. Returns array of error messages. Empty = valid. */
  validate?: (data: Record<string, unknown>) => string[];

  /** Resolve free-text to IDs for express path. Key = field name (e.g. "client", "projectManager"). */
  entityResolvers?: Record<string, EntityResolver>;

  /** When dropdown has no options. Key = optionsFrom tool name (e.g. "list_business_contacts"). */
  emptyOptionsMeta?: Record<string, EmptyOptionsMeta>;

  /** Success message after create. Can use id for link. */
  successMessage?: (result: { id?: string }) => string;

  /** Confirmation step button labels */
  confirmationLabels?: {
    yesLabel?: string;
    noLabel?: string;
    editLabel?: string;
  };

  /** Intent key for routing (e.g. "create_project") */
  intent: string;
};

/** Result from update tool */
export type UpdateToolResult = {
  success: boolean;
  projectId?: string;
  error?: string;
};

/**
 * Config for a generic update workflow.
 * Entry: select entity, then choose fields to update, collect values, confirm.
 *
 * @see BUDDY_AI_V3_STRENGTHENING_PLAN.md Phase 5.1
 */
export type UpdateWorkflowConfig = {
  /** Workflow schema: required (entity selector) + optional (updatable fields) */
  definition: WorkflowDefinition;

  /** Update tool: receives entityId + changes, returns success or error */
  updateTool: (
    context: BuddyAIContext,
    data: { entityId: string; changes: Record<string, unknown> }
  ) => Promise<UpdateToolResult>;

  /** Fetch entity for display (old values in confirmation). Returns record keyed by field name. */
  fetchEntityForUpdate: (
    context: BuddyAIContext,
    entityId: string
  ) => Promise<Record<string, unknown> | null>;

  /** Entity resolver for entity selector (e.g. resolve "Acme project" to project ID) */
  entityResolver?: EntityResolver;

  /** Resolve free-text to IDs for optional fields (client, projectManager, site). Key = field name. */
  entityResolvers?: Record<string, EntityResolver>;

  /** Empty options meta for entity selector dropdown */
  emptyOptionsMeta?: Record<string, EmptyOptionsMeta>;

  /** Success message after update */
  successMessage?: (result: { id?: string }) => string;

  /** Confirmation step button labels */
  confirmationLabels?: {
    yesLabel?: string;
    noLabel?: string;
    editLabel?: string;
  };

  /** Intent key for routing (e.g. "update_project") */
  intent: string;
};
