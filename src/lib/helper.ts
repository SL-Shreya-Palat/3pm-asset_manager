/**
 * Generic helpers shared across the app.
 */
import { getTenantMembersCollection, getTenantsCollection } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/**
 * Get the current tenant ID for a user.
 * Priority: owned tenant -> first active membership.
 */
export async function getCurrentTenantId(userId: string): Promise<string | null> {
  try {
    const tenantMembersCollection = await getTenantMembersCollection();
    const tenantsCollection = await getTenantsCollection();
    const userObjectId = ObjectId.createFromHexString(userId);

    // 1. Look for a tenant the user owns
    const ownedTenant = await tenantsCollection.findOne({ ownerId: userObjectId, isActive: true });
    if (ownedTenant) return ownedTenant._id.toString();

    // 2. Fallback to first active tenant membership
    const tenantMember = await tenantMembersCollection.findOne({
      userId: userObjectId,
      portalUser: true,
      isActive: true,
    }, { sort: { createdAt: 1 } });

    return tenantMember?.tenantId?.toString() ?? null;
  } catch (error) {
    console.error('Error getting current tenant ID:', error);
    return null;
  }
}
