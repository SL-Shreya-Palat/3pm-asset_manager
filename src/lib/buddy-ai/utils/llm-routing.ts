/**
 * Buddy AI — LLM-driven routing
 *
 * Replaces regex/keyword classifier with a single LLM call.
 * Returns mode, intent, extractedFields, and userIntent.
 * Schema is workflow-aware: intents derived from WORKFLOW_CONFIGS.
 *
 * @see BUDDY_AI_LLM_ROUTING_PLAN.md
 */

import { generateObject } from "ai";
import { z } from "zod";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "@/lib/env";
import type { BuddyAIContext } from "./rbac";
import { getAvailableIntents } from "../workflows/configs";

const google = createGoogleGenerativeAI({
  apiKey: env.google.genAiApiKey,
});

const MODEL_ID = "gemini-2.5-flash";

/** Flexible extracted fields — any workflow can extract any fields; orchestrator filters by schema */
const ExtractedFieldsSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.array(z.string())]))
  .optional();

/** Build intent enum from registered workflows */
function buildRoutingSchema() {
  const intents = getAvailableIntents();
  const intentEnum =
    intents.length > 0 ? z.enum(intents as [string, ...string[]]).optional() : z.string().optional();

  return z.object({
    mode: z.enum(["workflow", "consultant"]),
    intent: intentEnum,
    extractedFields: ExtractedFieldsSchema,
    userIntent: z
      .enum(["chat", "form", "yes", "no", "edit", "skip", "confirm", "cancel", "none"])
      .optional(),
    /** Confidence 0–1 for classification. Low when message is ambiguous. */
    confidence: z.number().min(0).max(1).optional(),
  });
}

const RoutingSchema = buildRoutingSchema();

export type RoutingResult = z.infer<typeof RoutingSchema>;

export type WorkflowContext = {
  currentStep?: string;
  workflow?: string;
  collectedData?: Record<string, unknown>;
};

function getTodayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
}

function getRoutingSystemPrompt(): string {
  const intents = getAvailableIntents();
  const intentList = intents.length > 0 ? intents.map((i) => `"${i}"`).join(", ") : "none";

  return `You are a routing assistant for a construction portal. Given a user message and optional context, output structured JSON.

Context:
- currentStep: {currentStep}  (e.g. "choice_gate", "collect_client", "confirmation", or "none" if no workflow)
- workflow: {workflow}        (e.g. "create_project" or "none")
- collectedData: {collectedData}
- today: {today}              (ISO date YYYY-MM-DD in NZ timezone — use to resolve "tomorrow", "next week", "in 10 months", etc.)

User message: "{message}"

Output:
- mode: "workflow" if user wants to create or update something (e.g. create project, update project, update a project's name); "consultant" for questions, lists, or general help. IMPORTANT: If user is mid-workflow (context has workflow) and asks a different question (e.g. "show me my invoices", "list projects", "what's the status?"), return mode "consultant" to interrupt and answer their question.
- intent: workflow type if mode=workflow — one of ${intentList}. Omit if mode=consultant.
- extractedFields: any entity fields you can infer from the message (e.g. for create_project: name, client, startDate, endDate, description, projectManager, site, budget; for update_project: use "projectName" or "projectId" for the project they refer to by name e.g. "Acme project" or "Riverside", plus field names for changes: name, client, startDate, endDate, description, projectManager, site, budget; for create_business_contact: name, roles (array: client/supplier/subcontractor), email, phone, accountNumber; for update_business_contact: use "contactId" or "contactName" for the contact they refer to by name, plus field names for changes: name, roles, email, phone, accountNumber). Use ISO dates (YYYY-MM-DD). For relative dates ("tomorrow", "next week", "in 10 months"), compute from today. Omit if nothing extractable.
  IMPORTANT: extractedFields and userIntent are INDEPENDENT. ALWAYS extract fields from the message when field values are present, regardless of userIntent. For example, "I want to create project called fish land, start tomorrow, end in 10 months, create in chat" should return extractedFields: { name: "fish land", startDate: "...", endDate: "..." } AND userIntent: "none".
- userIntent: ONLY set this when the user is explicitly replying to a previously shown choice or question in an active workflow (currentStep is NOT "none"). Values: "chat" (proceed in chat), "form" (go to form), "yes", "no", "edit", "skip", "confirm", "cancel" (abort workflow). When currentStep is "none" or the user is making a NEW request (not replying to a choice), ALWAYS return "none". Do NOT set userIntent based on casual words like "chat" or "form" in the message — only when the user is clearly answering a question the system asked.
- confidence: number 0–1. How confident you are in mode and intent. Use low values (e.g. 0.3–0.5) when the message is ambiguous, could be either workflow or consultant, or intent is unclear. Use high values (e.g. 0.8–1) when the user clearly wants to create something or clearly asks a question.`;
}

function buildPrompt(
  message: string,
  workflowContext?: WorkflowContext | null
): string {
  const currentStep = workflowContext?.currentStep ?? "none";
  const workflow = workflowContext?.workflow ?? "none";
  const collectedData = workflowContext?.collectedData
    ? JSON.stringify(workflowContext.collectedData)
    : "{}";

  const today = getTodayISO();
  return getRoutingSystemPrompt()
    .replace("{currentStep}", currentStep)
    .replace("{workflow}", workflow)
    .replace("{collectedData}", collectedData)
    .replace("{today}", today)
    .replace("{message}", message);
}

/**
 * Route user message via LLM. Returns mode, intent, extractedFields, userIntent.
 * On error, falls back to consultant mode.
 */
export async function routeWithLLM(
  context: BuddyAIContext,
  message: string,
  workflowContext?: WorkflowContext | null,
  abortSignal?: AbortSignal
): Promise<RoutingResult> {
  const trimmed = message.trim();
  const fallback: RoutingResult = {
    mode: "consultant",
    userIntent: "none",
    extractedFields: undefined,
  };
  if (!trimmed) {
    return fallback;
  }

  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: RoutingSchema,
      prompt: buildPrompt(trimmed, workflowContext),
      abortSignal,
    });

    console.log("[Buddy AI Routing]", JSON.stringify({
      message: trimmed.slice(0, 80),
      context: workflowContext?.currentStep ?? "none",
      result: {
        mode: object.mode,
        intent: object.intent,
        userIntent: object.userIntent,
        confidence: object.confidence,
        extractedFields: object.extractedFields,
      },
    }));

    return object;
  } catch (err) {
    console.error("Buddy AI routeWithLLM error:", err);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Fallback field extraction — targeted extraction when routing misses fields
// ---------------------------------------------------------------------------

export type FieldSpec = { name: string; label: string; type: string };

const FallbackExtractedSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()])
);

export type ExtractFieldsOptions = {
  /** For update workflows: entity field name (e.g. contactId, projectId). When set, instructs the LLM to extract "which entity" from phrases like "update contact X". */
  entityFieldHint?: string;
};

/**
 * Targeted field extraction from a user message.
 *
 * Used as a fallback when `routeWithLLM` correctly identifies the workflow
 * intent but returns empty `extractedFields`. Makes a focused LLM call with
 * the exact field names from the workflow schema.
 */
export async function extractFieldsFromMessage(
  context: BuddyAIContext,
  message: string,
  fields: FieldSpec[],
  abortSignal?: AbortSignal,
  options?: ExtractFieldsOptions
): Promise<Record<string, string | number> | undefined> {
  const trimmed = message.trim();
  if (!trimmed || fields.length === 0) return undefined;

  const today = getTodayISO();
  const tenantCtx = context.tenantName
    ? `You are helping **${context.tenantName}**, a construction business. `
    : "You are helping a construction business. ";

  const fieldList = fields
    .map((f) => `- "${f.name}" (${f.label}, type: ${f.type})`)
    .join("\n");

  const entityHint =
    options?.entityFieldHint
      ? `
- **UPDATE workflow**: When the user refers to an entity by name (e.g. "update contact John", "update my contact name chirag fabiyani"), extract that name under ${options.entityFieldHint} or its Name variant (e.g. contactName, projectName). The name they mention is WHICH entity to update, not a new value. Example: "update my contact name chirag fabiyani" → contactId or contactName: "chirag fabiyani".`
      : "";

  const prompt = `${tenantCtx}Extract field values from the user's message.

Today's date: ${today}

Fields to extract:
${fieldList}

User message: "${trimmed}"

Rules:
- Date fields: use ISO format YYYY-MM-DD. Resolve relative dates ("tomorrow" = day after ${today}, "next week", "in 10 months" = 10 months from ${today}).
- Text fields: extract the exact value mentioned.
- Dropdown/entity fields (contactId, contactName, projectId, projectName, client, project manager, site): extract the name the user mentioned as-is.${entityHint}
- Only include fields that have a clear value in the message. Omit fields not mentioned.
- Return an empty object {} if no fields can be extracted.`;

  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: FallbackExtractedSchema,
      prompt,
      abortSignal,
    });

    if (!object || Object.keys(object).length === 0) return undefined;

    console.log(
      `[Buddy AI Fallback Extraction] Extracted ${Object.keys(object).length} fields:`,
      Object.keys(object).join(", ")
    );

    return object;
  } catch (err) {
    console.error("Buddy AI extractFieldsFromMessage error:", err);
    return undefined;
  }
}
