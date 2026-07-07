/**
 * Buddy AI — Asset Manager AI Agent
 *
 * AI SDK v7 native: streamText agentic loop + RBAC-filtered tool registry
 * (read tools auto-execute, write tools require in-chat approval) +
 * multi-thread persistence. See tools/registry.ts to add capabilities.
 */

export { getModel, getExtractModel, isAiConfigured } from "./provider";
export { buildSystemPrompt } from "./config/system-prompt";
export {
  REGISTRY,
  defineTool,
  buildToolset,
  buildToolApproval,
  canUseTool,
  type BuddyToolDef,
} from "./tools";
export { resolveContext, type ResolveContextUser } from "./utils/context";
export type { BuddyAIContext } from "./utils/rbac";
export { requireBuddyContext } from "./utils/require-context";
