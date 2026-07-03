/**
 * Buddy AI — Model access
 *
 * Configured entirely from the environment so the model can be swapped
 * without a code change. Providers are tried in this order:
 *   1. OPENAI_API_KEY     → OpenAI direct; default "gpt-4o-mini"
 *                           (override with OPENAI_MODEL)
 *   2. OPENROUTER_API_KEY  → OpenRouter; default "anthropic/claude-sonnet-4.5"
 *                           (override with OPENROUTER_MODEL)
 *   3. GOOGLE_GENAI_API_KEY→ Google Gemini; default "gemini-2.5-flash"
 *                           (override with GOOGLE_GENAI_MODEL)
 *
 * NOTE: tool calling only works if the chosen model supports it — gpt-4o-mini,
 * Claude, and most Gemini models do.
 */

import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { createOpenRouter, type OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { env } from "@/lib/env";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.5";
const DEFAULT_GOOGLE_MODEL = "gemini-2.5-flash";

let cachedOpenAI: OpenAIProvider | null = null;
let cachedOpenRouter: OpenRouterProvider | null = null;
let cachedGoogle: GoogleGenerativeAIProvider | null = null;

/** True when at least one provider key is configured. */
export function isAiConfigured(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      env.google.genAiApiKey
  );
}

/** The chat model used for the assistant loop. */
export function getModel(): LanguageModel {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    if (!cachedOpenAI) cachedOpenAI = createOpenAI({ apiKey: openAiKey });
    return cachedOpenAI(process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL);
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    if (!cachedOpenRouter) cachedOpenRouter = createOpenRouter({ apiKey: openRouterKey });
    return cachedOpenRouter.chat(process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL);
  }

  if (env.google.genAiApiKey) {
    if (!cachedGoogle) {
      cachedGoogle = createGoogleGenerativeAI({ apiKey: env.google.genAiApiKey });
    }
    return cachedGoogle(process.env.GOOGLE_GENAI_MODEL || DEFAULT_GOOGLE_MODEL);
  }

  throw new Error(
    "No AI provider configured — set OPENAI_API_KEY, OPENROUTER_API_KEY, or GOOGLE_GENAI_API_KEY."
  );
}
