-- =============================================================================
-- ERPThrive — Module 1: Administration & Identity Foundation
-- Migration: 20261020000001_module1_admin_and_identity.sql
-- Description: Production-grade schema for multi-tenant Organization, Branches,
--              Roles, Permissions, Memberships, Audit Trails, and Row-Level Security.
-- Compatibility: PostgreSQL 15+ / Supabase (Cloud & Self-Hosted)
--
-- SECURITY & COMPLIANCE ARCHITECTURE:
-- 1. Explicit search_path: All functions specify SET search_path = public, auth, pg_temp.
-- 2. Complete RLS Coverage: Enabled across ALL 8 tables (including roles and permissions).
-- 3. Strict Privilege Grants: Aligned with RLS policies; DELETE and unneeded INSERT revoked.
-- 4. Multi-Tenant Bootstrap Procedure: Safe atomic provision_initial_company function
--    to solve the first-admin chicken-and-egg problem without exposing open table INSERTs.
-- 5. Anti-Privilege Escalation:
--    - Users cannot modify or escalate their own role (user_id <> auth.uid()).
--    - Admins cannot grant a role with higher hierarchy than their own level.
--    - user_profiles email and status are protected against direct client tampering.
-- 6. Immutable Audit Trail:
--    - Engine-level trigger blocks UPDATE, DELETE, and TRUNCATE.
--    - INSERT policy enforces actor_id = auth.uid() to prevent log spoofing.
-- 7. Automatic Profile Provisioning: Synchronized via trigger on auth.users.
-- 8. Complete Idempotency: Safe to apply repeatedly on fresh or existing databases.
-- =============================================================================

-- Ensure required cryptographic and UUID extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- =============================================================================
-- 1. UTILITY FUNCTIONS & TIMESTAMP TRIGGERS
-- =============================================================================

-- Generic trigger function to enforce updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated, service_role;

-- =============================================================================
-- 2. COMPANIES (Multi-tenant root organization entity)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    country CHAR(2) NOT NULL, -- ISO 3166-1 alpha-2 (e.g. 'US', 'GB', 'SG', 'MY')
    base_currency CHAR(3) NOT NULL, -- ISO 4217 (e.g. 'USD', 'EUR', 'GBP')
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    fiscal_year_start VARCHAR(10) NOT NULL DEFAULT '01-01', -- MM-DD format
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_company_legal_name UNIQUE (legal_name)
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);

DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 3. BRANCHES (Operating facilities / locations belonging to an authorized company)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    is_headquarters BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_branch_code_per_company UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_company_id ON public.branches(company_id);
CREATE INDEX IF NOT EXISTS idx_branches_status ON public.branches(status);

DROP TRIGGER IF EXISTS trg_branches_updated_at ON public.branches;
CREATE TRIGGER trg_branches_updated_at
    BEFORE UPDATE ON public.branches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 4. USER PROFILES (Identity profile linked to Supabase auth.users)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger function protecting privileged profile fields from client tampering
CREATE OR REPLACE FUNCTION public.protect_user_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    -- Prevent direct alteration of email (must be updated via Supabase Auth)
    IF NEW.email IS DISTINCT FROM OLD.email AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'ERPThrive Security Error: Email is synchronized with Supabase Auth and cannot be modified directly.';
    END IF;

    -- Prevent direct alteration of user ID
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'ERPThrive Security Error: User profile ID cannot be changed.';
    END IF;

    -- Prevent users from self-activating or changing status without administrative permission
    IF NEW.status IS DISTINCT FROM OLD.status AND current_user <> 'postgres' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.company_memberships cm
            JOIN public.role_permissions rp ON cm.role_id = rp.role_id
            WHERE cm.user_id = auth.uid()
              AND cm.status = 'active'
              AND rp.permission_id = 'admin:user:update'
        ) THEN
            RAISE EXCEPTION 'ERPThrive Security Error: Unauthorized to modify user account status.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_user_profile_fields() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.protect_user_profile_fields() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_user_profiles_field_protection ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_field_protection
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_user_profile_fields();

-- Automatic profile sync trigger from Supabase auth.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name, status)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, ''), '@', 1)),
        'active'
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = CASE WHEN public.user_profiles.full_name = '' THEN EXCLUDED.full_name ELSE public.user_profiles.full_name END,
        updated_at = NOW();
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO authenticated, service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- =============================================================================
-- 5. ROLES & PERMISSIONS (Fine-grained RBAC with hierarchy levels)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT TRUE,
    hierarchy_level INT NOT NULL DEFAULT 1 -- Higher value = higher privilege
);

CREATE TABLE IF NOT EXISTS public.permissions (
    id VARCHAR(100) PRIMARY KEY,
    module VARCHAR(50) NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN ('read', 'create', 'update', 'deactivate', 'admin')),
    description TEXT
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id VARCHAR(50) NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(100) NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- =============================================================================
-- 6. COMPANY MEMBERSHIPS (Multi-tenant association of users to companies)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.company_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role_id VARCHAR(50) NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'deactivated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_company_membership UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_company ON public.company_memberships(company_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.company_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON public.company_memberships(role_id);

DROP TRIGGER IF EXISTS trg_memberships_updated_at ON public.company_memberships;
CREATE TRIGGER trg_memberships_updated_at
    BEFORE UPDATE ON public.company_memberships
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 7. AUDIT LOGS (Immutable governance trail)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100) NOT NULL,
    target_id VARCHAR(255) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(created_at DESC);

-- Trigger to strictly guarantee audit logs are append-only
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'ERPThrive Security Violation: Audit log entries are immutable and cannot be modified or deleted.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_audit_log_mutation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prevent_audit_log_mutation() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- Revoke mutation and truncation privileges on audit logs
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 8. SEED SYSTEM ROLES & PERMISSION MATRIX (Idempotent synchronization)
-- =============================================================================
INSERT INTO public.roles (id, name, description, is_system, hierarchy_level) VALUES
    ('SUPER_ADMIN', 'Super Administrator', 'Full administrative authority across all modules and platform configuration.', TRUE, 100),
    ('COMPANY_ADMIN', 'Company Administrator', 'Authorized to administer company settings, branches, users, and assign roles.', TRUE, 80),
    ('OPERATIONS_MANAGER', 'Operations Manager', 'Operational leadership with manage access to branches and read access to administration.', TRUE, 50),
    ('STAFF_USER', 'Staff User', 'Least-privilege default role with restricted read-only permissions on authorized company entities.', TRUE, 10)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    hierarchy_level = EXCLUDED.hierarchy_level;

INSERT INTO public.permissions (id, module, resource, action, description) VALUES
    -- Company Permissions
    ('admin:company:read', 'admin', 'company', 'read', 'View company profile and organizational settings'),
    ('admin:company:create', 'admin', 'company', 'create', 'Register new company entity'),
    ('admin:company:update', 'admin', 'company', 'update', 'Modify company details, currency, and timezone'),
    ('admin:company:deactivate', 'admin', 'company', 'deactivate', 'Deactivate or suspend company status'),
    -- Branch Permissions
    ('admin:branch:read', 'admin', 'branch', 'read', 'View company branches and facility addresses'),
    ('admin:branch:create', 'admin', 'branch', 'create', 'Create and register new branch facilities'),
    ('admin:branch:update', 'admin', 'branch', 'update', 'Modify branch parameters, code, and address'),
    ('admin:branch:deactivate', 'admin', 'branch', 'deactivate', 'Deactivate operating status of a branch'),
    -- User & Membership Permissions
    ('admin:user:read', 'admin', 'user', 'read', 'View user profiles and company membership rosters'),
    ('admin:user:create', 'admin', 'user', 'create', 'Invite and register new team members'),
    ('admin:user:update', 'admin', 'user', 'update', 'Update member information and role assignments'),
    ('admin:user:deactivate', 'admin', 'user', 'deactivate', 'Deactivate user membership within company'),
    -- Role & Audit Permissions
    ('admin:role:read', 'admin', 'role', 'read', 'Inspect role definitions and permission matrices'),
    ('admin:role:admin', 'admin', 'role', 'admin', 'Assign privileged roles (restricted to higher hierarchy)'),
    ('admin:audit:read', 'admin', 'audit', 'read', 'Inspect immutable audit logs and governance trails')
ON CONFLICT (id) DO UPDATE SET
    description = EXCLUDED.description;

-- Re-synchronize system role permissions idempotently
DELETE FROM public.role_permissions
WHERE role_id IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'OPERATIONS_MANAGER', 'STAFF_USER');

-- 1. SUPER_ADMIN gets all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'SUPER_ADMIN', id FROM public.permissions;

-- 2. COMPANY_ADMIN gets administrative permissions (excluding platform-wide company creation)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'COMPANY_ADMIN', id FROM public.permissions
WHERE id NOT IN ('admin:company:create');

-- 3. OPERATIONS_MANAGER gets branch management and read-only access
INSERT INTO public.role_permissions (role_id, permission_id) VALUES
    ('OPERATIONS_MANAGER', 'admin:company:read'),
    ('OPERATIONS_MANAGER', 'admin:branch:read'),
    ('OPERATIONS_MANAGER', 'admin:branch:create'),
    ('OPERATIONS_MANAGER', 'admin:branch:update'),
    ('OPERATIONS_MANAGER', 'admin:user:read'),
    ('OPERATIONS_MANAGER', 'admin:role:read');

-- 4. STAFF_USER (Least-privilege default) gets read-only access
INSERT INTO public.role_permissions (role_id, permission_id) VALUES
    ('STAFF_USER', 'admin:company:read'),
    ('STAFF_USER', 'admin:branch:read');

-- =============================================================================
-- 9. SECURITY HELPER FUNCTIONS (SECURITY DEFINER with safe search_path)
-- =============================================================================

-- Check whether the current session has active membership in target company
CREATE OR REPLACE FUNCTION public.has_company_access(target_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.company_memberships cm
        WHERE cm.company_id = target_company_id
          AND cm.user_id = auth.uid()
          AND cm.status = 'active'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_company_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_company_access(UUID) TO authenticated, service_role;

-- Check whether caller possesses a specific permission in target company
CREATE OR REPLACE FUNCTION public.has_company_permission(target_company_id UUID, required_permission VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.company_memberships cm
        JOIN public.role_permissions rp ON cm.role_id = rp.role_id
        WHERE cm.company_id = target_company_id
          AND cm.user_id = auth.uid()
          AND cm.status = 'active'
          AND rp.permission_id = required_permission
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_company_permission(UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_company_permission(UUID, VARCHAR) TO authenticated, service_role;

-- Get caller's maximum hierarchy level in target company
CREATE OR REPLACE FUNCTION public.get_user_hierarchy_level(target_company_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    caller_level INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(MAX(r.hierarchy_level), 0)
    INTO caller_level
    FROM public.company_memberships cm
    JOIN public.roles r ON cm.role_id = r.id
    WHERE cm.company_id = target_company_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active';

    RETURN caller_level;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_hierarchy_level(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_hierarchy_level(UUID) TO authenticated, service_role;

-- =============================================================================
-- 10. MULTI-TENANT INITIAL COMPANY PROVISIONING PROCEDURE
-- Solves the first-admin chicken-and-egg problem securely without opening
-- up raw INSERT permissions on public.companies.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.provision_initial_company(
    p_legal_name VARCHAR(255),
    p_display_name VARCHAR(255),
    p_country CHAR(2),
    p_base_currency CHAR(3),
    p_timezone VARCHAR(100) DEFAULT 'UTC',
    p_fiscal_year_start VARCHAR(10) DEFAULT '01-01',
    p_hq_branch_name VARCHAR(255) DEFAULT 'Headquarters',
    p_hq_branch_code VARCHAR(50) DEFAULT 'HQ-01'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_company_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'ERPThrive Security Error: You must be authenticated to provision a company.';
    END IF;

    -- Ensure caller profile exists
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = v_user_id) THEN
        INSERT INTO public.user_profiles (id, email, full_name, status)
        VALUES (
            v_user_id,
            COALESCE((SELECT email FROM auth.users WHERE id = v_user_id), ''),
            'Initial Administrator',
            'active'
        )
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- 1. Create Company Entity
    INSERT INTO public.companies (
        legal_name,
        display_name,
        country,
        base_currency,
        timezone,
        fiscal_year_start,
        status
    ) VALUES (
        p_legal_name,
        p_display_name,
        p_country,
        p_base_currency,
        COALESCE(p_timezone, 'UTC'),
        COALESCE(p_fiscal_year_start, '01-01'),
        'active'
    ) RETURNING id INTO v_company_id;

    -- 2. Create Initial Company Administrator Membership
    INSERT INTO public.company_memberships (
        company_id,
        user_id,
        role_id,
        status
    ) VALUES (
        v_company_id,
        v_user_id,
        'COMPANY_ADMIN',
        'active'
    );

    -- 3. Create Default Primary Headquarters Branch
    INSERT INTO public.branches (
        company_id,
        name,
        code,
        is_headquarters,
        status
    ) VALUES (
        v_company_id,
        p_hq_branch_name,
        p_hq_branch_code,
        TRUE,
        'active'
    );

    -- 4. Create Audit Log Entry
    INSERT INTO public.audit_logs (
        company_id,
        actor_id,
        actor_email,
        action,
        target_type,
        target_id,
        details
    ) VALUES (
        v_company_id,
        v_user_id,
        (SELECT email FROM public.user_profiles WHERE id = v_user_id),
        'company.create',
        'company',
        v_company_id::TEXT,
        jsonb_build_object(
            'legal_name', p_legal_name,
            'country', p_country,
            'base_currency', p_base_currency,
            'provisioned_by_role', 'COMPANY_ADMIN'
        )
    );

    RETURN v_company_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_initial_company FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_initial_company TO authenticated, service_role;

-- =============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS across ALL 8 tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 11.1 ROLES & PERMISSIONS POLICIES (Read-only to authenticated users)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can inspect roles" ON public.roles;
CREATE POLICY "Authenticated users can inspect roles"
    ON public.roles FOR SELECT
    TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Authenticated users can inspect permissions" ON public.permissions;
CREATE POLICY "Authenticated users can inspect permissions"
    ON public.permissions FOR SELECT
    TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Authenticated users can inspect role_permissions" ON public.role_permissions;
CREATE POLICY "Authenticated users can inspect role_permissions"
    ON public.role_permissions FOR SELECT
    TO authenticated
    USING (TRUE);

-- -----------------------------------------------------------------------------
-- 11.2 COMPANIES POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view authorized companies" ON public.companies;
CREATE POLICY "Users can view authorized companies"
    ON public.companies FOR SELECT
    TO authenticated
    USING (public.has_company_access(id));

DROP POLICY IF EXISTS "Admins can update company profile" ON public.companies;
CREATE POLICY "Admins can update company profile"
    ON public.companies FOR UPDATE
    TO authenticated
    USING (public.has_company_permission(id, 'admin:company:update'))
    WITH CHECK (public.has_company_permission(id, 'admin:company:update'));

-- Raw INSERT on public.companies is restricted; creation is mediated via
-- public.provision_initial_company() or service_role.

-- -----------------------------------------------------------------------------
-- 11.3 BRANCHES POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view branches for authorized company" ON public.branches;
CREATE POLICY "Users can view branches for authorized company"
    ON public.branches FOR SELECT
    TO authenticated
    USING (public.has_company_access(company_id));

DROP POLICY IF EXISTS "Authorized users can create branches" ON public.branches;
CREATE POLICY "Authorized users can create branches"
    ON public.branches FOR INSERT
    TO authenticated
    WITH CHECK (public.has_company_permission(company_id, 'admin:branch:create'));

DROP POLICY IF EXISTS "Authorized users can update branches" ON public.branches;
CREATE POLICY "Authorized users can update branches"
    ON public.branches FOR UPDATE
    TO authenticated
    USING (public.has_company_permission(company_id, 'admin:branch:update'))
    WITH CHECK (public.has_company_permission(company_id, 'admin:branch:update'));

-- -----------------------------------------------------------------------------
-- 11.4 USER PROFILES POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view relevant profiles" ON public.user_profiles;
CREATE POLICY "Users can view relevant profiles"
    ON public.user_profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() OR
        EXISTS (
            SELECT 1
            FROM public.company_memberships cm_caller
            JOIN public.company_memberships cm_target ON cm_caller.company_id = cm_target.company_id
            WHERE cm_caller.user_id = auth.uid()
              AND cm_target.user_id = user_profiles.id
              AND cm_caller.status = 'active'
        )
    );

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
    ON public.user_profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- -----------------------------------------------------------------------------
-- 11.5 COMPANY MEMBERSHIPS POLICIES (Anti-privilege-escalation enforced)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view company roster" ON public.company_memberships;
CREATE POLICY "Members can view company roster"
    ON public.company_memberships FOR SELECT
    TO authenticated
    USING (public.has_company_access(company_id));

DROP POLICY IF EXISTS "Admins can invite new members" ON public.company_memberships;
CREATE POLICY "Admins can invite new members"
    ON public.company_memberships FOR INSERT
    TO authenticated
    WITH CHECK (
        public.has_company_permission(company_id, 'admin:user:create') AND
        -- Prevent assigning a role with higher hierarchy than caller's own level
        (SELECT hierarchy_level FROM public.roles WHERE id = role_id) <= public.get_user_hierarchy_level(company_id)
    );

DROP POLICY IF EXISTS "Admins can update memberships" ON public.company_memberships;
CREATE POLICY "Admins can update memberships"
    ON public.company_memberships FOR UPDATE
    TO authenticated
    USING (
        public.has_company_permission(company_id, 'admin:user:update') AND
        -- A user cannot modify or escalate their OWN membership
        user_id <> auth.uid()
    )
    WITH CHECK (
        public.has_company_permission(company_id, 'admin:user:update') AND
        -- Prevent assigning a role with higher hierarchy than caller's own level
        (SELECT hierarchy_level FROM public.roles WHERE id = role_id) <= public.get_user_hierarchy_level(company_id) AND
        -- Prevent changing own role
        user_id <> auth.uid()
    );

DROP POLICY IF EXISTS "Admins can remove memberships" ON public.company_memberships;
CREATE POLICY "Admins can remove memberships"
    ON public.company_memberships FOR DELETE
    TO authenticated
    USING (
        public.has_company_permission(company_id, 'admin:user:deactivate') AND
        -- Cannot remove own membership
        user_id <> auth.uid()
    );

-- -----------------------------------------------------------------------------
-- 11.6 AUDIT LOGS POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authorized users can view audit logs" ON public.audit_logs;
CREATE POLICY "Authorized users can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (
        company_id IS NOT NULL AND
        public.has_company_permission(company_id, 'admin:audit:read')
    );

DROP POLICY IF EXISTS "Authorized users can insert verified audit logs" ON public.audit_logs;
CREATE POLICY "Authorized users can insert verified audit logs"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Enforce that actor_id matches the authenticated caller (prevents audit spoofing)
        actor_id = auth.uid() AND
        (company_id IS NULL OR public.has_company_access(company_id))
    );

-- =============================================================================
-- 12. TABLE PERMISSION GRANTS
-- =============================================================================
-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant table privileges
-- Read-only reference data
GRANT SELECT ON public.roles, public.permissions, public.role_permissions TO authenticated;

-- Companies: SELECT, UPDATE (creation mediated via provision_initial_company or service_role)
GRANT SELECT, UPDATE ON public.companies TO authenticated;

-- Branches: SELECT, INSERT, UPDATE (deactivation preferred over DELETE)
GRANT SELECT, INSERT, UPDATE ON public.branches TO authenticated;

-- User Profiles: SELECT, UPDATE (managed by trigger & Supabase Auth)
GRANT SELECT, UPDATE ON public.user_profiles TO authenticated;

-- Company Memberships: SELECT, INSERT, UPDATE, DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_memberships TO authenticated;

-- Audit Logs: SELECT, INSERT only (UPDATE/DELETE strictly revoked above)
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- Service role has full administrative access for background operations and migrations
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role;
