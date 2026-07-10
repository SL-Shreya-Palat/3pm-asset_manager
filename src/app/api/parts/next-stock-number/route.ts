/**
 * GET /api/parts/next-stock-number -- Preview the projected system stock
 * number (STK-xxxx) for the create form. Does not consume the counter.
 */
import { NextRequest, NextResponse } from 'next/server';
import { peekNextStockNumber } from '@/controller/parts';
import { authorize } from '@/lib/authz';

const FORM_ID = 'maintenance.inventory.inventoryItem';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const stockNumber = await peekNextStockNumber(user.currentTenantId!);
  return NextResponse.json({ data: { stockNumber }, error: null });
}
