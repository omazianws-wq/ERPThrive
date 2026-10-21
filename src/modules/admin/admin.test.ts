import test from 'node:test';
import assert from 'node:assert/strict';
import { adminService, TenantIsolationError, UnauthorizedError, UnauthenticatedError } from './service.ts';
import { AuthContext, SystemRoleId } from './types.ts';
import { hasPermission, canAssignRole, SYSTEM_ROLES, LEAST_PRIVILEGE_DEFAULT_ROLE } from './permissions.ts';
import { getDatabaseIntegrationStatus } from '../../lib/supabase.ts';

// Test Auth Contexts
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
// 1. VALIDATION & INTEGRITY TESTS
// =============================================================================
test('Company required-field validation rejects missing or invalid fields', () => {
  assert.throws(
    () => {
      adminService.createCompany(
        { ...companyAdminAuth, roleId: 'SUPER_ADMIN' },
        { legalName: '', displayName: 'Test', country: 'US', baseCurrency: 'USD', timezone: 'UTC' }
      );
    },
    /Company validation failed/
  );

  assert.throws(
    () => {
      adminService.createCompany(
        { ...companyAdminAuth, roleId: 'SUPER_ADMIN' },
        { legalName: 'Valid Corp', displayName: 'Valid', country: 'USA', baseCurrency: 'USD', timezone: 'UTC' }
      );
    },
    /Country must be a valid 2-letter ISO 3166-1/
  );

  assert.throws(
    () => {
      adminService.createCompany(
        { ...companyAdminAuth, roleId: 'SUPER_ADMIN' },
        { legalName: 'Valid Corp', displayName: 'Valid', country: 'US', baseCurrency: 'US Dollars', timezone: 'UTC' }
      );
    },
    /Currency must be a valid 3-letter ISO 4217/
  );
});

test('Prevent duplicate company creation by legal name', () => {
  assert.throws(
    () => {
      adminService.createCompany(
        { ...companyAdminAuth, roleId: 'SUPER_ADMIN' },
        {
          legalName: 'ERPThrive Enterprise Global Holdings LLC', // duplicate
          displayName: 'Duplicate Attempt',
          country: 'US',
          baseCurrency: 'USD',
          timezone: 'UTC'
        }
      );
    },
    /already exists/
  );
});

// =============================================================================
// 2. COMPANY CRUD & DEACTIVATION
// =============================================================================
test('Company Admin can view and update authorized company profile', () => {
  const company = adminService.getCompany(companyAdminAuth, 'cmp-001-global');
  assert.equal(company.id, 'cmp-001-global');
  assert.equal(company.status, 'active');

  const updated = adminService.updateCompany(companyAdminAuth, 'cmp-001-global', {
    displayName: 'ERPThrive Global Enterprises'
  });
  assert.equal(updated.displayName, 'ERPThrive Global Enterprises');
});

test('Company can be deactivated with proper authorization', () => {
  // Create a temporary company as Super Admin
  const tempCompany = adminService.createCompany(
    { ...companyAdminAuth, roleId: 'SUPER_ADMIN' },
    {
      legalName: `Deactivate Test Entity ${Date.now()}`,
      displayName: 'Deactivate Test',
      country: 'SG',
      baseCurrency: 'SGD',
      timezone: 'Asia/Singapore'
    }
  );

  const authForTemp: AuthContext = {
    userId: 'temp-admin',
    email: 'admin@temp.internal',
    activeCompanyId: tempCompany.id,
    roleId: 'COMPANY_ADMIN'
  };

  const deactivated = adminService.deactivateCompany(authForTemp, tempCompany.id);
  assert.equal(deactivated.status, 'inactive');
});

// =============================================================================
// 3. BRANCH MANAGEMENT & UNIQUE CODE ENFORCEMENT
// =============================================================================
test('Branch creation validates required fields and unique code within company', () => {
  const newBranch = adminService.createBranch(companyAdminAuth, {
    companyId: 'cmp-001-global',
    name: 'Singapore Innovation Hub',
    code: 'HUB-SIN-01',
    address: 'Marina Bay Financial Centre'
  });

  assert.equal(newBranch.code, 'HUB-SIN-01');
  assert.equal(newBranch.companyId, 'cmp-001-global');
  assert.equal(newBranch.status, 'active');

  // Attempting duplicate branch code within same company must fail
  assert.throws(
    () => {
      adminService.createBranch(companyAdminAuth, {
        companyId: 'cmp-001-global',
        name: 'Another Hub',
        code: 'HUB-SIN-01'
      });
    },
    /already exists for this company/
  );
});

test('Primary headquarters branch cannot be deactivated without replacement', () => {
  assert.throws(
    () => {
      adminService.deactivateBranch(companyAdminAuth, 'brn-001-hq');
    },
    /Cannot deactivate primary headquarters branch/
  );
});

// =============================================================================
// 4. CROSS-TENANT ACCESS DENIAL (SECURITY BOUNDARY)
// =============================================================================
test('Cross-tenant access attempt to foreign company is strictly blocked', () => {
  assert.throws(
    () => {
      // User from cmp-999-foreign attempts to access cmp-001-global
      adminService.getCompany(foreignCompanyAdminAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof TenantIsolationError
  );

  assert.throws(
    () => {
      // User from cmp-999-foreign attempts to view branches of cmp-001-global
      adminService.getBranchesForCompany(foreignCompanyAdminAuth, 'cmp-001-global');
    },
    (err: unknown) => err instanceof TenantIsolationError
  );

  assert.throws(
    () => {
      // User from cmp-999-foreign attempts to update branch in cmp-001-global
      adminService.updateBranch(foreignCompanyAdminAuth, 'brn-001-hq', { name: 'Compromised Name' });
    },
    (err: unknown) => err instanceof TenantIsolationError
  );
});

// =============================================================================
// 5. ROLE & PERMISSION ENFORCEMENT (LEAST PRIVILEGE)
// =============================================================================
test('Least-privilege default role (STAFF_USER) is restricted to read-only', () => {
  assert.equal(LEAST_PRIVILEGE_DEFAULT_ROLE, 'STAFF_USER');

  // Staff user can read authorized company
  const company = adminService.getCompany(staffAuth, 'cmp-001-global');
  assert.ok(company);

  // Staff user CANNOT update company
  assert.throws(
    () => {
      adminService.updateCompany(staffAuth, 'cmp-001-global', { displayName: 'Hacked Name' });
    },
    (err: unknown) => err instanceof UnauthorizedError
  );

  // Staff user CANNOT create a branch
  assert.throws(
    () => {
      adminService.createBranch(staffAuth, {
        companyId: 'cmp-001-global',
        name: 'Unauthorized Branch',
        code: 'UNAUTH-01'
      });
    },
    (err: unknown) => err instanceof UnauthorizedError
  );
});

test('Unauthenticated request is rejected immediately', () => {
  assert.throws(
    () => {
      // @ts-expect-error Testing null auth context
      adminService.getCompany(null, 'cmp-001-global');
    },
    (err: unknown) => err instanceof UnauthenticatedError
  );
});

test('Users cannot alter or escalate their own role', () => {
  // Find membership for adminUser
  const memberships = adminService.getCompanyMemberships(companyAdminAuth, 'cmp-001-global');
  const adminMembership = memberships.find((m) => m.userId === companyAdminAuth.userId);
  assert.ok(adminMembership);

  assert.throws(
    () => {
      // admin user tries to change their own role
      adminService.updateMembership(companyAdminAuth, adminMembership.id, {
        roleId: 'SUPER_ADMIN'
      });
    },
    /Users cannot alter or escalate their own role/
  );
});

// =============================================================================
// 6. AUDIT TRAIL LOGGING
// =============================================================================
test('Administrative mutations automatically generate immutable audit logs', () => {
  const branch = adminService.createBranch(companyAdminAuth, {
    companyId: 'cmp-001-global',
    name: 'Audit Test Branch',
    code: `AUD-${Date.now().toString().slice(-4)}`
  });

  const logs = adminService.getAuditLogs(companyAdminAuth, 'cmp-001-global');
  assert.ok(logs.length > 0);

  const creationLog = logs.find((l) => l.action === 'branch.create' && l.targetId === branch.id);
  assert.ok(creationLog, 'Audit log for branch creation must exist');
  assert.equal(creationLog.actorId, companyAdminAuth.userId);
  assert.equal(creationLog.actorEmail, companyAdminAuth.email);
  assert.equal(creationLog.companyId, 'cmp-001-global');
  assert.equal(creationLog.targetType, 'branch');
});

// =============================================================================
// 7. DATABASE INTEGRATION STATUS DIAGNOSTICS
// =============================================================================
test('Database integration status safely handles unconfigured or malformed environments', () => {
  const status = getDatabaseIntegrationStatus();
  assert.equal(status.provider, 'Supabase / PostgreSQL');
  assert.ok(status.message.length > 0);
  assert.ok(status.status === 'pending_configuration' || status.status === 'connected');
});

