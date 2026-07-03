/**
 * Buddy AI — Threads API
 *
 * GET /api/ai/threads — List threads for the user
 * POST /api/ai/threads — Create a new thread
 */

import { NextRequest, NextResponse } from "next/server";
import { requireBuddyContext } from "@/lib/buddy-ai/utils/require-context";
import { listThreads, createThread } from "@/lib/buddy-ai/db/threads";

export async function GET(req: NextRequest) {
  try {
    const { context, error } = await requireBuddyContext(req);
    if (error) return error;

    const threads = await listThreads(context.userId, context.tenantId);
    return NextResponse.json({ threads });
  } catch (error) {
    console.error("Buddy AI threads list error:", error);
    const msg = error instanceof Error ? error.message : "Failed to list threads";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { context, error } = await requireBuddyContext(req);
    if (error) return error;

    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title.trim() : undefined;

    const threadId = await createThread(
      context.userId,
      context.tenantId,
      title || "New chat"
    );
    return NextResponse.json({ threadId });
  } catch (error) {
    console.error("Buddy AI thread create error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create thread";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
