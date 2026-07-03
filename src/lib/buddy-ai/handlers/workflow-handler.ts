/**
 * Buddy AI — Workflow Handler
 *
 * Handles mid-workflow (user is in COLLECTING or REVIEWING). Delegates to create or update orchestrator.
 *
 * @see BUDDY_AI_V3_STRENGTHENING_PLAN.md Phase 3.2
 */

import type { AgentContext, Handler, HandlerResult } from "./types";
import { WORKFLOW_CONFIGS, UPDATE_WORKFLOW_CONFIGS } from "../workflows/configs";
import { orchestrateGenericCreate } from "../workflows/orchestrate-generic-create";
import { orchestrateGenericUpdate } from "../workflows/orchestrate-generic-update";

export const WorkflowHandler: Handler = {
  name: "WorkflowHandler",

  canHandle(ctx: AgentContext): boolean {
    if (!ctx.workflowState?.workflow) return false;
    const step = ctx.workflowState.currentStep;
    return step !== "choice_gate" && step !== "done";
  },

  async handle(ctx: AgentContext): Promise<HandlerResult> {
    const workflowKey = ctx.workflowState!.workflow;
    const createConfig = WORKFLOW_CONFIGS[workflowKey];
    const updateConfig = UPDATE_WORKFLOW_CONFIGS[workflowKey];

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
