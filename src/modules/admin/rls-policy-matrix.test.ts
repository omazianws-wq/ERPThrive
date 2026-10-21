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

  // 6.2 Admins cannot assign a role with higher hierarchy than their own
  const callerHierarchy = SYSTEM_ROLES[companyAdminAuth.roleId].hierarchyLevel; // 80 for COMPANY_ADMIN
  const superAdminHierarchy = SYSTEM_ROLES['SUPER_ADMIN'].hierarchyLevel; // 100

  assert.ok(superAdminHierarchy > callerHierarchy);
  assert.equal(canAssignRole('COMPANY_ADMIN', 'SUPER_ADMIN'), false);

  // Can assign roles equal or lower in hierarchy (e.g. peer Company Admin, Operations, Staff)
  assert.equal(canAssignRole('COMPANY_ADMIN', 'COMPANY_ADMIN'), true);
  assert.equal(canAssignRole('COMPANY_ADMIN', 'OPERATIONS_MANAGER'), true);
  assert.equal(canAssignRole('COMPANY_ADMIN', 'STAFF_USER'), true);
});
