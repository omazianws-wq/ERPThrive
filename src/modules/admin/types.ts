/**
 * ERPThrive — Module 1: Administration & Identity Types
 */

export type CompanyStatus = 'active' | 'inactive' | 'suspended';
export type BranchStatus = 'active' | 'inactive';
export type UserStatus = 'active' | 'suspended' | 'deactivated';
export type MembershipStatus = 'active' | 'invited' | 'deactivated';

export interface Company {
  id: string;
  legalName: string;
  displayName: string;
  country: string; // ISO 3166-1 alpha-2
  baseCurrency: string; // ISO 4217
  timezone: string; // IANA timezone
  fiscalYearStart: string; // MM-DD
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyInput {
  legalName: string;
  displayName: string;
  country: string;
  baseCurrency: string;
  timezone: string;
  fiscalYearStart?: string;
}

export interface UpdateCompanyInput {
  legalName?: string;
  displayName?: string;
  country?: string;
  baseCurrency?: string;
  timezone?: string;
  fiscalYearStart?: string;
  status?: CompanyStatus;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  code: string;
  isHeadquarters: boolean;
  status: BranchStatus;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBranchInput {
  companyId: string;
  name: string;
  code: string;
  isHeadquarters?: boolean;
  address?: string;
}

export interface UpdateBranchInput {
  name?: string;
  code?: string;
  isHeadquarters?: boolean;
  status?: BranchStatus;
  address?: string;
}

export type SystemRoleId = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'OPERATIONS_MANAGER' | 'STAFF_USER';

export interface Role {
  id: SystemRoleId;
  name: string;
  description: string;
  isSystem: boolean;
  hierarchyLevel: number; // 100 for Super Admin, 80 for Company Admin, 50 for Ops Mgr, 10 for Staff
  permissions: string[];
}

export type PermissionAction = 'read' | 'create' | 'update' | 'deactivate' | 'admin';

export interface Permission {
  id: string;
  module: 'admin' | 'master_data' | 'finance' | 'procurement' | 'inventory';
  resource: 'company' | 'branch' | 'user' | 'role' | 'audit';
  action: PermissionAction;
  description: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyMembership {
  id: string;
  companyId: string;
  userId: string;
  roleId: SystemRoleId;
  status: MembershipStatus;
  user?: UserProfile;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMembershipInput {
  companyId: string;
  email: string;
  fullName: string;
  roleId: SystemRoleId;
}

export interface UpdateMembershipInput {
  roleId?: SystemRoleId;
  status?: MembershipStatus;
}

export type AuditAction =
  | 'company.create'
  | 'company.update'
  | 'company.deactivate'
  | 'branch.create'
  | 'branch.update'
  | 'branch.deactivate'
  | 'user.invite'
  | 'user.role_change'
  | 'user.status_change'
  | 'security.access_denied';

export type AuditTargetType = 'company' | 'branch' | 'user' | 'membership';

export interface AuditLogEntry {
  id: string;
  companyId: string | null;
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface AuthContext {
  userId: string;
  email: string;
  activeCompanyId: string;
  roleId: SystemRoleId;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface TableVerificationDetail {
  name: string;
  present: boolean;
  statusCode: number;
  rlsDetected: boolean;
  notes?: string;
}

export type MigrationVerificationStatus =
  | 'applied'
  | 'partially_applied'
  | 'pending'
  | 'unverified';

export interface DatabaseIntegrationStatus {
  provider: 'Supabase / PostgreSQL';
  status: 'connected' | 'pending_configuration';
  urlConfigured: boolean;
  anonKeyConfigured: boolean;
  clientAccessReady: boolean;
  clientConnected: boolean;
  allTablesPresent: boolean;
  tablesCount: number;
  expectedTablesCount: number;
  tablesChecked: TableVerificationDetail[];
  migrationVersion: string;
  migrationStatus: MigrationVerificationStatus;
  rlsPoliciesEnforced: boolean;
  serviceRoleConfigured?: boolean;
  message: string;
  securityNote: string;
}
