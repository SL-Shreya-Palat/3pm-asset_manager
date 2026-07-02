/**
 * Auth types — mirrors construction-portal types/auth/types.ts.
 * Used by controllers, API routes, and auth helpers.
 */

/** Input for requesting an OTP email. */
export interface RequestOTPInput {
  email: string;
}

/** Input for sign-in via email OTP (NextAuth credentials provider). */
export interface SignInInput {
  email: string;
  otp: string;
}

/** Input for sign-up (new user registration via OTP). */
export interface SignUpInput {
  email: string;
  otp: string;
  firstName: string;
  lastName: string;
}

/** Auth response shape for mobile endpoints. */
export interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
  sessionToken: string;
  tenantId: string | null;
}

/** Resolved auth context available in every route handler. */
export interface AuthContext {
  id: string;
  email: string;
  name: string | null | undefined;
  image: string | null | undefined;
  sessionToken: string | undefined;
  currentTenantId: string | null;
}

/** User profile returned by getUserProfile(). */
export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phoneNumber: string | null;
  profileImageUrl: string | null;
  address: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | null;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: Date;
  tenant: {
    id: string;
    name: string;
    ownerId: string;
    logoUrl: string | null;
    isActive: boolean;
    roleName: string | null;
    permissions: unknown;
    isAdmin: boolean | null;
    isManager: boolean | null;
    isTeamManager: boolean | null;
    isMechanic: boolean | null;
    isDriver: boolean | null;
  } | null;
  workspaces: Array<{
    id: string;
    name: string;
    type: string;
    description: string;
    settings: Record<string, unknown>;
    tenantId: string | null;
    role: { id: string; name: string; permissions: unknown } | null;
    status: string;
    joinedAt: Date;
    lastAccessedAt: Date;
  }>;
}

/** Standard API response envelope (§9 of coding standards). */
export interface BaseResponse<T = unknown> {
  data: T | null;
  error: string | null;
}

/** Pagination shape returned by list endpoints. */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
