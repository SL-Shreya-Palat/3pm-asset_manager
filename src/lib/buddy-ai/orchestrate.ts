/**
 * Buddy AI — Orchestration
 *
 * First-match handler pipeline: Control → UI → Workflow → WorkflowStart → Consultant.
 * Routing runs first (when no structuredInput); handlers process in order.
 *
 * @see BUDDY_AI_V3_STRENGTHENING_PLAN.md Phase 3
 */

import { streamText } from "ai";
import type { BuddyAIContext } from "./utils/rbac";
import type { StructuredInput, StructuredResponse } from "./types";
import type { WorkflowState } from "./db/threads";
import { routeWithLLM } from "./utils/llm-routing";
import { HANDLER_PIPELINE, ConsultantHandler } from "./handlers";
import type { AgentContext, ChatMessage, ConsultantDelegateResponse } from "./handlers";
import { getAvailableIntents } from "./workflows/configs";

export type { ChatMessage };

export type OrchestrateOptions = {
  messages: ChatMessage[];
  context: BuddyAIContext;
  abortSignal?: AbortSignal;
  onFinish?: (result: { text: string }) => void | Promise<void>;
  /** For workflow mode: structured input from chip/dropdown selection */
  structuredInput?: StructuredInput | null;
  /** For workflow mode: persisted workflow state */
  workflowState?: WorkflowState | null;
  /** Thread ID (for workflow state persistence) */
  threadId?: string;
};

export type OrchestrateResult =
  | { type: "stream"; result: Awaited<ReturnType<typeof streamText>>; suspendedWorkflow?: boolean }
  | { type: "workflow"; response: StructuredResponse };

/**
 * Run the Buddy AI agent via handler pipeline.
 * Routing runs first when no structuredInput; first handler that canHandle wins.
 */
export async function orchestrate({
  messages,
  context,
  abortSignal,
  onFinish,
  structuredInput,
  workflowState,
  threadId = "",
}: OrchestrateOptions): Promise<OrchestrateResult> {
  const lastUserMessage = messages.filter((m) => m.role === "user").pop()?.content ?? "";
  console.log("lastUserMessage :: orchestrate::I >< ", lastUserMessage);
  let routingResult = null as Awaited<ReturnType<typeof routeWithLLM>> | null;

  if (lastUserMessage.trim() && !structuredInput) {
    routingResult = await routeWithLLM(
      context,
      lastUserMessage,
      workflowState?.workflow
        ? {
            currentStep: workflowState.currentStep,
            workflow: workflowState.workflow,
            collectedData: workflowState.collectedData,
          }
        : null,
      abortSignal
    );

    if (
      routingResult &&
      routingResult.mode === "consultant" &&
      !workflowState?.workflow
    ) {
      const override = detectWorkflowIntent(lastUserMessage);
      if (override) {
        console.log(
          `[Buddy AI Routing Override] LLM said consultant, keyword match says ${override.intent} — overriding`
        );
        routingResult = {
          ...routingResult,
          mode: "workflow",
          intent: override.intent,
          confidence: Math.max(routingResult.confidence ?? 0, 0.85),
        };
      }
    }
  }

  const ctx: AgentContext = {
    messages,
    context,
    structuredInput: structuredInput ?? null,
    workflowState: workflowState ?? null,
    routingResult,
    threadId,
    abortSignal,
    lastUserMessage,
    onFinish,
  };

  for (const handler of HANDLER_PIPELINE) {
    if (!handler.canHandle(ctx)) continue;
    const result = await handler.handle(ctx);
    if (!result.handled) continue;

    if ("response" in result) {
      const response = result.response;
      if (
        response &&
        typeof response === "object" &&
        "type" in response &&
        response.type === "consultant_delegate"
      ) {
        const delegate = response as ConsultantDelegateResponse;
        const consultantCtx: AgentContext = {
          ...ctx,
          workflowState: delegate.workflowState,
        };
        const consultantResult = await ConsultantHandler.handle(consultantCtx);
        if ("stream" in consultantResult && consultantResult.handled) {
          return {
            type: "stream",
            result: consultantResult.stream,
            suspendedWorkflow: true,
          };
        }
      }
      return {
        type: "workflow",
        response: response as StructuredResponse,
      };
    }
    return {
      type: "stream",
      result: result.stream,
      suspendedWorkflow: result.suspendedWorkflow,
    };
  }

  throw new Error("Buddy AI: No handler matched (ConsultantHandler should always match)");
}

const WORKFLOW_KEYWORD_PATTERNS: { pattern: RegExp; intent: string }[] = [
  { pattern: /\b(?:create|make|add|new|start)\s+(?:a\s+)?project\b/i, intent: "create_project" },
  { pattern: /\b(?:update|edit|change|modify)\s+(?:a\s+)?(?:the\s+)?project\b/i, intent: "update_project" },
  { pattern: /\b(?:create|make|add|new)\s+(?:a\s+)?(?:business\s+)?contact\b/i, intent: "create_business_contact" },
  { pattern: /\b(?:create|add)\s+(?:a\s+)?(?:client|supplier|subcontractor)\b/i, intent: "create_business_contact" },
  { pattern: /\b(?:update|edit|change|modify)\s+(?:a\s+)?(?:business\s+)?contact\b/i, intent: "update_business_contact" },
];

function detectWorkflowIntent(
  message: string
): { intent: string } | null {
  const available = new Set(getAvailableIntents());
  for (const { pattern, intent } of WORKFLOW_KEYWORD_PATTERNS) {
    if (pattern.test(message) && available.has(intent)) {
      return { intent };
    }
  }
  return null;
}
