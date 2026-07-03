/**
 * Buddy AI — LLM Entity Resolver
 *
 * Resolves user free-text (e.g. "Acme", "John") to entity ID from options.
 * No manual matching, no regex. LLM picks best match.
 * Extended with resolveEntityWithOptionsEx for ambiguous/not_found handling.
 *
 * @see BUDDY_AI_GENERIC_WORKFLOW_PLAN.md Step 2
 * @see BUDDY_AI_V3_STRENGTHENING_PLAN.md Phase 4
 */

import { generateObject } from "ai";
import { z } from "zod";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "@/lib/env";
import type { BuddyAIContext } from "./rbac";
import type { DropdownOption } from "../types";

const google = createGoogleGenerativeAI({
  apiKey: env.google.genAiApiKey,
});

const MODEL_ID = "gemini-2.5-flash";

const ResolveOutputSchema = z.object({
  matchedValue: z.string().optional(),
  confidence: z.enum(["high", "low", "none"]).optional(),
});

/** Extended schema: returns top matches when ambiguous */
const ResolveExOutputSchema = z.object({
  status: z.enum(["resolved", "ambiguous", "not_found"]),
  matchedValue: z.string().optional(),
  /** Top 3–5 matching option values when ambiguous */
  matchedValues: z.array(z.string()).optional(),
});

export type ResolvedEntity = {
  id: string;
  label: string;
};

export type ResolveEntityExResult =
  | { status: "resolved"; id: string; label: string }
  | { status: "ambiguous"; matches: DropdownOption[] }
  | { status: "not_found" };

/**
 * Resolve user value (e.g. "Acme", "the first one") to entity ID from options.
 * Uses LLM to pick best match. Handles typos, partial names, ordinals.
 *
 * When confidence is "low" but there is a single plausible match, we return it
 * instead of null. The user will see it in the confirmation step and can edit
 * if wrong — better than silently dropping the match.
 *
 * @param context — Buddy context (tenant name, etc.)
 * @param userValue — What the user said (e.g. "Acme Corp", "John")
 * @param options — Available options (value=id, label=display name)
 * @returns Matched entity or null if no match (confidence "none" or no matchedValue)
 */
export async function resolveEntityWithLLM(
  context: BuddyAIContext,
  userValue: string,
  options: DropdownOption[],
  abortSignal?: AbortSignal
): Promise<ResolvedEntity | null> {
  const trimmed = userValue.trim();
  if (!trimmed || options.length === 0) return null;

  const optionsStr = options
    .map((o, i) => `  ${i + 1}. value: "${o.value}", label: "${o.label}"`)
    .join("\n");

  const tenantContext = context.tenantName
    ? `You are helping **${context.tenantName}**, a construction business. `
    : "You are helping a construction business. ";

  const prompt = `${tenantContext}The user is selecting an entity (client, staff member, site, etc.) from a list. Resolve their reference to the correct option.

User said: "${trimmed}"

Available options:
${optionsStr}

Pick the best-matching option. Consider: exact match, partial match, "the first one" = option 1, "the second" = option 2, typos, abbreviations.
Return matchedValue as the option's "value" (the ID) if confident, or omit if no good match.
Return confidence: "high" if clear match, "low" if ambiguous, "none" if no match.`;

  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: ResolveOutputSchema,
      prompt,
      abortSignal,
    });

    if (object.confidence === "none" || !object.matchedValue) return null;
    // When confidence is "low", we still return the match if valid — user can confirm/edit at confirmation step
    // (better than silently dropping a plausible match)

    const option = options.find((o) => o.value === object.matchedValue);
    if (!option) return null;

    return { id: option.value, label: option.label };
  } catch (err) {
    console.error("Buddy AI resolveEntityWithLLM error:", err);
    return null;
  }
}

/**
 * Resolve user value with extended status: resolved, ambiguous, or not_found.
 * When ambiguous, returns top 3–5 matches for selection chips.
 */
export async function resolveEntityWithOptionsEx(
  context: BuddyAIContext,
  userValue: string,
  options: DropdownOption[],
  abortSignal?: AbortSignal
): Promise<ResolveEntityExResult> {
  const trimmed = userValue.trim();
  if (!trimmed || options.length === 0) return { status: "not_found" };

  const optionsStr = options
    .map((o, i) => `  ${i + 1}. value: "${o.value}", label: "${o.label}"`)
    .join("\n");

  const tenantContext = context.tenantName
    ? `You are helping **${context.tenantName}**, a construction business. `
    : "You are helping a construction business. ";

  const prompt = `${tenantContext}The user is selecting an entity (client, staff member, site, etc.) from a list. Resolve their reference.

User said: "${trimmed}"

Available options:
${optionsStr}

Return:
- status: "resolved" if ONE clear match. Set matchedValue to that option's "value" (the ID).
- status: "ambiguous" if 2+ options could match (e.g. "Acme" matches "Acme Corp" and "Acme Ltd"). Set matchedValues to the top 3–5 matching option values (the IDs).
- status: "not_found" if no match.

Consider: exact match, partial match, "the first one" = option 1, typos, abbreviations.`;

  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: ResolveExOutputSchema,
      prompt,
      abortSignal,
    });

    if (object.status === "not_found") return { status: "not_found" };

    if (object.status === "resolved" && object.matchedValue) {
      const option = options.find((o) => o.value === object.matchedValue);
      if (option) return { status: "resolved", id: option.value, label: option.label };
      return { status: "not_found" };
    }

    if (object.status === "ambiguous" && object.matchedValues?.length) {
      const matches = object.matchedValues
        .map((v) => options.find((o) => o.value === v))
        .filter((o): o is DropdownOption => o != null);
      if (matches.length > 0) return { status: "ambiguous", matches };
    }

    return { status: "not_found" };
  } catch (err) {
    console.error("Buddy AI resolveEntityWithOptionsEx error:", err);
    return { status: "not_found" };
  }
}
