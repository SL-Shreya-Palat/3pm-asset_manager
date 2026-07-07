/**
 * Database-backed session activity tracking (mobile sessions), used alongside
 * the 3pm-auth SSO flow. Only the tenant-switch route touches this today.
 */
import { getSessionsCollection } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function updateSessionActivity(
  sessionToken: string,
  currentTenantId?: string | ObjectId | null,
) {
  try {
    const sessionsCollection = await getSessionsCollection();
    const updateData: Record<string, unknown> = { lastActivityAt: new Date() };

    if (currentTenantId !== undefined) {
      updateData.currentTenantId = currentTenantId
        ? typeof currentTenantId === 'string' ? ObjectId.createFromHexString(currentTenantId) : currentTenantId
        : null;
    }

    await sessionsCollection.updateOne({ token: sessionToken, isActive: true }, { $set: updateData });
  } catch (error) {
    console.error('Error updating session activity:', error);
  }
}
