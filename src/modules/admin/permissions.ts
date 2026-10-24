import { Role, Permission, SystemRoleId } from './types.ts';

export const SYSTEM_PERMISSIONS: readonly Permission[] = [
  // Company
  { id: 'admin:company:read', module: 'admin', resource: 'company', action: 'read', description: 'View company profile and organization parameters' },
  { id: 'admin:company:create', module: 'admin', resource: 'company', action: 'create', description: 'Register new tenant company' },
  { id: 'admin:company:update', module: 'admin', resource: 'company', action: 'update', description: 'Modify legal name, currency, timezone, and fiscal start' },
  { id: 'admin:company:deactivate', module: 'admin', resource: 'company', action: 'deactivate', description: 'Suspend or deactivate company entity' },

  // Branch
  { id: 'admin:branch:read', module: 'admin', resource: 'branch', action: 'read', description: 'View branches and facility locations' },
  { id: 'admin:branch:create', module: 'admin', resource: 'branch', action: 'create', description: 'Register new branch facilities' },
  { id: 'admin:branch:update', module: 'admin', resource: 'branch', action: 'update', description: 'Update branch code, name, and address' },
  { id: 'admin:branch:deactivate', module: 'admin', resource: 'branch', action: 'deactivate', description: 'Deactivate branch operations' },

  // User & Membership
  { id: 'admin:user:read', module: 'admin', resource: 'user', action: 'read', description: 'View user roster and membership status' },
  { id: 'admin:user:create', module: 'admin', resource: 'user', action: 'create', description: 'Invite new team members' },
  { id: 'admin:user:update', module: 'admin', resource: 'user', action: 'update', description: 'Modify member status and role assignment' },
  { id: 'admin:user:deactivate', module: 'admin', resource: 'user', action: 'deactivate', description: 'Deactivate member company access' },

  // Role & Audit
  { id: 'admin:role:read', module: 'admin', resource: 'role', action: 'read', description: 'Inspect role hierarchy and permission matrix' },
  { id: 'admin:role:admin', module: 'admin', resource: 'role', action: 'admin', description: 'Assign privileged administrative roles' },
  { id: 'admin:audit:read', module: 'admin', resource: 'audit', action: 'read', description: 'Inspect immutable governance audit logs' }
];

export const SYSTEM_ROLES: Record<SystemRoleId, Role> = {
  SUPER_ADMIN: {
    id: 'SUPER_ADMIN',
    name: 'Super Administrator',
    description: 'Complete administrative oversight across all system settings and companies.',
    isSystem: true,
    hierarchyLevel: 100,
    permissions: SYSTEM_PERMISSIONS.map((p) => p.id)
  },
  COMPANY_ADMIN: {
    id: 'COMPANY_ADMIN',
    name: 'Company Administrator',
    description: 'Manages authorized company profile, facilities, team members, and role assignments.',
    isSystem: true,
    hierarchyLevel: 80,
    permissions: [
      'admin:company:read',
      'admin:company:update',
      'admin:company:deactivate',
      'admin:branch:read',
      'admin:branch:create',
      'admin:branch:update',
      'admin:branch:deactivate',
      'admin:user:read',
      'admin:user:create',
      'admin:user:update',
      'admin:user:deactivate',
      'admin:role:read',
      'admin:audit:read'
    ]
  },
  OPERATIONS_MANAGER: {
    id: 'OPERATIONS_MANAGER',
    name: 'Operations Manager',
    description: 'Manages branch facilities and views company roster and organizational settings.',
    isSystem: true,
    hierarchyLevel: 50,
    permissions: [
      'admin:company:read',
      'admin:branch:read',
      'admin:branch:create',
      'admin:branch:update',
      'admin:user:read',
      'admin:role:read'
    ]
  },
  STAFF_USER: {
    id: 'STAFF_USER',
    name: 'Staff User',
    description: 'Least-privilege default role. Strictly read-only access to authorized company and branch.',
    isSystem: true,
    hierarchyLevel: 10,
    permissions: [
      'admin:company:read',
      'admin:branch:read'
    ]
  }
};

export const LEAST_PRIVILEGE_DEFAULT_ROLE: SystemRoleId = 'STAFF_USER';

/**
 * Checks whether a given role holds a specific permission.
 */
export function hasPermission(roleId: SystemRoleId, permissionId: string): boolean {
  const role = SYSTEM_ROLES[roleId];
  if (!role) return false;
  return role.permissions.includes(permissionId);
}

/**
 * Enforces role hierarchy protection:
 * A user cannot assign a role higher or equal to their own hierarchy level,
 * and cannot grant themselves a privileged role.
 */
export function canAssignRole(callerRoleId: SystemRoleId, targetRoleId: SystemRoleId): boolean {
  const caller = SYSTEM_ROLES[callerRoleId];
  const target = SYSTEM_ROLES[targetRoleId];
  if (!caller || !target) return false;

  // Target role can NEVER be SUPER_ADMIN in company membership assignment (prevents horizontal super-admin proliferation)
  if (targetRoleId === 'SUPER_ADMIN') {
    return false;
  }

  // Only users with Company Admin level (80+) or Super Admin (100) can assign roles
  if (caller.hierarchyLevel < 80) {
    return false;
  }

  // Super Admin (platform authority) can assign any tenant role (COMPANY_ADMIN, OPERATIONS_MANAGER, STAFF_USER)
  if (callerRoleId === 'SUPER_ADMIN') {
    return true;
  }

  // Caller can only assign roles strictly lower than their authorized level
  return caller.hierarchyLevel > target.hierarchyLevel;
}
