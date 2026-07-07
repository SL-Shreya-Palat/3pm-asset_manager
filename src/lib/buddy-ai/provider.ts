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
import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";
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

/**
 * ai v7 wraps file-part data in tagged shapes ({ type: "data", data } /
 * { type: "url", url }). @ai-sdk/openai and @ai-sdk/google handle these
 * natively, but @openrouter/ai-sdk-provider 2.x was built for ai v6 and
 * stringifies the tag object — images/PDFs reach the API as broken base-64.
 *
 * This middleware un-tags back to the raw bytes/URL the provider expects.
 * Remove once @openrouter/ai-sdk-provider is upgraded past 2.x.
 */
const untagFileParts: LanguageModelMiddleware = {
  transformParams: async ({ params }) => {
    for (const msg of params.prompt) {
      if (!Array.isArray(msg.content)) continue;
      for (const part of msg.content) {
        if (part.type !== "file" || part.data == null || typeof part.data !== "object") continue;
        const tagged = part.data as { type?: string; data?: unknown; url?: string };
        if (tagged.type === "data") part.data = tagged.data as typeof part.data;
        else if (tagged.type === "url" && tagged.url) {
          part.data = new URL(tagged.url) as unknown as typeof part.data;
        }
      }
    }
    return params;
  },
};

/**
 * Vision model for AI document extraction (fuel import).
 *
 * Same provider priority as getModel(). Each provider can override the
 * extraction model separately via *_EXTRACT_MODEL env vars so you can use
 * a cheaper vision-specific model without changing the assistant model.
 *
 * OpenRouter is wrapped with untagFileParts middleware (see above).
 * OpenAI and Google SDKs are ai-v7-native — no middleware needed.
 */
export function getExtractModel(): LanguageModel {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    if (!cachedOpenAI) cachedOpenAI = createOpenAI({ apiKey: openAiKey });
    return cachedOpenAI(
      process.env.OPENAI_EXTRACT_MODEL || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    );
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    if (!cachedOpenRouter) cachedOpenRouter = createOpenRouter({ apiKey: openRouterKey });
    const modelId =
      process.env.OPENROUTER_EXTRACT_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
    return wrapLanguageModel({ model: cachedOpenRouter.chat(modelId), middleware: untagFileParts });
  }

  if (env.google.genAiApiKey) {
    if (!cachedGoogle) {
      cachedGoogle = createGoogleGenerativeAI({ apiKey: env.google.genAiApiKey });
    }
    return cachedGoogle(
      process.env.GOOGLE_GENAI_EXTRACT_MODEL || process.env.GOOGLE_GENAI_MODEL || DEFAULT_GOOGLE_MODEL,
    );
  }

  throw new Error(
    "No AI provider configured — set OPENAI_API_KEY, OPENROUTER_API_KEY, or GOOGLE_GENAI_API_KEY."
  );
}
