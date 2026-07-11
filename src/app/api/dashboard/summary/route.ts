/**
 * GET /api/dashboard/summary — consolidated fleet overview for the home
 * dashboard (asset, compliance, defect, fault, work-order & fuel aggregates).
 */
import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authz";
import { getDashboardSummary } from "@/controller/dashboard";

export async function GET(request: NextRequest) {
  const auth = await authorize(request, "assets.assets.asset", "view");
  if (!auth.ok) return auth.res;
  const { user, teamIds } = auth.ctx;

  const result = await getDashboardSummary(user.currentTenantId!, {
    teamIds: teamIds ?? undefined,
  });
  return NextResponse.json({ data: result, error: null });
}
