/**
 * Buddy AI — UI Response Handler
 *
 * Handles structured input (chip/dropdown clicks). Delegates to create or update orchestrator.
 *
 * @see BUDDY_AI_V3_STRENGTHENING_PLAN.md Phase 3.2
 */

import type { AgentContext, Handler, HandlerResult } from "./types";
import { WORKFLOW_CONFIGS, UPDATE_WORKFLOW_CONFIGS } from "../workflows/configs";
import { orchestrateGenericCreate } from "../workflows/orchestrate-generic-create";
import { orchestrateGenericUpdate } from "../workflows/orchestrate-generic-update";

export const UIResponseHandler: Handler = {
  name: "UIResponseHandler",

  canHandle(ctx: AgentContext): boolean {
    return ctx.structuredInput != null && ctx.structuredInput.field?.trim() !== "";
  },

  async handle(ctx: AgentContext): Promise<HandlerResult> {
    const workflowKey =
      ctx.workflowState?.workflow ?? (ctx.routingResult?.mode === "workflow" ? ctx.routingResult?.intent ?? null : null);
    const updateConfig = workflowKey ? UPDATE_WORKFLOW_CONFIGS[workflowKey] : null;
    const createConfig = workflowKey ? WORKFLOW_CONFIGS[workflowKey] : null;

    if (updateConfig) {
      const response = await orchestrateGenericUpdate(updateConfig, {
        context: ctx.context,
        message: ctx.lastUserMessage,
        structuredInput: ctx.structuredInput,
        workflowState: ctx.workflowState,
        threadId: ctx.threadId,
        routingResult: ctx.routingResult,
        abortSignal: ctx.abortSignal,
      });
      return { handled: true, response };
    }

    if (createConfig) {
      const response = await orchestrateGenericCreate(createConfig, {
        context: ctx.context,
        message: ctx.lastUserMessage,
        structuredInput: ctx.structuredInput,
        workflowState: ctx.workflowState,
        threadId: ctx.threadId,
        routingResult: ctx.routingResult,
        abortSignal: ctx.abortSignal,
      });
      return { handled: true, response };
    }

    return { handled: false };
  },
};
