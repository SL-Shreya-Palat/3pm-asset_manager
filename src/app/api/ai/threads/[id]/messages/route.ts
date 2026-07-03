/**
 * Buddy AI — Thread messages API
 *
 * GET /api/ai/threads/[id]/messages — Load messages for a thread
 */

import { NextRequest, NextResponse } from "next/server";
import { requireBuddyContext } from "@/lib/buddy-ai/utils/require-context";
import { getThreadMessages } from "@/lib/buddy-ai/db/threads";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { context, error } = await requireBuddyContext(req);
    if (error) return error;

    const { id: threadId } = await params;
    if (!threadId) {
      return NextResponse.json({ error: "Thread ID required" }, { status: 400 });
    }

    const messages = await getThreadMessages(
      threadId,
      context.userId,
      context.tenantId
    );
    if (messages === null) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Buddy AI thread messages error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to load messages";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
