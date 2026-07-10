/**
 * GET /api/drivers/next-employee-number -- Preview the projected employee
 * number (EMP-xxxx) for the create form. Does not consume the counter.
 */
import { NextRequest, NextResponse } from 'next/server';
import { peekNextEmployeeNumber } from '@/controller/drivers';
import { authorize } from '@/lib/authz';

const FORM_ID = 'people.drivers.driver';

export async function GET(request: NextRequest) {
  const auth = await authorize(request, FORM_ID, 'create');
  if (!auth.ok) return auth.res;
  const { user } = auth.ctx;

  const employeeNumber = await peekNextEmployeeNumber(user.currentTenantId!);
  return NextResponse.json({ data: { employeeNumber }, error: null });
}
