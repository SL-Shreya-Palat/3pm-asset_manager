/**
 * Buddy AI — get_feature_guide tool
 *
 * Returns app routes and feature descriptions, filtered by the user's
 * permissions. Use when answering "where is X" or "how do I access Y".
 *
 * DRY: derives routes from the live sidebar config (`navItems`) with the same
 * RBAC rules the sidebar applies — no separate navigation map to maintain.
 */

import { z } from "zod";
import { getFlatNavItems } from "@/constants/navigation";
import { isWildcardPermissions } from "@/lib/rbac";
import type { BuddyAIContext } from "../utils/rbac";
import { defineTool } from "./registry";

export type GetFeatureGuideResult = {
  routes: Array<{
    path: string;
    label: string;
    description: string;
    module: string;
  }>;
};

/** Human descriptions per route — the only Buddy-specific content here. */
const ROUTE_DESCRIPTIONS: Record<string, string> = {
  "/dashboard": "Overview of fleet health, open defects, and upcoming services.",
  "/inspections": "Pre-start inspections hub.",
  "/inspections/history": "All submitted inspections with pass/fail results.",
  "/inspections/forms": "Inspection form templates used at pre-start.",
  "/inspections/defect-settings": "Rules that turn failed inspection answers into defects.",
  "/inspections/exception-report": "Inspections flagged with exceptions or failures.",
  "/maintenance": "Maintenance hub for services, work orders, and defects.",
  "/maintenance/service-tasks": "Individual service task definitions.",
  "/maintenance/service-programs": "Recurring service programs assigned to assets.",
  "/maintenance/service-schedule": "Upcoming and overdue service schedule per asset.",
  "/maintenance/work-orders": "Create, assign, and complete work orders.",
  "/maintenance/defects": "Reported defects and their resolution status.",
  "/maintenance/faults": "Fault codes reported against assets.",
  "/maintenance/purchase-orders": "Purchase orders for parts and services.",
  "/maintenance/inventory": "Parts inventory, categories, and stock locations.",
  "/assets": "Fleet register — vehicles, plant, and equipment.",
  "/vendors": "Vendor directory for suppliers and service providers.",
  "/fuel": "Fuel transactions and fuel analytics.",
  "/people": "People hub for users, teams, and drivers.",
  "/people/users": "Manage user accounts and access.",
  "/people/teams": "Teams used to group assets and people.",
  "/people/drivers": "Driver profiles and wellness checks.",
  "/people/roles": "Roles and permission settings.",
};

/**
 * get_feature_guide — Returns routes the user can access, filtered by RBAC.
 */
function getFeatureGuide(context: BuddyAIContext): GetFeatureGuideResult {
  const { role, checker } = context;
  const hasFullAccess = isWildcardPermissions(role.permissions);

  const routes = getFlatNavItems()
    .filter((item) => {
      if (item.adminOnly) return hasFullAccess;
      if (item.requiredModule) {
        return checker.hasPermission(`${item.requiredModule}:view`);
      }
      return true;
    })
    .map((item) => ({
      path: item.href,
      label: item.parent ? `${item.parent} › ${item.label}` : item.label,
      description: ROUTE_DESCRIPTIONS[item.href] ?? "",
      module: item.requiredModule ?? "general",
    }));

  return { routes };
}

export const featureGuide = defineTool({
  name: "get_feature_guide",
  access: "read",
  permission: null,
  description:
    "Returns app routes and features the user can access. Use when they ask 'where is X', 'how do I access Y', 'where can I find Z', or 'what can I do in the app'.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => getFeatureGuide(ctx),
});
