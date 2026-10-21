-- =============================================================================
-- ERPThrive — Module 1: PostgreSQL RLS Integration Test Suite
-- File: supabase/tests/rls_integration_test.sql
-- Description: Exercises real PostgreSQL RLS policies across multi-tenant
--              boundaries using transactionally isolated test actors.
-- Execution: Can be run via psql or Supabase CLI (e.g. psql $DB_URL -f ...)
-- Safety: Enclosed in a transaction that ends with ROLLBACK. Leaves 0 test artifacts.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. SETUP TEST FIXTURES (Real entities provisioned inside transaction)
-- -----------------------------------------------------------------------------

-- Create two real auth user IDs for simulation
DO $$
DECLARE
    v_user_acme_admin UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
    v_user_acme_staff UUID := 'a0000000-0000-0000-0000-000000000002'::uuid;
    v_user_beta_admin UUID := 'b0000000-0000-0000-0000-000000000001'::uuid;
    v_user_unassigned UUID := 'c0000000-0000-0000-0000-000000000001'::uuid;

    v_company_acme UUID;
    v_company_beta UUID;
    v_branch_acme_hq UUID;
    v_branch_beta_hq UUID;

    v_count INT;
    v_roster_count INT;
BEGIN
    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'ERPThrive RLS Policy Integration Test Runner Starting...';
    RAISE NOTICE '=======================================================';

    -- Step 1.1: Ensure auth users exist in auth.users schema (if available) or user_profiles
    INSERT INTO public.user_profiles (id, email, full_name, status) VALUES
        (v_user_acme_admin, 'admin@acme.corp', 'Acme Administrator', 'active'),
        (v_user_acme_staff, 'staff@acme.corp', 'Acme Staff Clerk', 'active'),
        (v_user_beta_admin, 'admin@beta.org', 'Beta Administrator', 'active'),
        (v_user_unassigned, 'user@unassigned.net', 'Unassigned User', 'active')
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

    -- Step 1.2: Create Company A (Acme Corp)
    INSERT INTO public.companies (id, legal_name, display_name, country, base_currency, timezone, status)
    VALUES (gen_random_uuid(), 'Acme Corporation Global LLC', 'Acme Global', 'US', 'USD', 'UTC', 'active')
    RETURNING id INTO v_company_acme;

    -- Step 1.3: Create Company B (Beta Logistics)
    INSERT INTO public.companies (id, legal_name, display_name, country, base_currency, timezone, status)
    VALUES (gen_random_uuid(), 'Beta Logistics Holdings Inc', 'Beta Logistics', 'GB', 'GBP', 'UTC', 'active')
    RETURNING id INTO v_company_beta;

    -- Step 1.4: Assign Memberships
    -- Acme Admin -> COMPANY_ADMIN in Acme
    INSERT INTO public.company_memberships (company_id, user_id, role_id, status)
    VALUES (v_company_acme, v_user_acme_admin, 'COMPANY_ADMIN', 'active');

    -- Acme Staff -> STAFF_USER in Acme
    INSERT INTO public.company_memberships (company_id, user_id, role_id, status)
    VALUES (v_company_acme, v_user_acme_staff, 'STAFF_USER', 'active');

    -- Beta Admin -> COMPANY_ADMIN in Beta
    INSERT INTO public.company_memberships (company_id, user_id, role_id, status)
    VALUES (v_company_beta, v_user_beta_admin, 'COMPANY_ADMIN', 'active');

    -- Step 1.5: Create Branches
    INSERT INTO public.branches (company_id, name, code, is_headquarters, status)
    VALUES (v_company_acme, 'Acme World HQ', 'HQ-ACME-01', TRUE, 'active')
    RETURNING id INTO v_branch_acme_hq;

    INSERT INTO public.branches (company_id, name, code, is_headquarters, status)
    VALUES (v_company_beta, 'Beta London HQ', 'HQ-BETA-01', TRUE, 'active')
    RETURNING id INTO v_branch_beta_hq;

    -- Step 1.6: Insert Audit Logs
    INSERT INTO public.audit_logs (company_id, actor_id, actor_email, action, target_type, target_id) VALUES
        (v_company_acme, v_user_acme_admin, 'admin@acme.corp', 'company.create', 'company', v_company_acme::text),
        (v_company_beta, v_user_beta_admin, 'admin@beta.org', 'company.create', 'company', v_company_beta::text);

    -- -------------------------------------------------------------------------
    -- TEST 1: Unauthenticated request produces 0 records on tenant tables
    -- -------------------------------------------------------------------------
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);

    SELECT COUNT(*) INTO v_count FROM public.companies;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anon user saw % companies (expected 0)', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.company_memberships;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anon user saw % memberships (expected 0)', v_count;
    END IF;
    RAISE NOTICE 'Test 1 Passed: Unauthenticated request completely denied across tenant tables.';

    -- -------------------------------------------------------------------------
    -- TEST 2: Authenticated user with no active membership sees 0 companies
    -- -------------------------------------------------------------------------
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_unassigned::text, true);

    SELECT COUNT(*) INTO v_count FROM public.companies;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Unassigned user saw % companies (expected 0)', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.branches;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Unassigned user saw % branches (expected 0)', v_count;
    END IF;
    RAISE NOTICE 'Test 2 Passed: Authenticated user without membership cannot access tenant data.';

    -- -------------------------------------------------------------------------
    -- TEST 3: Authorized member sees ONLY their own authorized company
    -- -------------------------------------------------------------------------
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_acme_admin::text, true);

    -- Must see Acme Corp
    SELECT COUNT(*) INTO v_count FROM public.companies WHERE id = v_company_acme;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Acme Admin could not see Acme Corp';
    END IF;

    -- Must NOT see Beta Logistics
    SELECT COUNT(*) INTO v_count FROM public.companies WHERE id = v_company_beta;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Acme Admin could see foreign Beta Logistics company';
    END IF;

    -- Must see Acme branches, but NOT Beta branches
    SELECT COUNT(*) INTO v_count FROM public.branches WHERE company_id = v_company_acme;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Acme Admin could not see Acme branches';
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.branches WHERE company_id = v_company_beta;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Acme Admin saw foreign Beta branches';
    END IF;
    RAISE NOTICE 'Test 3 Passed: Authorized member sees authorized company; cross-tenant access blocked.';

    -- -------------------------------------------------------------------------
    -- TEST 4: Membership Table Non-Recursive Self-Access
    -- -------------------------------------------------------------------------
    -- Acme Admin querying company_memberships directly sees their own membership
    SELECT COUNT(*) INTO v_count FROM public.company_memberships;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Acme Admin direct SELECT returned % rows (expected 1 self-membership)', v_count;
    END IF;
    RAISE NOTICE 'Test 4 Passed: company_memberships direct SELECT returns caller self-membership without 42P17 recursion.';

    -- -------------------------------------------------------------------------
    -- TEST 5: Company Memberships Strict Isolation (Self-Access Only)
    -- -------------------------------------------------------------------------
    -- Switch to Acme Staff
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_acme_staff::text, true);

    -- Acme Staff querying company_memberships sees only their own row (1 row)
    SELECT COUNT(*) INTO v_count FROM public.company_memberships;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Acme Staff direct SELECT returned % rows (expected 1)', v_count;
    END IF;

    -- Acme Staff cannot see Acme Admin's membership row
    SELECT COUNT(*) INTO v_count FROM public.company_memberships WHERE user_id = v_user_acme_admin;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Acme Staff saw Acme Admin membership';
    END IF;
    RAISE NOTICE 'Test 5 Passed: company_memberships enforces strict self-access isolation across all users.';

    -- -------------------------------------------------------------------------
    -- TEST 6: User Profiles privacy via is_profile_accessible
    -- -------------------------------------------------------------------------
    -- Acme Admin can see Acme Staff profile
    SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_acme_staff;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Acme Admin could not view co-worker Acme Staff profile';
    END IF;

    -- Acme Admin CANNOT see Beta Admin profile (no shared company)
    SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_beta_admin;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Acme Admin saw foreign Beta Admin profile';
    END IF;
    RAISE NOTICE 'Test 6 Passed: user_profiles isolates co-workers and blocks foreign users.';

    -- -------------------------------------------------------------------------
    -- TEST 7: Fine-grained branch creation and audit log isolation
    -- -------------------------------------------------------------------------
    -- Acme Admin can see Acme audit logs
    SELECT COUNT(*) INTO v_count FROM public.audit_logs WHERE company_id = v_company_acme;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Acme Admin could not view Acme audit logs';
    END IF;

    -- Switch to Acme Staff user
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_acme_staff::text, true);

    -- Acme Staff user CANNOT see audit logs (lacks admin:audit:read)
    SELECT COUNT(*) INTO v_count FROM public.audit_logs WHERE company_id = v_company_acme;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Acme Staff user saw audit logs without permission';
    END IF;
    RAISE NOTICE 'Test 7 Passed: Audit log fine-grained permissions enforced.';

    -- -------------------------------------------------------------------------
    -- TEST 8: Anti-Privilege Escalation & Self-Role Change Prevention
    -- -------------------------------------------------------------------------
    -- Switch back to Acme Admin
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_acme_admin::text, true);

    -- Attempt to update own membership role to SUPER_ADMIN must be rejected
    UPDATE public.company_memberships
    SET role_id = 'SUPER_ADMIN'
    WHERE user_id = v_user_acme_admin;

    -- Verify role was NOT updated
    SELECT role_id INTO v_count FROM public.company_memberships WHERE user_id = v_user_acme_admin;
    -- (v_count here represents query success check)
    IF EXISTS (SELECT 1 FROM public.company_memberships WHERE user_id = v_user_acme_admin AND role_id = 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'TEST 8 FAILED: Self-role escalation was permitted!';
    END IF;
    RAISE NOTICE 'Test 8 Passed: Anti-privilege self-role escalation strictly prevented.';

    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'ALL 8 RLS INTEGRATION TESTS PASSED SUCCESSFULLY!';
    RAISE NOTICE '=======================================================';
END;
$$;

-- Always rollback so the test execution is 100% non-destructive and leaves 0 trace
ROLLBACK;
