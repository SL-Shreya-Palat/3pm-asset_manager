/**
 * Buddy AI — Consultant tools builder
 *
 * Builds the tools object for the consultant (streamText) agent.
 * Extracted for use by ConsultantHandler and orchestrate.
 */

import { type Tool, tool } from "ai";
import { z } from "zod";
import type { BuddyAIContext } from "./utils/rbac";
import { canAccessTool } from "./utils/rbac";
import { chargeAiCredits } from "@/lib/ai-credits/guard";
import {
  getFeatureGuide,
  listProjects,
  getProjectDetails,
  getStaffDirectory,
  listLeaveRequests,
  listBusinessContacts,
  listAssets,
  listTasksByProject,
  listLeads,
  listQuotes,
  listInvoices,
  listClaims,
} from "./tools";

export function buildTools(context: BuddyAIContext): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  if (canAccessTool(context, "get_feature_guide")) {
    tools.get_feature_guide = tool({
      description:
        "Returns portal routes and features the user can access. Use when they ask 'where is X', 'how do I access Y', 'where can I find Z', or 'what can I do in the portal'.",
      inputSchema: z.object({}),
      execute: async () => getFeatureGuide(context),
    });
  }

  if (canAccessTool(context, "list_projects")) {
    tools.list_projects = tool({
      description:
        "Returns projects for the tenant. Use when the user asks about projects, project list, project status, active projects, OR for broad business overview/analysis queries.",
      inputSchema: z.object({}),
      execute: async () => listProjects(context),
    });
  }

  if (canAccessTool(context, "get_project_details")) {
    tools.get_project_details = tool({
      description:
        "Returns detailed info for a single project by ID. Use when the user asks about a specific project, e.g. 'tell me about project X', 'what's the status of project [id]', or references a project from list_projects.",
      inputSchema: z.object({
        projectId: z.string().describe("The project ID (MongoDB ObjectId)"),
      }),
      execute: async ({ projectId }) => getProjectDetails(context, projectId),
    });
  }

  if (canAccessTool(context, "get_staff_directory")) {
    tools.get_staff_directory = tool({
      description:
        "Returns staff/team members for the tenant. Use when the user asks about staff, employees, team members, who works in the organization, OR for broad business overview/analysis queries.",
      inputSchema: z.object({}),
      execute: async () => getStaffDirectory(context),
    });
  }

  if (canAccessTool(context, "list_leave_requests")) {
    tools.list_leave_requests = tool({
      description:
        "Returns leave requests for the tenant. Use when the user asks about leave, time off, holidays, PTO, absence requests, OR for broad business overview/analysis queries.",
      inputSchema: z.object({}),
      execute: async () => listLeaveRequests(context),
    });
  }

  if (canAccessTool(context, "list_business_contacts")) {
    tools.list_business_contacts = tool({
      description:
        "Returns business contacts (clients, suppliers, subcontractors). Use when the user asks about contacts, clients, suppliers, business partners, OR for broad business overview/analysis queries.",
      inputSchema: z.object({}),
      execute: async () => listBusinessContacts(context),
    });
  }

  if (canAccessTool(context, "list_assets")) {
    tools.list_assets = tool({
      description:
        "Returns assets (equipment, vehicles, machinery). Use when the user asks about assets, equipment, fleet, machinery, OR for broad business overview/analysis queries.",
      inputSchema: z.object({}),
      execute: async () => listAssets(context),
    });
  }

  if (canAccessTool(context, "list_tasks_by_project")) {
    tools.list_tasks_by_project = tool({
      description:
        "Returns tasks for a specific project. Use when the user asks about project tasks, work schedule, or what needs to be done on a project. Requires projectId from list_projects.",
      inputSchema: z.object({
        projectId: z.string().describe("The project ID"),
      }),
      execute: async ({ projectId }) => listTasksByProject(context, projectId),
    });
  }

  if (canAccessTool(context, "list_leads")) {
    tools.list_leads = tool({
      description:
        "Returns sales leads. Use when the user asks about leads, pipeline, sales opportunities, OR for broad business overview/analysis queries.",
      inputSchema: z.object({}),
      execute: async () => listLeads(context),
    });
  }

  if (canAccessTool(context, "list_quotes")) {
    tools.list_quotes = tool({
      description:
        "Returns quotes/estimates. Use when the user asks about quotes, estimates, pending proposals, OR for broad business overview/analysis queries.",
      inputSchema: z.object({}),
      execute: async () => listQuotes(context),
    });
  }

  if (canAccessTool(context, "list_invoices")) {
    tools.list_invoices = tool({
      description:
        "Returns invoices. Use when the user asks about invoices, billing, payments due, OR for broad business overview/analysis queries.",
      inputSchema: z.object({}),
      execute: async () => listInvoices(context),
    });
  }

  if (canAccessTool(context, "list_claims")) {
    tools.list_claims = tool({
      description:
        "Returns insurance claims. Use when the user asks about claims, insurance, claim status, OR for broad business overview/analysis queries.",
      inputSchema: z.object({}),
      execute: async () => listClaims(context),
    });
  }

  for (const [name, t] of Object.entries(tools)) {
    const exec = t.execute as
      | ((input: unknown, options: unknown) => unknown)
      | undefined;
    if (!exec) continue;
    (t as { execute: unknown }).execute = async (
      input: unknown,
      options: unknown,
    ) => {
      const charge = await chargeAiCredits(context.userId, context.tenantId, {
        feature: `chat:${name}`,
      });
      if (!charge.ok) {
        return { error: charge.error };
      }
      try {
        return await exec(input, options);
      } catch (err) {
        // The action never happened — give the credit back.
        await charge.refund();
        throw err;
      }
    };
  }

  return tools;
}
