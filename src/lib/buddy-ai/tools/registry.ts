/**
 * Buddy AI — Tool framework
 *
 * A capability the assistant can invoke. Each tool wraps one existing
 * controller call and declares the RBAC permission that gates its exposure
 * plus whether it reads or writes. Adding a capability = one defineTool().
 *
 * Filtering happens per request in buildToolset — the model never sees a
 * tool the user isn't allowed to call. Write tools additionally require
 * in-chat user approval (propose → confirm → commit) via buildToolApproval.
 */

import { tool, type ToolSet } from "ai";
import type { z } from "zod";
import type { Action, ModuleKey } from "@/lib/rbac";
import { roleHasPermission } from "@/lib/rbac";
import type { BuddyAIContext } from "../utils/rbac";

export interface BuddyToolDef {
  name: string;
  /** "read" auto-executes; "write" requires in-chat user confirmation. */
  access: "read" | "write";
  /** Permission the user must hold; null = available to everyone. */
  permission: { module: ModuleKey; action: Action } | null;
  /** Only expose to admin/owner roles (scope: "all") — mirrors nav adminOnly. */
  adminOnly?: boolean;
  description: string;
  inputSchema: z.ZodType;
  execute: (input: never, ctx: BuddyAIContext) => Promise<unknown>;
}

/** Authoring helper — keeps `execute`'s input strongly typed from the schema. */
export function defineTool<S extends z.ZodType>(def: {
  name: string;
  access: "read" | "write";
  permission: { module: ModuleKey; action: Action } | null;
  adminOnly?: boolean;
  description: string;
  inputSchema: S;
  execute: (input: z.infer<S>, ctx: BuddyAIContext) => Promise<unknown>;
}): BuddyToolDef {
  return def as unknown as BuddyToolDef;
}

/** Can this user's role use this tool? (also used by the fleet snapshot) */
export function canUseTool(def: BuddyToolDef, ctx: BuddyAIContext): boolean {
  if (def.adminOnly && ctx.role.permissions.scope !== "all") return false;
  if (def.permission) {
    return roleHasPermission(ctx.role, def.permission.module, def.permission.action);
  }
  return true;
}

/**
 * Assemble the toolset for THIS request: only tools the user is permitted
 * to use. The model never sees a tool it isn't allowed to call.
 */
export function buildToolset(defs: BuddyToolDef[], ctx: BuddyAIContext): ToolSet {
  const toolset: ToolSet = {};
  for (const def of defs) {
    if (!canUseTool(def, ctx)) continue;
    toolset[def.name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: (input) => def.execute(input as never, ctx),
    });
  }
  return toolset;
}

/**
 * Every "write" tool that made it into the toolset must be user-approved
 * before it executes (propose → confirm → commit). Read tools auto-execute.
 */
export function buildToolApproval(
  defs: BuddyToolDef[],
  toolset: ToolSet,
): Record<string, "user-approval"> {
  const approval: Record<string, "user-approval"> = {};
  for (const def of defs) {
    if (def.access === "write" && toolset[def.name]) approval[def.name] = "user-approval";
  }
  return approval;
}
