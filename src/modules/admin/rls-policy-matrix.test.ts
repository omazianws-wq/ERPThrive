import test from 'node:test';
import assert from 'node:assert/strict';
import { adminService, TenantIsolationError, UnauthorizedError, UnauthenticatedError } from './service.ts';
import { AuthContext } from './types.ts';
import { canAssignRole, SYSTEM_ROLES } from './permissions.ts';

// Test Actors
const unauthenticatedAuth: AuthContext | null = null;

const userWithNoCompanyAuth: AuthContext = {
  userId: 'usr-unassigned-01',
  email: 'unassigned@external.internal',
  activeCompanyId: '',
  roleId: 'STAFF_USER'
};

const companyAdminAuth: AuthContext = {
  userId: 'usr-admin-01',
  email: 'admin@erpthrive.internal',
  activeCompanyId: 'cmp-001-global',
  roleId: 'COMPANY_ADMIN'
};

const staffAuth: AuthContext = {
  userId: 'usr-staff-01',
  email: 'clerk@erpthrive.internal',
  activeCompanyId: 'cmp-001-global',
  roleId: 'STAFF_USER'
};

const foreignCompanyAdminAuth: AuthContext = {
  userId: 'usr-foreign-01',
  email: 'foreign@othercorp.internal',
  activeCompanyId: 'cmp-999-foreign',
  roleId: 'COMPANY_ADMIN'
};

// =============================================================================
// RLS & ACCESS CONTROL POLICY MATRIX VERIFICATION TESTS
// These tests correspond directly to the database RLS policies defined in
// supabase/migrations/20261021000001_fix_rls_recursion_company_memberships.sql
// =============================================================================

test('1. Unauthenticated requests are rejected immediately across all tenant resources', () => {
  // Company access rejected
  assert.throws(
    () => {
      // @ts-expect-error Testing null auth context
      adminService.getCompany(unauthenticatedAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof UnauthenticatedError
  );

  // Branch access rejected
  assert.throws(
    () => {
      // @ts-expect-error Testing null auth context
      adminService.getBranchesForCompany(unauthenticatedAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof UnauthenticatedError
  );

  // Audit log access rejected
  assert.throws(
    () => {
      // @ts-expect-error Testing null auth context
      adminService.getAuditLogs(unauthenticatedAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof UnauthenticatedError
  );

  // Membership access rejected
  assert.throws(
    () => {
      // @ts-expect-error Testing null auth context
      adminService.getCompanyMemberships(unauthenticatedAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof UnauthenticatedError
  );
});

test('2. Authenticated user with no company membership cannot access tenant data', () => {
  // Attempting to access company without active membership
  assert.throws(
    () => {
      adminService.getCompany(userWithNoCompanyAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof TenantIsolationError || err instanceof UnauthenticatedError
  );

  assert.throws(
    () => {
      adminService.getBranchesForCompany(userWithNoCompanyAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof TenantIsolationError || err instanceof UnauthenticatedError
  );

  assert.throws(
    () => {
      adminService.getAuditLogs(userWithNoCompanyAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof TenantIsolationError || err instanceof UnauthenticatedError
  );
});

test('3. Authorized member can access their own authorized company records', () => {
  // Company Admin accessing authorized company
  const company = adminService.getCompany(companyAdminAuth, 'cmp-001-global');
  assert.equal(company.id, 'cmp-001-global');
  assert.equal(company.status, 'active');

  // Staff user accessing authorized company
  const staffCompany = adminService.getCompany(staffAuth, 'cmp-001-global');
  assert.equal(staffCompany.id, 'cmp-001-global');

  // Authorized branches access
  const branches = adminService.getBranchesForCompany(companyAdminAuth, 'cmp-001-global');
  assert.ok(branches.length > 0);
  assert.equal(branches[0].companyId, 'cmp-001-global');
});

test('4. Cross-tenant isolation: User cannot access or mutate foreign company records', () => {
  // Foreign user querying company
  assert.throws(
    () => {
      adminService.getCompany(foreignCompanyAdminAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof TenantIsolationError
  );

  // Foreign user querying branches
  assert.throws(
    () => {
      adminService.getBranchesForCompany(foreignCompanyAdminAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof TenantIsolationError
  );

  // Foreign user querying audit logs
  assert.throws(
    () => {
      adminService.getAuditLogs(foreignCompanyAdminAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof TenantIsolationError
  );

  // Foreign user creating a branch in foreign company
  assert.throws(
    () => {
      adminService.createBranch(foreignCompanyAdminAuth, {
        companyId: 'cmp-001-global',
        name: 'Injected Branch',
        code: 'INJECT-01'
      });
    },
    (err: unknown) => err instanceof TenantIsolationError
  );
});

test('5. Branch and audit-log isolation: Fine-grained permissions enforced', () => {
  // Staff user can read authorized branches
  const staffBranches = adminService.getBranchesForCompany(staffAuth, 'cmp-001-global');
  assert.ok(Array.isArray(staffBranches));

  // Staff user CANNOT create a branch (lacks admin:branch:create)
  assert.throws(
    () => {
      adminService.createBranch(staffAuth, {
        companyId: 'cmp-001-global',
        name: 'Staff Unauthorized Branch',
        code: 'STF-01'
      });
    },
    (err: unknown) => err instanceof UnauthorizedError
  );

  // Staff user CANNOT read audit logs (lacks admin:audit:read)
  assert.throws(
    () => {
      adminService.getAuditLogs(staffAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof UnauthorizedError
  );

  // Company Admin CAN read audit logs
  const adminLogs = adminService.getAuditLogs(companyAdminAuth, 'cmp-001-global');
  assert.ok(Array.isArray(adminLogs));
});

test('6. Anti-privilege escalation: Users cannot modify their own role or assign higher roles', () => {
  // 6.1 Users cannot alter their own membership
  const memberships = adminService.getCompanyMemberships(companyAdminAuth, 'cmp-001-global');
  const callerMembership = memberships.find((m) => m.userId === companyAdminAuth.userId);
  assert.ok(callerMembership, 'Caller membership must exist');

  assert.throws(
    () => {
      adminService.updateMembership(companyAdminAuth, callerMembership.id, {
        roleId: 'SUPER_ADMIN'
      });
    },
    /Users cannot alter or escalate their own role/
  );

  // 6.1b Users cannot alter own membership even without role change
  assert.throws(
    () => {
      adminService.updateMembership(companyAdminAuth, callerMembership.id, {
        status: 'deactivated'
      });
    },
    /Users cannot alter or escalate their own role/
  );

  // 6.2 Admins cannot assign a role with equal or higher hierarchy than their own
  const callerHierarchy = SYSTEM_ROLES[companyAdminAuth.roleId].hierarchyLevel; // 80 for COMPANY_ADMIN
  const superAdminHierarchy = SYSTEM_ROLES['SUPER_ADMIN'].hierarchyLevel; // 100

  assert.ok(superAdminHierarchy > callerHierarchy);
  // COMPANY_ADMIN cannot assign SUPER_ADMIN
  assert.equal(canAssignRole('COMPANY_ADMIN', 'SUPER_ADMIN'), false);
  // COMPANY_ADMIN cannot assign peer COMPANY_ADMIN (anti-privilege escalation)
  assert.equal(canAssignRole('COMPANY_ADMIN', 'COMPANY_ADMIN'), false);
  // COMPANY_ADMIN can assign strictly lower roles (Operations, Staff)
  assert.equal(canAssignRole('COMPANY_ADMIN', 'OPERATIONS_MANAGER'), true);
  assert.equal(canAssignRole('COMPANY_ADMIN', 'STAFF_USER'), true);

  // SUPER_ADMIN can assign any tenant role, but cannot assign SUPER_ADMIN via membership management
  assert.equal(canAssignRole('SUPER_ADMIN', 'SUPER_ADMIN'), false);
  assert.equal(canAssignRole('SUPER_ADMIN', 'COMPANY_ADMIN'), true);
  assert.equal(canAssignRole('SUPER_ADMIN', 'OPERATIONS_MANAGER'), true);
  assert.equal(canAssignRole('SUPER_ADMIN', 'STAFF_USER'), true);
});

test('7. Profile roster visibility: Authorized administrators can inspect company member profiles', () => {
  // Company Admin can retrieve memberships with populated user profiles for their company
  const memberships = adminService.getCompanyMemberships(companyAdminAuth, 'cmp-001-global');
  assert.ok(memberships.length > 0);

  // Each membership includes user display details required by the admin console
  for (const m of memberships) {
    assert.ok(m.user, 'Member profile must be resolved');
    assert.ok(m.user.email, 'Member email must be present for admin display');
    assert.ok(m.user.fullName, 'Member full name must be present for admin display');
  }

  // Cross-tenant: Staff user or foreign user cannot access company memberships
  assert.throws(
    () => {
      adminService.getCompanyMemberships(staffAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof UnauthorizedError
  );

  assert.throws(
    () => {
      adminService.getCompanyMemberships(foreignCompanyAdminAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof TenantIsolationError
  );
});

test('8. Role assignment matrix: Exhaustive role assignment & hierarchy boundaries', () => {
  // Staff user (level 10) cannot assign any role
  assert.equal(canAssignRole('STAFF_USER', 'STAFF_USER'), false);
  assert.equal(canAssignRole('STAFF_USER', 'OPERATIONS_MANAGER'), false);
  assert.equal(canAssignRole('STAFF_USER', 'COMPANY_ADMIN'), false);
  assert.equal(canAssignRole('STAFF_USER', 'SUPER_ADMIN'), false);

  // Operations Manager (level 50) cannot assign any role (requires level 80)
  assert.equal(canAssignRole('OPERATIONS_MANAGER', 'STAFF_USER'), false);
  assert.equal(canAssignRole('OPERATIONS_MANAGER', 'OPERATIONS_MANAGER'), false);

  // Company Admin (level 80) can only assign strictly lower roles
  assert.equal(canAssignRole('COMPANY_ADMIN', 'STAFF_USER'), true);
  assert.equal(canAssignRole('COMPANY_ADMIN', 'OPERATIONS_MANAGER'), true);
  assert.equal(canAssignRole('COMPANY_ADMIN', 'COMPANY_ADMIN'), false);
  assert.equal(canAssignRole('COMPANY_ADMIN', 'SUPER_ADMIN'), false);

  // Super Admin can assign all tenant roles, but cannot assign SUPER_ADMIN via company memberships
  assert.equal(canAssignRole('SUPER_ADMIN', 'STAFF_USER'), true);
  assert.equal(canAssignRole('SUPER_ADMIN', 'OPERATIONS_MANAGER'), true);
  assert.equal(canAssignRole('SUPER_ADMIN', 'COMPANY_ADMIN'), true);
  assert.equal(canAssignRole('SUPER_ADMIN', 'SUPER_ADMIN'), false);
});

