/**
 * Buddy AI — Route auth helper
 *
 * Shared by all /api/ai/* routes: authenticates the request and resolves
 * BuddyAIContext, mapping the known resolveContext errors to HTTP responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helper";
import { resolveContext } from "./context";
import type { BuddyAIContext } from "./rbac";

export type BuddyContextResult =
  | { context: BuddyAIContext; error?: never }
  | { context?: never; error: NextResponse };

export async function requireBuddyContext(
  req: NextRequest
): Promise<BuddyContextResult> {
  const user = await getAuthenticatedUser(req);
  if (!user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const context = await resolveContext({
      id: user.id,
      currentTenantId: user.currentTenantId ?? null,
    });
    return { context };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Please select an organization first") {
      return { error: NextResponse.json({ error: message }, { status: 400 }) };
    }
    if (message === "Tenant membership not found") {
      return { error: NextResponse.json({ error: message }, { status: 404 }) };
    }
    throw err;
  }
}
