/**
 * Buddy AI — list_assets tool
 *
 * Returns assets (equipment, vehicles, machinery) for the tenant.
 * Use when the user asks about assets, equipment, fleet, or machinery.
 */

import { getAllAssets } from "@/controller/assets";
import type { BuddyAIContext } from "../utils/rbac";

export type ListAssetsResult = {
  assets: Array<{
    id: string;
    assetCode?: string;
    assetDisplay?: string;
    assetType?: string;
    status?: string;
    location?: string;
    model?: string;
  }>;
  total: number;
};

/**
 * list_assets — Returns assets for the tenant.
 */
export async function listAssets(
  context: BuddyAIContext
): Promise<ListAssetsResult> {
  const { tenantId } = context;

  const result = await getAllAssets(tenantId, {
    page: 1,
    limit: 15,
  });

  const assets = (result.assets as Array<Record<string, unknown>>).map((a) => {
    const registry = (a.assetRegistry as Record<string, unknown>) || {};
    const details = (a.assetDetails as Record<string, unknown>) || {};
    const info = (a.assetInformation as Record<string, unknown>) || {};
    return {
      id: String(a._id ?? ""),
      assetCode: (registry.assetCode as string) || undefined,
      assetDisplay: (registry.assetDisplay as string) || undefined,
      assetType: (details.assetType as string) || undefined,
      status: (a.status as string) || undefined,
      location: (registry.assetRegion as string) || undefined,
      model: (info.model as string) || undefined,
    };
  });

  return {
    assets,
    total: result.total,
  };
}
