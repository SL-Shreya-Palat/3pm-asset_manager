/**
 * Buddy AI — Handler pipeline types
 *
 * First-match handler pipeline for routing user messages.
 *
 * @see BUDDY_AI_V3_STRENGTHENING_PLAN.md Phase 3
 */

import type { BuddyAIContext } from "../utils/rbac";
import type { StructuredInput, StructuredResponse } from "../types";
import type { WorkflowState } from "../db/threads";
import type { RoutingResult } from "../utils/llm-routing";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentContext = {
  messages: ChatMessage[];
  context: BuddyAIContext;
  structuredInput: StructuredInput | null;
  workflowState: WorkflowState | null;
  routingResult: RoutingResult | null;
  threadId: string;
  abortSignal?: AbortSignal;
  lastUserMessage: string;
  onFinish?: (result: { text: string }) => void | Promise<void>;
};

/** Stream result from streamText (AI SDK) */
export type StreamResult = Awaited<ReturnType<typeof import("ai").streamText>>;

/** Workflow asks to delegate to consultant (side question); state preserved for resume */
export type ConsultantDelegateResponse = {
  type: "consultant_delegate";
  workflowState: WorkflowState;
};

export type HandlerResult =
  | { handled: true; response: StructuredResponse | ConsultantDelegateResponse }
  | { handled: true; stream: StreamResult; suspendedWorkflow?: boolean }
  | { handled: false };

export type Handler = {
  name: string;
  canHandle: (ctx: AgentContext) => boolean;
  handle: (ctx: AgentContext) => Promise<HandlerResult>;
};
