/**
 * GET  /api/notification-settings  — event catalogue + effective routing rules
 * PUT  /api/notification-settings  — upsert the tenant's routing rules (admin only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserRoleForTenant } from '@/lib/auth-helper';
import {
  getNotificationSettings,
  upsertNotificationSettings,
} from '@/controller/notification-settings';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await getNotificationSettings(user.currentTenantId);
    return NextResponse.json({ data: result.data, error: null });
  } catch (error) {
    console.error('[NOTIFICATION_SETTINGS GET]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to load notification settings' },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id || !user.currentTenantId) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    // Tenant-wide routing config — restrict changes to Admins/Owner.
    const role = await getUserRoleForTenant(user.id, user.currentTenantId);
    if (!role?.isAdmin) {
      return NextResponse.json(
        { data: null, error: 'Only an administrator can change notification settings' },
        { status: 403 },
      );
    }

    const body = await req.json();
    const result = await upsertNotificationSettings(user.currentTenantId, user.id, body?.rules);

    if (result.error) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch (error) {
    console.error('[NOTIFICATION_SETTINGS PUT]', error);
    return NextResponse.json(
      { data: null, error: 'Failed to save notification settings' },
      { status: 500 },
    );
  }
}
