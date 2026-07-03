/**
 * Buddy AI — Consultant Handler
 *
 * Fallback for Q&A, data questions, app help. Runs streamText with tools.
 *
 * @see BUDDY_AI_V3_STRENGTHENING_PLAN.md Phase 3.2
 */

import { streamText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "@/lib/env";
import type { AgentContext, Handler, HandlerResult } from "./types";
import { buildSystemPrompt } from "../config/system-prompt";
import { buildTools } from "../orchestrate-tools";

const google = createGoogleGenerativeAI({
  apiKey: env.google.genAiApiKey,
});

const MODEL_ID = "gemini-2.5-flash";

export const ConsultantHandler: Handler = {
  name: "ConsultantHandler",

  canHandle(): boolean {
    return true;
  },

  async handle(ctx: AgentContext): Promise<HandlerResult> {
    const isSuspended = !!ctx.workflowState?.workflow;

    let systemPrompt = buildSystemPrompt(ctx.context);
    if (isSuspended) {
      const filledFields = Object.entries(ctx.workflowState!.collectedData)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k]) => k);
      systemPrompt += `\n\n## Active Workflow (Suspended)\nThe user was in a **${ctx.workflowState!.workflow.replace(/_/g, " ")}** workflow (step: ${ctx.workflowState!.currentStep}) but asked a side question. They have already filled: ${filledFields.length > 0 ? filledFields.join(", ") : "nothing yet"}.\nAnswer their question normally, then end your response with:\n"When you're ready, you can continue creating your project — just click **Resume Workflow** below."`;
    }

    const tools = buildTools(ctx.context);

    const result = await streamText({
      model: google(MODEL_ID),
      system: systemPrompt,
      messages: ctx.messages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: stepCountIs(15),
      abortSignal: ctx.abortSignal,
      onFinish: ctx.onFinish
        ? (res) => {
            const text = typeof res.text === "string" ? res.text : "";
            void Promise.resolve(ctx.onFinish!({ text })).catch((err) =>
              console.error("Buddy AI onFinish error:", err)
            );
          }
        : undefined,
    });

    return {
      handled: true,
      stream: result,
      suspendedWorkflow: isSuspended || undefined,
    };
  },
};
