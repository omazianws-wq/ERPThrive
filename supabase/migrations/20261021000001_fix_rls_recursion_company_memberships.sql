-- =============================================================================
-- ERPThrive — Module 1: Forward-Only RLS Recursion Fix & Access Control Hardening
-- Migration File: supabase/migrations/20261021000001_fix_rls_recursion_company_memberships.sql
-- Unique Version Prefix: 20261021000001
--
-- Description:
--   1. Matches and safely drops all confirmed live policies across tables:
--        - companies: "Users can view their authorized companies", "Admins can update company profile"
--        - branches: "Users can view branches for their authorized company", "Authorized staff can manage branches"
--        - audit_logs: "Authorized users can view company audit logs", "Authorized users can insert verified audit logs"
--        - company_memberships: "Admins can manage company memberships" (ALL; recursive), "Members can view company roster" (SELECT)
--   2. Eliminates 42P17 recursion on company_memberships with non-recursive self-SELECT,
--      admin roster SELECT via helper, and granular INSERT/UPDATE/DELETE policies where
--      NO policy on company_memberships directly queries company_memberships to identify the caller.
--   3. Deploys database-side transition trigger protect_company_membership_transitions()
--      to enforce atomicity across OLD and NEW rows, blocking cross-company membership transfers,
--      user_id reassignments, self-modification, peer/superior admin tampering, and invalid roles/statuses.
--   4. Policy Decision: Prohibits horizontal SUPER_ADMIN assignment in company memberships.
--      Standard membership management can assign only COMPANY_ADMIN, OPERATIONS_MANAGER, and STAFF_USER.
--   5. Hardens existing helper public.has_company_access(UUID) with fixed search_path.
--   6. Deploys missing SECURITY DEFINER helpers with fixed search_path and least privilege:
--        - public.has_company_permission(UUID, VARCHAR)
--        - public.get_user_hierarchy_level(UUID)
--        - public.is_company_super_admin(UUID)
--        - public.is_profile_visible_to_caller(UUID)
--   7. Enforces audit log integrity: authenticated client INSERTs strictly require
--      non-null company_id, actor_id = auth.uid(), active company membership, and
--      whitelisted domain action types (blocks client spoofing of company.create).
--   8. Secures tenant bootstrap: public.provision_initial_company is strictly restricted
--      to service_role to prevent unassigned authenticated users from self-provisioning.
--   9. Enforces least-privilege table grants: explicitly revokes ALL table-level
--      privileges on all core tables from PUBLIC, anon, and authenticated before granting
--      only required operations. Unnecessary sequence grants removed.
--  10. Secures public.user_profiles: column UPDATE restricted to (full_name, updated_at),
--      and defense-in-depth trigger protects sensitive fields (id, email, status).
--  11. Preserves existing Auth trigger on_auth_user_created without duplicate triggers.
--
-- Compatibility: PostgreSQL 15+ / Supabase (Cloud & Local)
-- Safety: Enclosed in BEGIN ... COMMIT with fail-fast pre-flight assertions.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. PRE-FLIGHT ASSERTIONS (FAIL FAST IF CORE SCHEMA OBJECTS ARE MISSING)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'company_memberships'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-flight Error: Table public.company_memberships does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'user_profiles'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-flight Error: Table public.user_profiles does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'companies'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-flight Error: Table public.companies does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'branches'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-flight Error: Table public.branches does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'audit_logs'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-flight Error: Table public.audit_logs does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'roles'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-flight Error: Table public.roles does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'permissions'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-flight Error: Table public.permissions does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'role_permissions'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-flight Error: Table public.role_permissions does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'hierarchy_level'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-flight Error: Column hierarchy_level missing from public.roles.';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. HARDEN EXISTING SECURITY DEFINER HELPER: has_company_access
--    Fixes live defect where proconfig was NULL. Sets search_path = public, auth, pg_temp.
--    Preserves exact historical logic and permission semantics.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_company_access(target_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL OR target_company_id IS NULL THEN
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

COMMENT ON FUNCTION public.has_company_access(UUID) IS
'ERPThrive Security Helper: Verifies caller active membership in target company with hardened search_path.';

-- -----------------------------------------------------------------------------
-- 2. DEPLOY SECURITY DEFINER HELPERS (FIXED search_path & LEAST PRIVILEGE)
-- -----------------------------------------------------------------------------

-- 2.1 has_company_permission: Checks specific action permission for caller in target company
-- Uses ONLY confirmed tables (company_memberships, role_permissions). Bypasses RLS safely.
CREATE OR REPLACE FUNCTION public.has_company_permission(target_company_id UUID, required_permission VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL OR target_company_id IS NULL OR required_permission IS NULL THEN
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

COMMENT ON FUNCTION public.has_company_permission(UUID, VARCHAR) IS
'ERPThrive Security Helper: Verifies caller holds required permission in target company without RLS recursion.';

-- 2.2 get_user_hierarchy_level: Returns caller highest hierarchy level in target company
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
    IF auth.uid() IS NULL OR target_company_id IS NULL THEN
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

COMMENT ON FUNCTION public.get_user_hierarchy_level(UUID) IS
'ERPThrive Security Helper: Resolves caller maximum role hierarchy level in target company.';

-- 2.3 is_company_super_admin: Checks exact SUPER_ADMIN role identity for caller
-- Ensures policies on company_memberships DO NOT directly query company_memberships
CREATE OR REPLACE FUNCTION public.is_company_super_admin(target_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL OR target_company_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.company_memberships cm
        WHERE cm.company_id = target_company_id
          AND cm.user_id = auth.uid()
          AND cm.status = 'active'
          AND cm.role_id = 'SUPER_ADMIN'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_company_super_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_super_admin(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_company_super_admin(UUID) IS
'ERPThrive Security Helper: Verifies caller holds active SUPER_ADMIN role identity in target company.';

-- 2.4 is_profile_visible_to_caller: Enables Admin Console roster view without RLS recursion
CREATE OR REPLACE FUNCTION public.is_profile_visible_to_caller(target_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL OR target_profile_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Self profile is always visible
    IF auth.uid() = target_profile_id THEN
        RETURN TRUE;
    END IF;

    -- Target user has an active membership in a company where caller holds admin:user:read
    RETURN EXISTS (
        SELECT 1
        FROM public.company_memberships target_cm
        WHERE target_cm.user_id = target_profile_id
          AND target_cm.status = 'active'
          AND target_cm.company_id IN (
              SELECT admin_cm.company_id
              FROM public.company_memberships admin_cm
              JOIN public.role_permissions rp ON admin_cm.role_id = rp.role_id
              WHERE admin_cm.user_id = auth.uid()
                AND admin_cm.status = 'active'
                AND rp.permission_id = 'admin:user:read'
          )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_profile_visible_to_caller(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_profile_visible_to_caller(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_profile_visible_to_caller(UUID) IS
'ERPThrive Security Helper: Verifies caller possesses admin:user:read authority over target member company.';

-- 2.5 provision_initial_company: Secure backend provisioning procedure
-- Restricted exclusively to service_role to prevent unauthorized self-provisioning.
CREATE OR REPLACE FUNCTION public.provision_initial_company(
    p_legal_name VARCHAR(255),
    p_display_name VARCHAR(255),
    p_country CHAR(2),
    p_base_currency CHAR(3),
    p_timezone VARCHAR(100) DEFAULT 'UTC',
    p_fiscal_year_start VARCHAR(10) DEFAULT '01-01',
    p_hq_branch_name VARCHAR(255) DEFAULT 'Headquarters',
    p_hq_branch_code VARCHAR(50) DEFAULT 'HQ-01',
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_target_user_id UUID;
    v_company_id UUID;
BEGIN
    -- Strict authorization check: Only service_role may invoke tenant bootstrapping
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'ERPThrive Security Error: Tenant provisioning is restricted to verified backend service workflows.';
    END IF;

    -- Input validation
    IF p_legal_name IS NULL OR TRIM(p_legal_name) = '' THEN
        RAISE EXCEPTION 'ERPThrive Validation Error: Legal name is required.';
    END IF;

    IF p_country IS NULL OR LENGTH(TRIM(p_country)) <> 2 THEN
        RAISE EXCEPTION 'ERPThrive Validation Error: Valid 2-letter ISO country code is required.';
    END IF;

    IF p_base_currency IS NULL OR LENGTH(TRIM(p_base_currency)) <> 3 THEN
        RAISE EXCEPTION 'ERPThrive Validation Error: Valid 3-letter ISO currency code is required.';
    END IF;

    v_target_user_id := COALESCE(p_admin_user_id, auth.uid());
    IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'ERPThrive Security Error: Must specify p_admin_user_id for initial administrator.';
    END IF;

    -- Ensure target profile exists
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = v_target_user_id) THEN
        INSERT INTO public.user_profiles (id, email, full_name, status)
        VALUES (
            v_target_user_id,
            COALESCE((SELECT email FROM auth.users WHERE id = v_target_user_id), ''),
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
        TRIM(p_legal_name),
        TRIM(COALESCE(p_display_name, p_legal_name)),
        UPPER(TRIM(p_country)),
        UPPER(TRIM(p_base_currency)),
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
        v_target_user_id,
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
        COALESCE(p_hq_branch_name, 'Headquarters'),
        COALESCE(p_hq_branch_code, 'HQ-01'),
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
        v_target_user_id,
        (SELECT email FROM public.user_profiles WHERE id = v_target_user_id),
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

-- Strictly revoke execution from PUBLIC, anon, and authenticated users
REVOKE ALL ON FUNCTION public.provision_initial_company FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_initial_company TO service_role;

COMMENT ON FUNCTION public.provision_initial_company IS
'ERPThrive Bootstrap Procedure: Service-role mediated tenant and initial administrator creation.';

-- -----------------------------------------------------------------------------
-- 3. RESTRUCTURE public.company_memberships POLICIES & TRANSITION TRIGGER
--    Eliminates 42P17 recursion. Zero direct queries to company_memberships!
--    Policy Decision: Standard membership assignment can NEVER grant SUPER_ADMIN.
-- -----------------------------------------------------------------------------
ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;

-- 3.0 Drop exact confirmed live policies and legacy drafts
DROP POLICY IF EXISTS "Admins can manage company memberships" ON public.company_memberships;
DROP POLICY IF EXISTS "Members can view company roster" ON public.company_memberships;
DROP POLICY IF EXISTS "Users can view own company memberships" ON public.company_memberships;
DROP POLICY IF EXISTS "Admins can view company memberships" ON public.company_memberships;
DROP POLICY IF EXISTS "Admins can invite new members" ON public.company_memberships;
DROP POLICY IF EXISTS "Admins can update memberships" ON public.company_memberships;
DROP POLICY IF EXISTS "Admins can remove memberships" ON public.company_memberships;

-- 3.1 SELECT (Self): Non-recursive direct column comparison
-- Involves ZERO subqueries, ZERO joins, ZERO function calls. Direct index scan on user_id.
CREATE POLICY "Users can view own company memberships"
    ON public.company_memberships FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- 3.2 SELECT (Admin Roster): Authorized administrators can inspect company memberships
-- Bypasses RLS internally through SECURITY DEFINER helper owned by postgres.
CREATE POLICY "Admins can view company memberships"
    ON public.company_memberships FOR SELECT
    TO authenticated
    USING (public.has_company_permission(company_id, 'admin:user:read'));

-- 3.3 INSERT: Member invitation with strict role hierarchy & anti-escalation
-- Strictly blocks SUPER_ADMIN assignment and validates status IN ('active', 'invited')
CREATE POLICY "Admins can invite new members"
    ON public.company_memberships FOR INSERT
    TO authenticated
    WITH CHECK (
        public.has_company_permission(company_id, 'admin:user:create') AND
        user_id <> auth.uid() AND
        status IN ('active', 'invited') AND
        role_id <> 'SUPER_ADMIN' AND
        role_id IN (SELECT id FROM public.roles WHERE id <> 'SUPER_ADMIN') AND
        (
            public.is_company_super_admin(company_id) OR
            (SELECT hierarchy_level FROM public.roles WHERE id = role_id) < public.get_user_hierarchy_level(company_id)
        )
    );

-- 3.4 UPDATE: Member modification with target protection & role hierarchy enforcement
-- Strictly blocks SUPER_ADMIN assignment and validates status IN ('active', 'invited', 'deactivated')
CREATE POLICY "Admins can update memberships"
    ON public.company_memberships FOR UPDATE
    TO authenticated
    USING (
        public.has_company_permission(company_id, 'admin:user:update') AND
        user_id <> auth.uid() AND
        (
            public.is_company_super_admin(company_id) OR
            (
                role_id <> 'SUPER_ADMIN' AND
                (SELECT hierarchy_level FROM public.roles WHERE id = role_id) < public.get_user_hierarchy_level(company_id)
            )
        )
    )
    WITH CHECK (
        public.has_company_permission(company_id, 'admin:user:update') AND
        user_id <> auth.uid() AND
        status IN ('active', 'invited', 'deactivated') AND
        role_id <> 'SUPER_ADMIN' AND
        role_id IN (SELECT id FROM public.roles WHERE id <> 'SUPER_ADMIN') AND
        (
            public.is_company_super_admin(company_id) OR
            (SELECT hierarchy_level FROM public.roles WHERE id = role_id) < public.get_user_hierarchy_level(company_id)
        )
    );

-- 3.5 DELETE: Member removal/deactivation with target hierarchy protection
CREATE POLICY "Admins can remove memberships"
    ON public.company_memberships FOR DELETE
    TO authenticated
    USING (
        public.has_company_permission(company_id, 'admin:user:deactivate') AND
        user_id <> auth.uid() AND
        (
            public.is_company_super_admin(company_id) OR
            (
                role_id <> 'SUPER_ADMIN' AND
                (SELECT hierarchy_level FROM public.roles WHERE id = role_id) < public.get_user_hierarchy_level(company_id)
            )
        )
    );

-- 3.6 DATABASE-SIDE MEMBERSHIP TRANSITION INTEGRITY TRIGGER
-- Enforces atomic constraints comparing OLD and NEW rows (which RLS WITH CHECK cannot do alone).
-- Blocks: cross-company transfer, user_id reassignment, self-modification, peer/superior tampering.
CREATE OR REPLACE FUNCTION public.protect_company_membership_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_level INT;
    v_is_super_admin BOOLEAN;
BEGIN
    IF auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
        -- 1. Prevent membership transfer between companies
        IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
            RAISE EXCEPTION 'ERPThrive Security Violation: Membership company_id is immutable and cannot be transferred.';
        END IF;

        -- 2. Prevent reassigning membership to a different user_id
        IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
            RAISE EXCEPTION 'ERPThrive Security Violation: Membership user_id is immutable.';
        END IF;

        -- 3. Prevent modifying one's own membership
        IF OLD.user_id = auth.uid() THEN
            RAISE EXCEPTION 'ERPThrive Security Violation: Users cannot alter or escalate their own membership.';
        END IF;

        -- 4. Validate allowed membership status
        IF NEW.status NOT IN ('active', 'invited', 'deactivated') THEN
            RAISE EXCEPTION 'ERPThrive Security Violation: Invalid membership status (%).', NEW.status;
        END IF;

        -- 5. Prohibit SUPER_ADMIN role assignment in company memberships
        IF NEW.role_id = 'SUPER_ADMIN' THEN
            RAISE EXCEPTION 'ERPThrive Security Violation: Super Administrator role cannot be assigned via company membership.';
        END IF;

        -- 6. Validate role ID exists in public.roles (fail closed on invalid roles)
        IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = NEW.role_id) THEN
            RAISE EXCEPTION 'ERPThrive Security Violation: Role ID (%) is invalid.', NEW.role_id;
        END IF;

        -- 7. Check caller privileges against target membership (both OLD and NEW rows)
        v_is_super_admin := public.is_company_super_admin(OLD.company_id);
        v_caller_level := public.get_user_hierarchy_level(OLD.company_id);

        IF NOT v_is_super_admin THEN
            -- Target row (OLD) must not be SUPER_ADMIN
            IF OLD.role_id = 'SUPER_ADMIN' THEN
                RAISE EXCEPTION 'ERPThrive Security Violation: Unauthorized to modify Super Administrator membership.';
            END IF;

            -- Target row (OLD) role must be strictly lower than caller
            IF (SELECT hierarchy_level FROM public.roles WHERE id = OLD.role_id) >= v_caller_level THEN
                RAISE EXCEPTION 'ERPThrive Security Violation: Unauthorized to modify member with equal or higher role level.';
            END IF;

            -- Resulting row (NEW) role must be strictly lower than caller
            IF (SELECT hierarchy_level FROM public.roles WHERE id = NEW.role_id) >= v_caller_level THEN
                RAISE EXCEPTION 'ERPThrive Security Violation: Unauthorized to assign role with equal or higher hierarchy level.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_company_membership_transitions FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.protect_company_membership_transitions TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_protect_company_membership_transitions ON public.company_memberships;
CREATE TRIGGER trg_protect_company_membership_transitions
    BEFORE UPDATE ON public.company_memberships
    FOR EACH ROW EXECUTE FUNCTION public.protect_company_membership_transitions();

-- Least-privilege table grants on company_memberships
REVOKE ALL ON public.company_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_memberships TO authenticated;
GRANT ALL ON public.company_memberships TO service_role;

-- -----------------------------------------------------------------------------
-- 4. REPAIR RELATED POLICIES: COMPANIES, BRANCHES, AND AUDIT LOGS
--    Matches exact live names and replaces inline subqueries with safe helpers.
-- -----------------------------------------------------------------------------

-- 4.1 COMPANIES POLICIES
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Drop exact confirmed live policy names
DROP POLICY IF EXISTS "Users can view their authorized companies" ON public.companies;
DROP POLICY IF EXISTS "Users can view authorized companies" ON public.companies;
DROP POLICY IF EXISTS "Admins can update company profile" ON public.companies;
DROP POLICY IF EXISTS "Admins can manage companies" ON public.companies;

CREATE POLICY "Users can view their authorized companies"
    ON public.companies FOR SELECT
    TO authenticated
    USING (public.has_company_access(id));

CREATE POLICY "Admins can update company profile"
    ON public.companies FOR UPDATE
    TO authenticated
    USING (public.has_company_permission(id, 'admin:company:update'))
    WITH CHECK (public.has_company_permission(id, 'admin:company:update'));

-- Least-privilege table grants on companies (No INSERT/DELETE for authenticated users)
REVOKE ALL ON public.companies FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

-- 4.2 BRANCHES POLICIES
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Drop exact confirmed live policy names
DROP POLICY IF EXISTS "Users can view branches for their authorized company" ON public.branches;
DROP POLICY IF EXISTS "Users can view branches for authorized company" ON public.branches;
DROP POLICY IF EXISTS "Authorized staff can manage branches" ON public.branches;
DROP POLICY IF EXISTS "Authorized users can create branches" ON public.branches;
DROP POLICY IF EXISTS "Authorized users can update branches" ON public.branches;
DROP POLICY IF EXISTS "Admins can manage branches" ON public.branches;

-- Recreate matching exact live confirmed name
CREATE POLICY "Users can view branches for their authorized company"
    ON public.branches FOR SELECT
    TO authenticated
    USING (public.has_company_access(company_id));

CREATE POLICY "Authorized users can create branches"
    ON public.branches FOR INSERT
    TO authenticated
    WITH CHECK (public.has_company_permission(company_id, 'admin:branch:create'));

CREATE POLICY "Authorized users can update branches"
    ON public.branches FOR UPDATE
    TO authenticated
    USING (public.has_company_permission(company_id, 'admin:branch:update'))
    WITH CHECK (public.has_company_permission(company_id, 'admin:branch:update'));

-- Least-privilege table grants on branches (DELETE strictly revoked; deactivation preferred)
REVOKE ALL ON public.branches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;

-- 4.3 AUDIT LOGS POLICIES & INTEGRITY ENFORCEMENT
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop exact confirmed live policy names
DROP POLICY IF EXISTS "Authorized users can view company audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authorized users can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authorized users can insert verified audit logs" ON public.audit_logs;

CREATE POLICY "Authorized users can view company audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (
        company_id IS NOT NULL AND
        public.has_company_permission(company_id, 'admin:audit:read')
    );

-- Tightened INSERT policy:
-- 1. Rejects NULL company_id on client inserts
-- 2. Enforces actor_id = auth.uid()
-- 3. Enforces membership in target company
-- 4. Restricts actions to valid client-initiated events (blocks client spoofing of company.create)
CREATE POLICY "Authorized users can insert verified audit logs"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id IS NOT NULL AND
        actor_id = auth.uid() AND
        public.has_company_access(company_id) AND
        action IN (
            'company.update',
            'branch.create', 'branch.update', 'branch.deactivate',
            'user.invite', 'user.role_change', 'user.status_change'
        ) AND
        target_type IN ('company', 'branch', 'user', 'membership')
    );

-- Least-privilege table grants on audit_logs (Strictly append-only; UPDATE/DELETE revoked)
REVOKE ALL ON public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- -----------------------------------------------------------------------------
-- 5. ESTABLISH public.user_profiles RLS, PRIVILEGES & TRIGGER PROTECTION
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

-- 5.1 SELECT: Caller views own profile or authorized company admin views roster profiles
CREATE POLICY "Users can view relevant profiles"
    ON public.user_profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() OR
        public.is_profile_visible_to_caller(id)
    );

-- 5.2 UPDATE: Self-update on own row
CREATE POLICY "Users can update own profile"
    ON public.user_profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 5.3 Revoke excessive client privileges and enforce column-level UPDATE
REVOKE ALL ON public.user_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT UPDATE (full_name, updated_at) ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;

-- 5.4 Deploy defense-in-depth trigger protecting sensitive profile fields
CREATE OR REPLACE FUNCTION public.protect_user_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    -- Enforce protection when invoked via Supabase client JWT context (authenticated session)
    IF auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'ERPThrive Security Error: User profile ID cannot be modified.';
        END IF;

        IF NEW.email IS DISTINCT FROM OLD.email THEN
            RAISE EXCEPTION 'ERPThrive Security Error: Email is synchronized with Supabase Auth and cannot be modified directly.';
        END IF;

        IF NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'ERPThrive Security Error: User status cannot be modified directly.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_field_protection ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_field_protection
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_user_profile_fields();

-- -----------------------------------------------------------------------------
-- 6. REFERENCE TABLE GRANTS
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.roles, public.permissions, public.role_permissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.roles, public.permissions, public.role_permissions TO authenticated;
GRANT ALL ON public.roles, public.permissions, public.role_permissions TO service_role;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. AUTH PROFILE SYNC FUNCTION & TRIGGER SYNCHRONIZATION
--    Preserves existing on_auth_user_created trigger without creating duplicates.
-- -----------------------------------------------------------------------------
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

-- Ensure on_auth_user_created exists on auth.users without creating duplicate triggers
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'auth' AND table_name = 'users'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE event_object_schema = 'auth' 
              AND event_object_table = 'users' 
              AND trigger_name = 'on_auth_user_created'
        ) THEN
            CREATE TRIGGER on_auth_user_created
                AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
                FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
        END IF;
    END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- End of Forward-Only Migration
-- =============================================================================
