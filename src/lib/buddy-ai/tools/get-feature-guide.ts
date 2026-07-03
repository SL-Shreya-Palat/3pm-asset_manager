/**
 * Buddy AI — get_feature_guide tool
 *
 * Returns portal routes and feature descriptions from the navigation map,
 * filtered by the user's permissions. Use when answering "where is X" or
 * "how do I access Y" questions.
 */

import fs from "fs";
import path from "path";
import type { BuddyAIContext } from "../utils/rbac";

export type NavigationRoute = {
  path: string;
  label: string;
  description: string;
  module: string;
  features: string[];
  related: string[];
  permission: string;
};

export type GetFeatureGuideResult = {
  routes: Array<{
    path: string;
    label: string;
    description: string;
    module: string;
    related: string[];
  }>;
};

const NAVIGATION_MAP_PATH = path.join(
  process.cwd(),
  "lib",
  "buddy-ai",
  "data",
  "navigation-map.json"
);

/**
 * Load navigation map from disk. Cached per require for efficiency.
 */
function loadNavigationMap(): { routes: NavigationRoute[] } {
  const content = fs.readFileSync(NAVIGATION_MAP_PATH, "utf-8");
  return JSON.parse(content) as { routes: NavigationRoute[] };
}

/**
 * get_feature_guide — Returns routes the user can access, filtered by permissions.
 *
 * Routes with empty permission (e.g. dashboard) are always included.
 * Other routes require permissionChecker.hasPermission(route.permission).
 */
export function getFeatureGuide(context: BuddyAIContext): GetFeatureGuideResult {
  const { routes } = loadNavigationMap();
  const { permissionChecker } = context;

  const filtered = routes.filter((route) => {
    const perm = route.permission?.trim() ?? "";
    if (!perm) return true;
    return permissionChecker.hasPermission(perm);
  });

  return {
    routes: filtered.map(({ path: p, label, description, module: mod, related }) => ({
      path: p,
      label,
      description,
      module: mod,
      related,
    })),
  };
}
