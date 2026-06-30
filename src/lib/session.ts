/**
 * Database-backed session management — mirrors construction-portal/lib/session.ts.
 * Creates 30-day sessions with device tracking, used alongside NextAuth JWT.
 */
import { getSessionsCollection, getTenantMembersCollection } from '@/lib/mongodb';
import { headers } from 'next/headers';
import { ObjectId } from 'mongodb';
import { randomBytes } from 'crypto';

function parseDeviceInfo(userAgent: string, ipAddress: string) {
  const ua = userAgent.toLowerCase();

  let deviceType: 'MOBILE' | 'WEB' = 'WEB';
  if (/(mobile|android|iphone|ipad|tablet)/i.test(userAgent)) deviceType = 'MOBILE';

  let browser: string | null = null;
  if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('safari')) browser = 'Safari';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('edge')) browser = 'Edge';

  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'MacOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  return { userAgent, ipAddress, deviceType, browser, os };
}

export async function getRequestInfo() {
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || 'Unknown';
  const forwarded = headersList.get('x-forwarded-for');
  const ipAddress = forwarded ? forwarded.split(',')[0].trim() : headersList.get('x-real-ip') || '0.0.0.0';
  return { userAgent, ipAddress };
}

export async function createDatabaseSession(
  userId: ObjectId | string,
  userAgent?: string,
  ipAddress?: string,
  currentTenantId?: string | ObjectId | null,
) {
  const sessionsCollection = await getSessionsCollection();

  if (!userAgent || !ipAddress) {
    const requestInfo = await getRequestInfo();
    userAgent = userAgent || requestInfo.userAgent;
    ipAddress = ipAddress || requestInfo.ipAddress;
  }

  const userObjectId = typeof userId === 'string' ? ObjectId.createFromHexString(userId) : userId;
  const tenantObjectId = currentTenantId
    ? typeof currentTenantId === 'string' ? ObjectId.createFromHexString(currentTenantId) : currentTenantId
    : null;

  const sessionToken = randomBytes(32).toString('hex');
  const deviceInfo = parseDeviceInfo(userAgent, ipAddress);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  const now = new Date();

  const sessionDoc: Record<string, unknown> = {
    userId: userObjectId,
    token: sessionToken,
    deviceInfo,
    isActive: true,
    lastActivityAt: now,
    expiresAt,
    createdAt: now,
  };
  if (tenantObjectId) sessionDoc.currentTenantId = tenantObjectId;

  await sessionsCollection.insertOne(sessionDoc);
  return sessionToken;
}

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

export async function validateSession(sessionToken: string): Promise<boolean> {
  try {
    const sessionsCollection = await getSessionsCollection();
    const session = await sessionsCollection.findOne({ token: sessionToken, isActive: true });
    if (!session) return false;
    if (new Date() > new Date(session.expiresAt)) {
      await sessionsCollection.updateOne({ token: sessionToken }, { $set: { isActive: false } });
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error validating session:', error);
    return false;
  }
}

export async function invalidateSession(sessionToken: string) {
  try {
    const sessionsCollection = await getSessionsCollection();
    await sessionsCollection.updateOne({ token: sessionToken }, { $set: { isActive: false } });
  } catch (error) {
    console.error('Error invalidating session:', error);
  }
}

export async function invalidateAllUserSessions(userId: string | ObjectId) {
  try {
    const sessionsCollection = await getSessionsCollection();
    const userObjectId = typeof userId === 'string' ? ObjectId.createFromHexString(userId) : userId;
    const result = await sessionsCollection.updateMany({ userId: userObjectId, isActive: true }, { $set: { isActive: false } });
    return result.modifiedCount;
  } catch (error) {
    console.error('Error invalidating all user sessions:', error);
    return 0;
  }
}

export async function cleanupExpiredSessions() {
  try {
    const sessionsCollection = await getSessionsCollection();
    const result = await sessionsCollection.updateMany(
      { expiresAt: { $lt: new Date() }, isActive: true },
      { $set: { isActive: false } },
    );
    return result.modifiedCount;
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
    return 0;
  }
}
