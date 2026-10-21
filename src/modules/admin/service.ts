import {
  Company,
  CreateCompanyInput,
  UpdateCompanyInput,
  Branch,
  CreateBranchInput,
  UpdateBranchInput,
  CompanyMembership,
  CreateMembershipInput,
  UpdateMembershipInput,
  UserProfile,
  AuditLogEntry,
  AuthContext,
  ValidationError,
  SystemRoleId
} from './types.ts';
import { hasPermission, canAssignRole, LEAST_PRIVILEGE_DEFAULT_ROLE } from './permissions.ts';

export class AdminServiceError extends Error {
  constructor(message: string, public code: string, public status: number = 400) {
    super(message);
    this.name = 'AdminServiceError';
  }
}

export class TenantIsolationError extends AdminServiceError {
  constructor(message: string = 'Cross-tenant boundary violation: Access denied to foreign company resource.') {
    super(message, 'CROSS_TENANT_ACCESS_DENIED', 403);
    this.name = 'TenantIsolationError';
  }
}

export class UnauthorizedError extends AdminServiceError {
  constructor(message: string = 'Unauthorized: Caller lacks the required administrative permission.') {
    super(message, 'PERMISSION_DENIED', 403);
    this.name = 'UnauthorizedError';
  }
}

export class UnauthenticatedError extends AdminServiceError {
  constructor(message: string = 'Unauthenticated: Valid authentication context is required.') {
    super(message, 'UNAUTHENTICATED', 401);
    this.name = 'UnauthenticatedError';
  }
}

// In-Memory Enterprise Storage (Decoupled, multi-tenant capable, PostgreSQL-ready)
class AdminStore {
  private companies: Map<string, Company> = new Map();
  private branches: Map<string, Branch> = new Map();
  private userProfiles: Map<string, UserProfile> = new Map();
  private memberships: Map<string, CompanyMembership> = new Map();
  private auditLogs: AuditLogEntry[] = [];

  constructor() {
    this.seedInitialEnterpriseState();
  }

  private seedInitialEnterpriseState() {
    // Initial Verified Company Profile (ERPThrive Foundation Anchor)
    const anchorCompany: Company = {
      id: 'cmp-001-global',
      legalName: 'ERPThrive Enterprise Global Holdings LLC',
      displayName: 'ERPThrive Global',
      country: 'US',
      baseCurrency: 'USD',
      timezone: 'UTC',
      fiscalYearStart: '01-01',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.companies.set(anchorCompany.id, anchorCompany);

    // Initial Primary Headquarters Branch
    const hqBranch: Branch = {
      id: 'brn-001-hq',
      companyId: anchorCompany.id,
      name: 'Global Operations Headquarters',
      code: 'HQ-GLOBAL',
      isHeadquarters: true,
      status: 'active',
      address: 'One Innovation Tower, Enterprise Way',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.branches.set(hqBranch.id, hqBranch);

    // Initial User Profiles
    const adminUser: UserProfile = {
      id: 'usr-admin-01',
      email: 'admin@erpthrive.internal',
      fullName: 'System Administrator',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.userProfiles.set(adminUser.id, adminUser);

    const staffUser: UserProfile = {
      id: 'usr-staff-01',
      email: 'clerk@erpthrive.internal',
      fullName: 'Operations Clerk',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.userProfiles.set(staffUser.id, staffUser);

    // Initial Memberships
    this.memberships.set('mem-01', {
      id: 'mem-01',
      companyId: anchorCompany.id,
      userId: adminUser.id,
      roleId: 'COMPANY_ADMIN',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    this.memberships.set('mem-02', {
      id: 'mem-02',
      companyId: anchorCompany.id,
      userId: staffUser.id,
      roleId: 'STAFF_USER', // Least-privilege default
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Record initial enterprise anchor audit log
    this.recordAuditLog(
      anchorCompany.id,
      adminUser.id,
      adminUser.email,
      'company.create',
      'company',
      anchorCompany.id,
      { legalName: anchorCompany.legalName, country: anchorCompany.country, currency: anchorCompany.baseCurrency }
    );
  }

  // Helper to record immutable audit log
  public recordAuditLog(
    companyId: string | null,
    actorId: string,
    actorEmail: string,
    action: AuditLogEntry['action'],
    targetType: AuditLogEntry['targetType'],
    targetId: string,
    details: Record<string, unknown>
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      companyId,
      actorId,
      actorEmail,
      action,
      targetType,
      targetId,
      details,
      createdAt: new Date().toISOString()
    };
    // Append-only constraint: cannot mutate previous entries
    this.auditLogs.unshift(Object.freeze({ ...entry }));
    return entry;
  }

  // ---------------------------------------------------------------------------
  // COMPANY OPERATIONS
  // ---------------------------------------------------------------------------
  public getCompany(auth: AuthContext, companyId: string): Company {
    this.assertAuthenticated(auth);
    this.assertTenantAccess(auth, companyId);
    this.assertPermission(auth, 'admin:company:read');

    const company = this.companies.get(companyId);
    if (!company) {
      throw new AdminServiceError('Company not found', 'COMPANY_NOT_FOUND', 404);
    }
    return company;
  }

  public getAllCompanies(auth: AuthContext): Company[] {
    this.assertAuthenticated(auth);
    // Super admins can view all companies; others only their authorized active company
    if (auth.roleId === 'SUPER_ADMIN') {
      return Array.from(this.companies.values());
    }
    const company = this.companies.get(auth.activeCompanyId);
    return company ? [company] : [];
  }

  public createCompany(auth: AuthContext, input: CreateCompanyInput): Company {
    this.assertAuthenticated(auth);
    this.assertPermission(auth, 'admin:company:create');

    this.validateCompanyInput(input);

    // Prevent duplicate company legal names
    const duplicate = Array.from(this.companies.values()).find(
      (c) => c.legalName.trim().toLowerCase() === input.legalName.trim().toLowerCase()
    );
    if (duplicate) {
      throw new AdminServiceError(
        `A company with legal name "${input.legalName.trim()}" already exists.`,
        'DUPLICATE_COMPANY_NAME',
        409
      );
    }

    const companyId = `cmp-${Date.now().toString(36)}`;
    const newCompany: Company = {
      id: companyId,
      legalName: input.legalName.trim(),
      displayName: input.displayName.trim(),
      country: input.country.toUpperCase().trim(),
      baseCurrency: input.baseCurrency.toUpperCase().trim(),
      timezone: input.timezone.trim(),
      fiscalYearStart: input.fiscalYearStart || '01-01',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.companies.set(companyId, newCompany);

    this.recordAuditLog(
      companyId,
      auth.userId,
      auth.email,
      'company.create',
      'company',
      companyId,
      { legalName: newCompany.legalName, country: newCompany.country, currency: newCompany.baseCurrency }
    );

    return newCompany;
  }

  public updateCompany(auth: AuthContext, companyId: string, input: UpdateCompanyInput): Company {
    this.assertAuthenticated(auth);
    this.assertTenantAccess(auth, companyId);
    this.assertPermission(auth, 'admin:company:update');

    const existing = this.companies.get(companyId);
    if (!existing) {
      throw new AdminServiceError('Company not found', 'COMPANY_NOT_FOUND', 404);
    }

    if (input.legalName && input.legalName.trim().toLowerCase() !== existing.legalName.toLowerCase()) {
      const duplicate = Array.from(this.companies.values()).find(
        (c) => c.id !== companyId && c.legalName.trim().toLowerCase() === input.legalName!.trim().toLowerCase()
      );
      if (duplicate) {
        throw new AdminServiceError(
          `Another company with legal name "${input.legalName.trim()}" already exists.`,
          'DUPLICATE_COMPANY_NAME',
          409
        );
      }
    }

    const updated: Company = {
      ...existing,
      legalName: input.legalName ? input.legalName.trim() : existing.legalName,
      displayName: input.displayName ? input.displayName.trim() : existing.displayName,
      country: input.country ? input.country.toUpperCase().trim() : existing.country,
      baseCurrency: input.baseCurrency ? input.baseCurrency.toUpperCase().trim() : existing.baseCurrency,
      timezone: input.timezone ? input.timezone.trim() : existing.timezone,
      fiscalYearStart: input.fiscalYearStart ? input.fiscalYearStart.trim() : existing.fiscalYearStart,
      status: input.status || existing.status,
      updatedAt: new Date().toISOString()
    };

    this.validateCompanyInput(updated);
    this.companies.set(companyId, updated);

    this.recordAuditLog(
      companyId,
      auth.userId,
      auth.email,
      'company.update',
      'company',
      companyId,
      { changes: input }
    );

    return updated;
  }

  public deactivateCompany(auth: AuthContext, companyId: string): Company {
    this.assertAuthenticated(auth);
    this.assertTenantAccess(auth, companyId);
    this.assertPermission(auth, 'admin:company:deactivate');

    const existing = this.companies.get(companyId);
    if (!existing) {
      throw new AdminServiceError('Company not found', 'COMPANY_NOT_FOUND', 404);
    }

    const deactivated: Company = {
      ...existing,
      status: 'inactive',
      updatedAt: new Date().toISOString()
    };
    this.companies.set(companyId, deactivated);

    this.recordAuditLog(
      companyId,
      auth.userId,
      auth.email,
      'company.deactivate',
      'company',
      companyId,
      { previousStatus: existing.status, newStatus: 'inactive' }
    );

    return deactivated;
  }

  // ---------------------------------------------------------------------------
  // BRANCH OPERATIONS (Multi-Tenant Enforced)
  // ---------------------------------------------------------------------------
  public getBranchesForCompany(auth: AuthContext, companyId: string): Branch[] {
    this.assertAuthenticated(auth);
    this.assertTenantAccess(auth, companyId);
    this.assertPermission(auth, 'admin:branch:read');

    return Array.from(this.branches.values()).filter((b) => b.companyId === companyId);
  }

  public createBranch(auth: AuthContext, input: CreateBranchInput): Branch {
    this.assertAuthenticated(auth);
    this.assertTenantAccess(auth, input.companyId);
    this.assertPermission(auth, 'admin:branch:create');

    this.validateBranchInput(input);

    // Verify company exists and is active
    const company = this.companies.get(input.companyId);
    if (!company) {
      throw new AdminServiceError('Referenced company does not exist', 'COMPANY_NOT_FOUND', 404);
    }
    if (company.status !== 'active') {
      throw new AdminServiceError('Cannot create branches for an inactive company', 'COMPANY_INACTIVE', 400);
    }

    // Verify unique branch code within the same company
    const existingCode = Array.from(this.branches.values()).find(
      (b) => b.companyId === input.companyId && b.code.trim().toUpperCase() === input.code.trim().toUpperCase()
    );
    if (existingCode) {
      throw new AdminServiceError(
        `Branch code "${input.code.trim().toUpperCase()}" already exists for this company.`,
        'DUPLICATE_BRANCH_CODE',
        409
      );
    }

    const branchId = `brn-${Date.now().toString(36)}`;
    const newBranch: Branch = {
      id: branchId,
      companyId: input.companyId,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      isHeadquarters: Boolean(input.isHeadquarters),
      status: 'active',
      address: input.address?.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.branches.set(branchId, newBranch);

    this.recordAuditLog(
      input.companyId,
      auth.userId,
      auth.email,
      'branch.create',
      'branch',
      branchId,
      { name: newBranch.name, code: newBranch.code, isHeadquarters: newBranch.isHeadquarters }
    );

    return newBranch;
  }

  public updateBranch(auth: AuthContext, branchId: string, input: UpdateBranchInput): Branch {
    this.assertAuthenticated(auth);

    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new AdminServiceError('Branch not found', 'BRANCH_NOT_FOUND', 404);
    }

    // Enforce tenant boundary: user cannot access branch of another company
    this.assertTenantAccess(auth, branch.companyId);
    this.assertPermission(auth, 'admin:branch:update');

    if (input.code && input.code.trim().toUpperCase() !== branch.code) {
      const duplicate = Array.from(this.branches.values()).find(
        (b) => b.companyId === branch.companyId && b.id !== branchId && b.code === input.code!.trim().toUpperCase()
      );
      if (duplicate) {
        throw new AdminServiceError(
          `Branch code "${input.code.trim().toUpperCase()}" is already used by another branch in this company.`,
          'DUPLICATE_BRANCH_CODE',
          409
        );
      }
    }

    const updated: Branch = {
      ...branch,
      name: input.name ? input.name.trim() : branch.name,
      code: input.code ? input.code.trim().toUpperCase() : branch.code,
      isHeadquarters: input.isHeadquarters !== undefined ? input.isHeadquarters : branch.isHeadquarters,
      status: input.status || branch.status,
      address: input.address !== undefined ? input.address.trim() : branch.address,
      updatedAt: new Date().toISOString()
    };

    if (updated.name.length < 2) {
      throw new AdminServiceError('Branch name must be at least 2 characters.', 'INVALID_BRANCH_NAME', 400);
    }

    this.branches.set(branchId, updated);

    this.recordAuditLog(
      branch.companyId,
      auth.userId,
      auth.email,
      'branch.update',
      'branch',
      branchId,
      { changes: input }
    );

    return updated;
  }

  public deactivateBranch(auth: AuthContext, branchId: string): Branch {
    this.assertAuthenticated(auth);

    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new AdminServiceError('Branch not found', 'BRANCH_NOT_FOUND', 404);
    }

    this.assertTenantAccess(auth, branch.companyId);
    this.assertPermission(auth, 'admin:branch:deactivate');

    if (branch.isHeadquarters) {
      throw new AdminServiceError(
        'Cannot deactivate primary headquarters branch without assigning a replacement headquarters.',
        'HEADQUARTERS_DEACTIVATION_BLOCKED',
        400
      );
    }

    const updated: Branch = {
      ...branch,
      status: 'inactive',
      updatedAt: new Date().toISOString()
    };
    this.branches.set(branchId, updated);

    this.recordAuditLog(
      branch.companyId,
      auth.userId,
      auth.email,
      'branch.deactivate',
      'branch',
      branchId,
      { code: branch.code, previousStatus: branch.status, newStatus: 'inactive' }
    );

    return updated;
  }

  // ---------------------------------------------------------------------------
  // MEMBERSHIP & ROLE OPERATIONS
  // ---------------------------------------------------------------------------
  public getCompanyMemberships(auth: AuthContext, companyId: string): CompanyMembership[] {
    this.assertAuthenticated(auth);
    this.assertTenantAccess(auth, companyId);
    this.assertPermission(auth, 'admin:user:read');

    const list = Array.from(this.memberships.values()).filter((m) => m.companyId === companyId);
    return list.map((m) => ({
      ...m,
      user: this.userProfiles.get(m.userId)
    }));
  }

  public inviteMember(auth: AuthContext, input: CreateMembershipInput): CompanyMembership {
    this.assertAuthenticated(auth);
    this.assertTenantAccess(auth, input.companyId);
    this.assertPermission(auth, 'admin:user:create');

    const email = input.email.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new AdminServiceError('A valid email address is required.', 'INVALID_EMAIL', 400);
    }
    if (!input.fullName || input.fullName.trim().length < 2) {
      throw new AdminServiceError('Full name must be at least 2 characters.', 'INVALID_NAME', 400);
    }

    // Role privilege check: Cannot grant role higher than caller's hierarchy level
    if (!canAssignRole(auth.roleId, input.roleId)) {
      throw new UnauthorizedError(
        `Caller holding role ${auth.roleId} is not permitted to assign privileged role ${input.roleId}.`
      );
    }

    // Find or create user profile
    let user = Array.from(this.userProfiles.values()).find((u) => u.email === email);
    if (!user) {
      const newUserId = `usr-${Date.now().toString(36)}`;
      user = {
        id: newUserId,
        email,
        fullName: input.fullName.trim(),
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.userProfiles.set(newUserId, user);
    }

    // Check existing membership in this company
    const existingMembership = Array.from(this.memberships.values()).find(
      (m) => m.companyId === input.companyId && m.userId === user!.id
    );
    if (existingMembership) {
      throw new AdminServiceError(
        `User ${email} already holds membership in this company.`,
        'DUPLICATE_MEMBERSHIP',
        409
      );
    }

    const membershipId = `mem-${Date.now().toString(36)}`;
    const newMembership: CompanyMembership = {
      id: membershipId,
      companyId: input.companyId,
      userId: user.id,
      roleId: input.roleId || LEAST_PRIVILEGE_DEFAULT_ROLE,
      status: 'active',
      user,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.memberships.set(membershipId, newMembership);

    this.recordAuditLog(
      input.companyId,
      auth.userId,
      auth.email,
      'user.invite',
      'membership',
      membershipId,
      { invitedEmail: email, assignedRole: newMembership.roleId }
    );

    return newMembership;
  }

  public updateMembership(
    auth: AuthContext,
    membershipId: string,
    input: UpdateMembershipInput
  ): CompanyMembership {
    this.assertAuthenticated(auth);

    const membership = this.memberships.get(membershipId);
    if (!membership) {
      throw new AdminServiceError('Membership not found', 'MEMBERSHIP_NOT_FOUND', 404);
    }

    this.assertTenantAccess(auth, membership.companyId);
    this.assertPermission(auth, 'admin:user:update');

    // Prevent privilege self-escalation
    if (membership.userId === auth.userId && input.roleId && input.roleId !== membership.roleId) {
      throw new UnauthorizedError('Users cannot alter or escalate their own role assignment.');
    }

    if (input.roleId && !canAssignRole(auth.roleId, input.roleId)) {
      throw new UnauthorizedError(`Caller cannot assign role ${input.roleId}.`);
    }

    const updated: CompanyMembership = {
      ...membership,
      roleId: input.roleId || membership.roleId,
      status: input.status || membership.status,
      updatedAt: new Date().toISOString(),
      user: this.userProfiles.get(membership.userId)
    };
    this.memberships.set(membershipId, updated);

    if (input.roleId && input.roleId !== membership.roleId) {
      this.recordAuditLog(
        membership.companyId,
        auth.userId,
        auth.email,
        'user.role_change',
        'membership',
        membershipId,
        { previousRole: membership.roleId, newRole: input.roleId, targetUserId: membership.userId }
      );
    }

    if (input.status && input.status !== membership.status) {
      this.recordAuditLog(
        membership.companyId,
        auth.userId,
        auth.email,
        'user.status_change',
        'membership',
        membershipId,
        { previousStatus: membership.status, newStatus: input.status, targetUserId: membership.userId }
      );
    }

    return updated;
  }

  // ---------------------------------------------------------------------------
  // AUDIT LOGS
  // ---------------------------------------------------------------------------
  public getAuditLogs(auth: AuthContext, companyId: string): AuditLogEntry[] {
    this.assertAuthenticated(auth);
    this.assertTenantAccess(auth, companyId);
    this.assertPermission(auth, 'admin:audit:read');

    return this.auditLogs.filter((log) => log.companyId === companyId);
  }

  // ---------------------------------------------------------------------------
  // SECURITY & VALIDATION GUARDS
  // ---------------------------------------------------------------------------
  private assertAuthenticated(auth: AuthContext | null | undefined): asserts auth is AuthContext {
    if (!auth || !auth.userId || !auth.activeCompanyId) {
      throw new UnauthenticatedError();
    }
  }

  private assertTenantAccess(auth: AuthContext, targetCompanyId: string) {
    if (auth.roleId === 'SUPER_ADMIN') return;
    if (auth.activeCompanyId !== targetCompanyId) {
      this.recordAuditLog(
        auth.activeCompanyId,
        auth.userId,
        auth.email,
        'security.access_denied',
        'company',
        targetCompanyId,
        { attempt: 'cross_tenant_access', targetCompanyId }
      );
      throw new TenantIsolationError(
        `Cross-tenant violation: Caller authorized for company "${auth.activeCompanyId}" cannot access foreign company "${targetCompanyId}".`
      );
    }
  }

  private assertPermission(auth: AuthContext, permission: string) {
    if (!hasPermission(auth.roleId, permission)) {
      this.recordAuditLog(
        auth.activeCompanyId,
        auth.userId,
        auth.email,
        'security.access_denied',
        'company',
        auth.activeCompanyId,
        { attemptedPermission: permission, roleId: auth.roleId }
      );
      throw new UnauthorizedError(
        `Forbidden: Role ${auth.roleId} lacks the required permission "${permission}".`
      );
    }
  }

  private validateCompanyInput(input: Partial<CreateCompanyInput>) {
    const errors: ValidationError[] = [];

    if (!input.legalName || input.legalName.trim().length < 3) {
      errors.push({ field: 'legalName', message: 'Legal company name must be at least 3 characters.' });
    }
    if (!input.displayName || input.displayName.trim().length < 2) {
      errors.push({ field: 'displayName', message: 'Display name must be at least 2 characters.' });
    }
    if (!input.country || input.country.trim().length !== 2) {
      errors.push({ field: 'country', message: 'Country must be a valid 2-letter ISO 3166-1 alpha-2 code.' });
    }
    if (!input.baseCurrency || input.baseCurrency.trim().length !== 3) {
      errors.push({ field: 'baseCurrency', message: 'Currency must be a valid 3-letter ISO 4217 code (e.g. USD, EUR, GBP).' });
    }
    if (!input.timezone || input.timezone.trim().length < 3) {
      errors.push({ field: 'timezone', message: 'Timezone identifier is required (e.g. UTC, America/New_York).' });
    }

    if (errors.length > 0) {
      throw new AdminServiceError(
        `Company validation failed: ${errors.map((e) => e.message).join(' ')}`,
        'VALIDATION_FAILED',
        400
      );
    }
  }

  private validateBranchInput(input: CreateBranchInput) {
    const errors: ValidationError[] = [];

    if (!input.name || input.name.trim().length < 2) {
      errors.push({ field: 'name', message: 'Branch name must be at least 2 characters.' });
    }
    if (!input.code || input.code.trim().length < 2) {
      errors.push({ field: 'code', message: 'Branch code must be at least 2 alphanumeric characters.' });
    }
    if (!input.companyId) {
      errors.push({ field: 'companyId', message: 'Branch must be linked to a valid authorized company.' });
    }

    if (errors.length > 0) {
      throw new AdminServiceError(
        `Branch validation failed: ${errors.map((e) => e.message).join(' ')}`,
        'VALIDATION_FAILED',
        400
      );
    }
  }
}

// Singleton service instance for trusted domain operations
export const adminService = new AdminStore();
