/**
 * Buddy AI — Single thread API
 *
 * DELETE /api/ai/threads/[id] — Delete a thread
 */

import { NextRequest, NextResponse } from "next/server";
import { requireBuddyContext } from "@/lib/buddy-ai/utils/require-context";
import { deleteThread } from "@/lib/buddy-ai/db/threads";

export async function DELETE(
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

    const deleted = await deleteThread(
      threadId,
      context.userId,
      context.tenantId
    );
    if (!deleted) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Buddy AI thread delete error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to delete thread";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
