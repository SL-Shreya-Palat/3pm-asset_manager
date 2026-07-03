/**
 * Buddy AI — Workflow configs registry
 *
 * Central registry of workflow configs. Add new workflows here — routing
 * and orchestration will automatically pick them up.
 *
 * @see BUDDY_AI_GENERIC_WORKFLOW_PLAN.md
 */

import type { CreateWorkflowConfig, UpdateWorkflowConfig } from "../generic-types";
import { CREATE_PROJECT_CONFIG } from "./create-project-config";
import { UPDATE_PROJECT_CONFIG } from "./update-project-config";
import { CREATE_BUSINESS_CONTACT_CONFIG } from "./create-business-contact-config";
import { UPDATE_BUSINESS_CONTACT_CONFIG } from "./update-business-contact-config";

/** Registry: intent key -> create config. */
export const WORKFLOW_CONFIGS: Record<string, CreateWorkflowConfig> = {
  create_project: CREATE_PROJECT_CONFIG,
  create_business_contact: CREATE_BUSINESS_CONTACT_CONFIG,
};

/** Registry: intent key -> update config. */
export const UPDATE_WORKFLOW_CONFIGS: Record<string, UpdateWorkflowConfig> = {
  update_project: UPDATE_PROJECT_CONFIG,
  update_business_contact: UPDATE_BUSINESS_CONTACT_CONFIG,
};

/** Intent keys available for routing (create + update) */
export function getAvailableIntents(): string[] {
  return [
    ...Object.keys(WORKFLOW_CONFIGS),
    ...Object.keys(UPDATE_WORKFLOW_CONFIGS),
  ];
}
