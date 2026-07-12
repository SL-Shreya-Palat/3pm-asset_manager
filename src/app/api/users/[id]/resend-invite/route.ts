/**
 * POST /api/users/:id/resend-invite -- Resend the invitation email to a
 * member who hasn't accepted yet (status 'pending').
 *
 * Allowed for admins (Users page) OR anyone with driver-edit permission
 * (Drivers page resends the invite for a driver's linked member).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { requireAdmin, authorize } from '@/lib/authz';
import { resendInvitation } from '@/controller/users';

const DRIVERS_FORM_ID = 'people.drivers.driver';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  let user: { id: string; currentTenantId?: string | null } | null = null;

  const adminCheck = await requireAdmin(request);
  if (adminCheck.ok) {
    user = adminCheck.user;
  } else {
    const driverCheck = await authorize(request, DRIVERS_FORM_ID, 'edit');
    if (!driverCheck.ok) return adminCheck.res;
    user = driverCheck.ctx.user;
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ data: null, error: 'Invalid user id' }, { status: 400 });
  }

  try {
    const result = await resendInvitation(user.currentTenantId!, id, user.id);
    if (result.error) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[resend-invite] Failed:', err);
    return NextResponse.json(
      { data: null, error: 'Failed to resend the invitation' },
      { status: 500 },
    );
  }
}
