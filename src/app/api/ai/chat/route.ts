/**
 * Buddy AI — Chat API
 *
 * POST /api/ai/chat
 * Request: { messages: UIMessage[], threadId?: string }
 *   - no threadId → a new thread is created (titled from the first user message)
 * Response: AI SDK UI message stream (consumed by useChat), X-Thread-Id header.
 * Read tools auto-execute; write tools pause for in-chat user approval.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { getModel, isAiConfigured } from "@/lib/buddy-ai/provider";
import { buildSystemPrompt } from "@/lib/buddy-ai/config/system-prompt";
import { REGISTRY, buildToolset, buildToolApproval } from "@/lib/buddy-ai/tools";
import { requireBuddyContext } from "@/lib/buddy-ai/utils/require-context";
import {
  createThread,
  getThread,
  saveThreadMessages,
  updateThreadTitle,
} from "@/lib/buddy-ai/db/threads";

// Controllers use the MongoDB driver → Node runtime, not edge.
export const runtime = "nodejs";
// Allow a few tool round-trips to complete within one request.
export const maxDuration = 60;

/** First user text in the conversation — used as the thread title. */
function deriveTitle(messages: UIMessage[]): string {
  for (const m of messages) {
    if (m.role !== "user") continue;
    for (const part of m.parts) {
      if (part.type === "text" && part.text.trim()) {
        return part.text.trim().slice(0, 100);
      }
    }
  }
  return "New chat";
}

export async function POST(req: NextRequest) {
  try {
    const { context, error } = await requireBuddyContext(req);
    if (error) return error;

    if (!isAiConfigured()) {
      return NextResponse.json(
        {
          error:
            "Buddy AI isn't configured yet. Set OPENROUTER_API_KEY or GOOGLE_GENAI_API_KEY.",
        },
        { status: 503 },
      );
    }

    let body: { messages?: UIMessage[]; threadId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return NextResponse.json({ error: "messages is required" }, { status: 400 });
    }

    // Resolve the thread: verify ownership, or start a new one.
    let threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
    let isNewThread = false;
    if (threadId) {
      const thread = await getThread(threadId, context.userId, context.tenantId);
      if (!thread) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }
    } else {
      threadId = await createThread(
        context.userId,
        context.tenantId,
        deriveTitle(messages),
      );
      isNewThread = true;
    }

    const toolset = buildToolset(REGISTRY, context);

    const result = streamText({
      model: getModel(),
      system: buildSystemPrompt(context),
      messages: await convertToModelMessages(messages),
      tools: toolset,
      // Write tools gate on user confirmation; read tools auto-execute.
      toolApproval: buildToolApproval(REGISTRY, toolset),
      stopWhen: stepCountIs(8),
      abortSignal: req.signal,
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      headers: { "X-Thread-Id": threadId },
      onError: (error) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("Buddy AI stream error:", msg);
        if (/api[_ ]?key|invalid_api_key|API_KEY_INVALID|unauthor|\b401\b/i.test(msg)) {
          return "Buddy's AI key is invalid or missing. Add a valid OPENAI_API_KEY (or OPENROUTER_API_KEY / GOOGLE_GENAI_API_KEY) to the app's .env.local and restart the server.";
        }
        return "Buddy couldn't reach the AI service. Please try again.";
      },
      onFinish: async ({ messages: updated }) => {
        try {
          await saveThreadMessages(
            threadId,
            context.userId,
            context.tenantId,
            updated,
          );
          if (isNewThread) {
            await updateThreadTitle(
              threadId,
              context.userId,
              context.tenantId,
              deriveTitle(updated),
            );
          }
        } catch (err) {
          console.error("Buddy AI save thread error:", err);
        }
      },
    });
  } catch (error) {
    console.error("Buddy AI chat error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
