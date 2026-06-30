export interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber?: string;
  roleId?: string;
  roleName?: string;
  isActive: boolean;
  portalUser: boolean;
  createdAt: string;
}

export interface RoleOption {
  id: string;
  name: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
