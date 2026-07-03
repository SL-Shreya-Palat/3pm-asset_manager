/**
 * Buddy AI — Construction Portal AI Agent
 *
 * Phase 1: Consultant (read-only). Projects + resources only.
 * Phase 2: Workflow mode (create/update) with schema-driven UI.
 */

export type {
  DropdownOption,
  UISchema,
  StructuredResponse,
  StructuredInput,
} from "./types";

export { routeWithLLM, type RoutingResult, type WorkflowContext } from "./utils/llm-routing";

export { CREATE_PROJECT_SCHEMA } from "./workflows";
export type { WorkflowSchema, WorkflowFieldDefinition } from "./workflows";

export {
  TOOL_PERMISSION_MAP,
  buildAllowedTools,
  canAccessTool,
  type BuddyAIContext,
} from "./utils/rbac";

export { resolveContext, type ResolveContextUser } from "./utils/context";

export {
  getOptionsForField,
  buildResolvedSummary,
  resolveValueToDisplay,
} from "./utils/resolve-id-to-label";

export { computeWorkflowProgress } from "./utils/compute-workflow-progress";

export { getFeatureGuide, type GetFeatureGuideResult } from "./tools/get-feature-guide";

export { buildSystemPrompt } from "./config/system-prompt";

export {
  orchestrate,
  type OrchestrateOptions,
  type OrchestrateResult,
  type ChatMessage,
} from "./orchestrate";
