/**
 * Buddy AI — Workflow Start Handler
 *
 * Handles new workflow intent (no workflowState or at choice_gate).
 * Delegates to create or update orchestrator with express path awareness.
 *
 * Smart routing (Phase 3):
 *   - Normalizes extracted field names before passing to orchestrators
 *   - Logs the express path classification for debugging
 *   - Orchestrators handle the actual entity resolution + step skipping
 *
 * @see BUDDY_AI_V3_UPGRADE_PLAN.md Phase 3
 */

import type { AgentContext, Handler, HandlerResult } from "./types";
import type { RoutingResult } from "../utils/llm-routing";
import { getWorkflowByIntent } from "../workflows/registry";
import { WORKFLOW_CONFIGS, UPDATE_WORKFLOW_CONFIGS } from "../workflows/configs";
import { orchestrateGenericCreate } from "../workflows/orchestrate-generic-create";
import { orchestrateGenericUpdate } from "../workflows/orchestrate-generic-update";
import { extractFieldsFromMessage } from "../utils/llm-routing";
import {
  normalizeExtractedFields,
  canExpressToReview,
  classifyUpdateExpressPath,
} from "../field-engine";

export const WorkflowStartHandler: Handler = {
  name: "WorkflowStartHandler",

  canHandle(ctx: AgentContext): boolean {
    if (ctx.routingResult?.mode !== "workflow" || !ctx.routingResult?.intent) return false;
    if ((ctx.routingResult.confidence ?? 1) < 0.4) return false;
    const def = getWorkflowByIntent(ctx.routingResult.intent);
    if (!def) return false;
    const hasWorkflow = !!ctx.workflowState?.workflow;
    const atChoiceGate = ctx.workflowState?.currentStep === "choice_gate";
    return !hasWorkflow || atChoiceGate;
  },

  async handle(ctx: AgentContext): Promise<HandlerResult> {
    const intent = ctx.routingResult!.intent!;
    const updateConfig = UPDATE_WORKFLOW_CONFIGS[intent];
    const createConfig = WORKFLOW_CONFIGS[intent];
    const config = updateConfig ?? createConfig;

    const rawExtracted = ctx.routingResult?.extractedFields;
    let normalized = normalizeExtractedFields(rawExtracted);

    if (!normalized && config) {
      const allFields = [
        ...config.definition.requiredFields,
        ...config.definition.optionalFields,
      ];
      const entityFieldHint = updateConfig
        ? updateConfig.definition.requiredFields[0]?.name
        : undefined;
      const fallbackExtracted = await extractFieldsFromMessage(
        ctx.context,
        ctx.lastUserMessage,
        allFields.map((f) => ({ name: f.name, label: f.label, type: f.type })),
        ctx.abortSignal,
        entityFieldHint ? { entityFieldHint } : undefined
      );
      if (fallbackExtracted) {
        normalized = normalizeExtractedFields(fallbackExtracted);
      }
    }

    let routingWithNormalized = normalized
      ? { ...ctx.routingResult!, extractedFields: normalized }
      : ctx.routingResult;

    if (updateConfig) {
      const entityFieldName =
        updateConfig.definition.requiredFields[0]?.name ?? "projectId";
      const expressType = normalized
        ? classifyUpdateExpressPath(
            normalized,
            entityFieldName,
            updateConfig.definition.optionalFields.map((f) => f.name)
          )
        : "normal";
      console.log(
        `[Buddy AI WorkflowStart] ${intent} | express=${expressType} | fields=${
          normalized ? Object.keys(normalized).join(",") : "none"
        }`
      );

      const response = await orchestrateGenericUpdate(updateConfig, {
        context: ctx.context,
        message: ctx.lastUserMessage,
        structuredInput: ctx.structuredInput,
        workflowState: ctx.workflowState,
        threadId: ctx.threadId,
        routingResult: routingWithNormalized as RoutingResult | null,
        abortSignal: ctx.abortSignal,
      });
      return { handled: true, response };
    }

    if (createConfig) {
      const canExpress = normalized
        ? canExpressToReview(normalized, createConfig.definition.requiredFields)
        : false;
      console.log(
        `[Buddy AI WorkflowStart] ${intent} | canExpress=${canExpress} | fields=${
          normalized ? Object.keys(normalized).join(",") : "none"
        }`
      );

      const response = await orchestrateGenericCreate(createConfig, {
        context: ctx.context,
        message: ctx.lastUserMessage,
        structuredInput: ctx.structuredInput,
        workflowState: ctx.workflowState,
        threadId: ctx.threadId,
        routingResult: routingWithNormalized as RoutingResult | null,
        abortSignal: ctx.abortSignal,
      });
      return { handled: true, response };
    }

    return { handled: false };
  },
};
