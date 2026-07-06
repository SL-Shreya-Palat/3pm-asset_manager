/**
 * GET /api/command/stock?search=&stockId= -- Command stock for WO part pickers.
 *
 * Without `stockId`: normalized stock options (id, name, code) from Command's
 * dropdown. With `stockId`: that item's per-location on-hand (for choosing a
 * location and showing availability before completion).
 * Only meaningful in connected mode — returns 409 otherwise.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { getOptions } from '@/lib/command/fetchers';
import { getCommandStockLevels } from '@/lib/command/stock';
import { getEnabledConnectionAuthTenantId } from '@/controller/command-connection/guard';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const authTenantId = await getEnabledConnectionAuthTenantId(user.currentTenantId);
  if (!authTenantId) {
    return NextResponse.json(
      { data: null, error: 'Command connection is off' },
      { status: 409 },
    );
  }

  const { searchParams } = request.nextUrl;
  const stockId = searchParams.get('stockId');

  if (stockId) {
    const levels = await getCommandStockLevels(stockId, authTenantId);
    if (!levels.ok) {
      return NextResponse.json(
        { data: null, error: `Command stock levels unavailable (${levels.reason})` },
        { status: levels.reason === 'unreachable' ? 503 : 400 },
      );
    }
    return NextResponse.json({ data: { levels: levels.data }, error: null });
  }

  const search = searchParams.get('search') || undefined;
  const options = await getOptions('stock', authTenantId, search);
  if (!options.ok) {
    return NextResponse.json(
      { data: null, error: `Command stock unavailable (${options.reason})` },
      { status: options.reason === 'unreachable' ? 503 : 400 },
    );
  }
  return NextResponse.json({ data: { items: options.data }, error: null });
}
