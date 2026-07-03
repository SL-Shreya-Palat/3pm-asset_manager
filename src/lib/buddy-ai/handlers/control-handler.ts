/**
 * Buddy AI — Control Handler
 *
 * Handles cancel, stop, reset. First in the pipeline.
 * Uses the state machine's resetToIdle() for validated transitions.
 *
 * @see BUDDY_AI_V3_UPGRADE_PLAN.md Phase 1
 */

import type { AgentContext, Handler, HandlerResult } from "./types";
import { resetToIdle } from "../state-machine";

const CANCEL_PATTERNS = /^(cancel|stop|abort|nevermind|never mind|quit|exit|start\s*over)\s*[.!]?\s*$/i;

export const ControlHandler: Handler = {
  name: "ControlHandler",

  canHandle(ctx: AgentContext): boolean {
    if (ctx.routingResult?.userIntent === "cancel") return true;
    if (ctx.structuredInput?.field === "_cancel") return true;
    const msg = ctx.lastUserMessage.trim();
    return CANCEL_PATTERNS.test(msg);
  },

  async handle(ctx: AgentContext): Promise<HandlerResult> {
    const workflowKey = ctx.workflowState?.workflow ?? "create_project";
    const hadActiveTask = !!ctx.workflowState?.workflow && ctx.workflowState.currentStep !== "done";

    const reason = hadActiveTask ? "user_cancelled" : "cancelled";
    const result = resetToIdle(workflowKey, reason);

    return {
      handled: true,
      response: {
        message: result.message,
        uiSchema: null,
        collectedData: result.collectedData,
        workflow: workflowKey,
        nextStep: result.nextStep,
        state: result.state,
      },
    };
  },
};
