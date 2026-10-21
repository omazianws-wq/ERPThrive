-- =============================================================================
-- ERPThrive — Module 1: Minimal RLS Recursion Fix for company_memberships & user_profiles
-- Migration: 20261021000001_fix_rls_recursion_company_memberships.sql
-- Description: Minimal forward-only fix resolving PostgreSQL SQLSTATE 42P17
--              (infinite recursion in policy for relation "company_memberships")
--              and removing circular membership join evaluation in "user_profiles".
-- Compatibility: PostgreSQL 15+ / Supabase (Cloud & Self-Hosted)
-- Transactional: Wrapped in BEGIN ... COMMIT
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. PRE-CONDITION ASSERTIONS (FAIL FAST IF HISTORICAL MIGRATION NOT APPLIED)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'company_memberships'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-condition Failure: Table public.company_memberships does not exist. Historical migration 20261020000001_module1_admin_and_identity.sql must be applied first.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'user_profiles'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-condition Failure: Table public.user_profiles does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'companies'
    ) THEN
        RAISE EXCEPTION 'ERPThrive Pre-condition Failure: Table public.companies does not exist.';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. SECURITY HELPER: Profile Visibility Check Without Circular Table Evaluation
--    Enforces that an authenticated caller can view another user's profile ONLY
--    if both users share at least one active company membership.
--    - Fixed search_path = public, auth, pg_temp
--    - STABLE volatility (safe for query planner caching within statement)
--    - SECURITY DEFINER (executes in trusted schema context)
--    - Explicit NULL & identity guards
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_profile_accessible(target_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    -- Guard 1: Must be authenticated
    IF auth.uid() IS NULL OR target_profile_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Guard 2: Own profile is always accessible
    IF auth.uid() = target_profile_id THEN
        RETURN TRUE;
    END IF;

    -- Check if target user shares at least one active company with the caller.
    -- Because company_memberships has a base RLS policy of (user_id = auth.uid()),
    -- evaluating cm_caller evaluates directly without circular policy invocation.
    RETURN EXISTS (
        SELECT 1
        FROM public.company_memberships cm_target
        WHERE cm_target.user_id = target_profile_id
          AND cm_target.status = 'active'
          AND cm_target.company_id IN (
              SELECT cm_caller.company_id
              FROM public.company_memberships cm_caller
              WHERE cm_caller.user_id = auth.uid()
                AND cm_caller.status = 'active'
          )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_profile_accessible(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_profile_accessible(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_profile_accessible(UUID) IS
'ERPThrive Security Helper: Verifies caller and target share an active company membership for profile inspection.';

-- -----------------------------------------------------------------------------
-- 2. RESTRUCTURE public.company_memberships SELECT POLICY (BREAK RECURSION)
--    Remove recursive policy calling has_company_access and enforce that
--    authenticated callers can only select their own membership rows directly.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view company roster" ON public.company_memberships;
DROP POLICY IF EXISTS "Users can view own company memberships" ON public.company_memberships;

-- Base Non-Recursive SELECT Policy:
-- Every authenticated user can view their OWN membership record directly.
-- Because this compares user_id with auth.uid() on the row itself, it involves
-- no table queries, no joins, no function calls, and CANNOT recurse.
-- This immediately satisfies has_company_access(), has_company_permission(),
-- and get_user_hierarchy_level() with zero recursion.
CREATE POLICY "Users can view own company memberships"
    ON public.company_memberships FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. RESTRUCTURE public.user_profiles SELECT POLICY (ELIMINATE JOIN RECURSION)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view relevant profiles" ON public.user_profiles;

CREATE POLICY "Users can view relevant profiles"
    ON public.user_profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() OR
        public.is_profile_accessible(id)
    );

COMMIT;

-- =============================================================================
-- End of Migration: 20261021000001_fix_rls_recursion_company_memberships.sql
-- =============================================================================
