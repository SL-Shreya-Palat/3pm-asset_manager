export interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber?: string;
  roleId?: string;
  roleName?: string;
  isActive: boolean;
  /** 'pending' = invited, awaiting first login; 'active' = has logged in. */
  status?: string;
  portalUser: boolean;
  createdAt: string;
}

export interface RoleOption {
  id: string;
  name: string;
  /** When true, a user with this role only sees records for the teams they're
   *  placed on — so a team must be chosen at invite time. */
  teamScoped?: boolean;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
