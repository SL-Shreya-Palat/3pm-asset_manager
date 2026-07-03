/**
 * Buddy AI — LLM Field Action Analyzer
 *
 * Classifies user free-text at workflow steps into FieldAction types.
 * Enables: value, correction, skip, skip_all, cancel, consultant_query, context_lookup.
 *
 * @see BUDDY_AI_V3_STRENGTHENING_PLAN.md Phase 2.1
 */

import { generateObject } from "ai";
import { z } from "zod";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "@/lib/env";
import type { BuddyAIContext } from "./rbac";
import type { WorkflowFieldDefinition } from "../workflows/types";

const google = createGoogleGenerativeAI({
  apiKey: env.google.genAiApiKey,
});

const MODEL_ID = "gemini-2.5-flash";

const FieldActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("value"),
    value: z.union([z.string(), z.number()]).optional(),
    otherExtracted: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  }),
  z.object({
    type: z.literal("correction"),
    fieldName: z.string(),
    value: z.union([z.string(), z.number()]),
  }),
  z.object({
    type: z.literal("skip"),
  }),
  z.object({
    type: z.literal("skip_all"),
  }),
  z.object({
    type: z.literal("cancel"),
  }),
  z.object({
    type: z.literal("consultant_query"),
  }),
  z.object({
    type: z.literal("context_lookup"),
    source: z.string().optional(),
  }),
]);

export type FieldAction = z.infer<typeof FieldActionSchema>;

export type AnalyzeFieldInputParams = {
  workflow: string;
  currentStep: string;
  field: WorkflowFieldDefinition;
  userMessage: string;
  /** All field names in schema order (for correction fieldName validation) */
  allFieldNames: string[];
  /** Whether we're in optional field collection (skip_all applies) */
  isOptionalPhase: boolean;
};

/**
 * Classify user message at a workflow step into a FieldAction.
 * Use before interpretStepInput when handling free-text.
 */
export async function analyzeFieldInput(
  context: BuddyAIContext,
  params: AnalyzeFieldInputParams,
  abortSignal?: AbortSignal
): Promise<FieldAction> {
  const { workflow, currentStep, field, userMessage, allFieldNames, isOptionalPhase } = params;
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return { type: "value" };
  }

  const tenantContext = context.tenantName
    ? `You are helping **${context.tenantName}**, a construction business. `
    : "You are helping a construction business. ";

  const fieldList = allFieldNames.map((n) => `"${n}"`).join(", ");

  const prompt = `${tenantContext}The user is in a workflow step.

Workflow: ${workflow}
Step: ${currentStep}
Current field: ${field.name} (${field.label})

All fields in this workflow: ${fieldList}

User message: "${userMessage}"

Classify the user's intent into ONE of these types. Use "type" as the output field (not "intent").

- **value**: User is providing a value for the current field (e.g. "Acme Corp", "tomorrow", "50k", "March 1st"). Also use when they provide multiple values in one message — return type "value" and put extra values in otherExtracted as an OBJECT (e.g. otherExtracted: { startDate: "2026-03-01", budget: 50000 }).

- **correction**: User is correcting a PREVIOUS field (e.g. "actually the client is Acme", "change the start date to Monday"). Return fieldName (one of ${fieldList}) and value.

- **skip**: User wants to skip the current optional field (e.g. "skip", "none", "leave it blank").

- **skip_all**: User wants to skip ALL remaining optional fields (e.g. "skip all", "skip the rest", "that's enough", "no more", "skip to review"). Only valid when in optional phase.

- **cancel**: User wants to cancel the workflow (e.g. "cancel", "nevermind", "stop", "abort").

- **consultant_query**: User is asking a side question unrelated to the workflow (e.g. "list my projects", "what's the status of X"). They want an answer, not to fill the field.

- **context_lookup**: User wants to use values from a previous/similar entity (e.g. "same as last project", "copy from the last one").

Default to "value" when the message clearly provides a value for the current field. Only use correction when they explicitly reference changing a previous field.
IMPORTANT: otherExtracted must be an object like { fieldName: "value" }, never an array.`;

  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: FieldActionSchema,
      prompt,
      abortSignal,
    });

    return object;
  } catch (err) {
    console.error("Buddy AI analyzeFieldInput error:", err);
    return { type: "value" };
  }
}
