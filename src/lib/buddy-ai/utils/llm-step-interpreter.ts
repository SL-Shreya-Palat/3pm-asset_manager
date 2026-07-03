/**
 * Buddy AI — LLM Step Interpreter
 *
 * Interprets user free-text at workflow steps. No manual matching, no regex.
 * Handles: dropdown selection ("Acme" → option id), dates ("next tuesday" → ISO),
 * budgets ("50k" → 50000), plain text.
 *
 * @see BUDDY_AI_GENERIC_WORKFLOW_PLAN.md Step 1
 */

import { generateObject } from "ai";
import { z } from "zod";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "@/lib/env";
import type { BuddyAIContext } from "./rbac";
import type { WorkflowFieldDefinition } from "../workflows/types";
import type { DropdownOption } from "../types";

const google = createGoogleGenerativeAI({
  apiKey: env.google.genAiApiKey,
});

const MODEL_ID = "gemini-2.5-flash";

/** Use string literals for discriminator — Gemini API rejects boolean enum values. */
const InterpretOutputSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal("true"),
    value: z.union([z.string(), z.number()]),
  }),
  z.object({
    success: z.literal("false"),
    error: z.string(),
  }),
]);

export type InterpretStepInput = {
  workflow: string;
  currentStep: string;
  field: WorkflowFieldDefinition;
  options?: DropdownOption[];
  collectedData: Record<string, unknown>;
  userMessage: string;
  todayIso: string;
};

export type InterpretStepResult =
  | { value: unknown }
  | { error: string };

function buildPrompt(context: BuddyAIContext, input: InterpretStepInput): string {
  const { field, options, userMessage, todayIso } = input;
  const optionsStr =
    options && options.length > 0
      ? options.map((o) => `  - value: "${o.value}", label: "${o.label}"`).join("\n")
      : "  (none)";

  const isBudgetField =
    field.type === "text" &&
    (field.name === "budget" || field.label.toLowerCase().includes("budget"));

  const fieldTypeInstructions: Record<string, string> = {
    dropdown: `Pick the best-matching option from the list. Return the option's "value" (the ID). If no clear match, return error. Handles: partial names, "the first one", typos.`,
    date: `Parse the date. Return ISO YYYY-MM-DD. Handles: "next tuesday", "tomorrow", "17/02/2026", "Feb 17 2026". Today is ${todayIso}.`,
    text: isBudgetField
      ? `Parse as a number (e.g. "50k"→50000, "$50,000"→50000, "around 50 grand"→50000). Return the number.`
      : `Return the trimmed string value.`,
  };

  const instruction = fieldTypeInstructions[field.type] ?? `Return the value as appropriate for this field.`;

  const tenantContext = context.tenantName
    ? `You are helping **${context.tenantName}**, a construction business. `
    : "You are helping a construction business. ";

  return `${tenantContext}The user is filling a workflow step.

Workflow: ${input.workflow}
Step: ${input.currentStep}
Field: ${field.name} (${field.label}, type: ${field.type})
${field.type === "dropdown" ? `Options:\n${optionsStr}` : ""}

User message: "${userMessage}"

${instruction}

Return success: "true" with value when you can interpret, or success: "false" with error when you cannot.
When returning an error, be specific to the field type:
- dropdown: suggest choosing from the list or entering a partial name (e.g. "No matching option — try a partial name or select from the list above.")
- date: suggest format examples (e.g. "Could not parse that. Try 'next Tuesday' or '17/02/2026'.")
- text (budget): suggest number format (e.g. "Please enter a number, e.g. '50k' or '50000'.")
- text (other): brief prompt (e.g. "Please enter a value.")`;
}

/** Field-specific fallback when LLM call fails (API error, etc.) */
function getFallbackError(input: InterpretStepInput): string {
  const { field } = input;
  const isBudget =
    field.type === "text" &&
    (field.name === "budget" || field.label.toLowerCase().includes("budget"));

  switch (field.type) {
    case "dropdown":
      return "Something went wrong. Please try again or select from the list above.";
    case "date":
      return "Something went wrong. Please try again — use formats like 'next Tuesday' or '17/02/2026'.";
    case "text":
      return isBudget
        ? "Something went wrong. Please try again — use formats like '50k' or '50000'."
        : "Something went wrong. Please try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/**
 * Interpret user free-text for the current workflow step.
 * Returns normalized value or error. No regex, no manual matching.
 */
export async function interpretStepInput(
  context: BuddyAIContext,
  input: InterpretStepInput,
  abortSignal?: AbortSignal
): Promise<InterpretStepResult> {
  const trimmed = input.userMessage.trim();
  if (!trimmed) {
    return { error: "Please enter a value." };
  }

  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: InterpretOutputSchema,
      prompt: buildPrompt(context, input),
      abortSignal,
    });

    if (object.success === "true") {
      return { value: object.value };
    }
    return { error: object.error };
  } catch (err) {
    console.error("Buddy AI interpretStepInput error:", err);
    return { error: getFallbackError(input) };
  }
}
