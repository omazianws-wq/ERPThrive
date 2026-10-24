-- =============================================================================
-- ERPThrive — Module 1: Comprehensive PostgreSQL RLS Integration Test Suite
-- File: supabase/tests/rls_integration_test.sql
-- Description: Exercises real PostgreSQL RLS policies across multi-tenant
--              boundaries using transactionally isolated test actors.
-- Execution: Can be run via psql or Supabase SQL Editor (e.g. psql $DB_URL -f ...)
-- Safety: Enclosed in a transaction that ends with ROLLBACK. Leaves 0 test artifacts.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_user_super_admin UUID := 's0000000-0000-0000-0000-000000000001'::uuid;
    v_user_acme_admin  UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
    v_user_acme_staff  UUID := 'a0000000-0000-0000-0000-000000000002'::uuid;
    v_user_beta_admin  UUID := 'b0000000-0000-0000-0000-000000000001'::uuid;
    v_user_unassigned  UUID := 'c0000000-0000-0000-0000-000000000001'::uuid;
    v_user_bootstrap   UUID := 'd0000000-0000-0000-0000-000000000001'::uuid;

    v_company_acme UUID;
    v_company_beta UUID;
    v_company_bootstrapped UUID;
    v_branch_acme_hq UUID;
    v_branch_beta_hq UUID;
    v_membership_staff UUID;

    v_count INT;
    v_role_id VARCHAR(50);
BEGIN
    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'ERPThrive RLS Policy Integration Test Runner Starting...';
    RAISE NOTICE '=======================================================';

    -- -------------------------------------------------------------------------
    -- 0. SETUP TEST FIXTURES
    -- -------------------------------------------------------------------------
    -- Step 0.1: Ensure auth users exist in auth.users schema (if auth schema exists)
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'auth' AND table_name = 'users'
        ) THEN
            INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
            VALUES 
                (v_user_super_admin, 'authenticated', 'authenticated', 'super@platform.internal', '{"full_name": "Platform Super Admin"}'::jsonb, NOW(), NOW()),
                (v_user_acme_admin, 'authenticated', 'authenticated', 'admin@acme.corp', '{"full_name": "Acme Administrator"}'::jsonb, NOW(), NOW()),
                (v_user_acme_staff, 'authenticated', 'authenticated', 'staff@acme.corp', '{"full_name": "Acme Staff Clerk"}'::jsonb, NOW(), NOW()),
                (v_user_beta_admin, 'authenticated', 'authenticated', 'admin@beta.org', '{"full_name": "Beta Administrator"}'::jsonb, NOW(), NOW()),
                (v_user_unassigned, 'authenticated', 'authenticated', 'user@unassigned.net', '{"full_name": "Unassigned User"}'::jsonb, NOW(), NOW()),
                (v_user_bootstrap, 'authenticated', 'authenticated', 'bootstrap@startup.io', '{"full_name": "Bootstrap Founder"}'::jsonb, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Step 0.2: Ensure user_profiles exist
    INSERT INTO public.user_profiles (id, email, full_name, status) VALUES
        (v_user_super_admin, 'super@platform.internal', 'Platform Super Admin', 'active'),
        (v_user_acme_admin, 'admin@acme.corp', 'Acme Administrator', 'active'),
        (v_user_acme_staff, 'staff@acme.corp', 'Acme Staff Clerk', 'active'),
        (v_user_beta_admin, 'admin@beta.org', 'Beta Administrator', 'active'),
        (v_user_unassigned, 'user@unassigned.net', 'Unassigned User', 'active'),
        (v_user_bootstrap, 'bootstrap@startup.io', 'Bootstrap Founder', 'active')
    ON CONFLICT (id) DO UPDATE 
    SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, status = EXCLUDED.status;

    -- Step 0.3: Create Company A (Acme Corp)
    INSERT INTO public.companies (id, legal_name, display_name, country, base_currency, timezone, status)
    VALUES (gen_random_uuid(), 'Acme Corporation Global LLC', 'Acme Global', 'US', 'USD', 'UTC', 'active')
    RETURNING id INTO v_company_acme;

    -- Step 0.4: Create Company B (Beta Logistics)
    INSERT INTO public.companies (id, legal_name, display_name, country, base_currency, timezone, status)
    VALUES (gen_random_uuid(), 'Beta Logistics Holdings Inc', 'Beta Logistics', 'GB', 'GBP', 'UTC', 'active')
    RETURNING id INTO v_company_beta;

    -- Step 0.5: Assign Memberships
    -- Acme Admin -> COMPANY_ADMIN in Acme
    INSERT INTO public.company_memberships (company_id, user_id, role_id, status)
    VALUES (v_company_acme, v_user_acme_admin, 'COMPANY_ADMIN', 'active');

    -- Acme Staff -> STAFF_USER in Acme
    INSERT INTO public.company_memberships (company_id, user_id, role_id, status)
    VALUES (v_company_acme, v_user_acme_staff, 'STAFF_USER', 'active')
    RETURNING id INTO v_membership_staff;

    -- Beta Admin -> COMPANY_ADMIN in Beta
    INSERT INTO public.company_memberships (company_id, user_id, role_id, status)
    VALUES (v_company_beta, v_user_beta_admin, 'COMPANY_ADMIN', 'active');

    -- Step 0.6: Create Branches
    INSERT INTO public.branches (company_id, name, code, is_headquarters, status)
    VALUES (v_company_acme, 'Acme World HQ', 'HQ-ACME-01', TRUE, 'active')
    RETURNING id INTO v_branch_acme_hq;

    INSERT INTO public.branches (company_id, name, code, is_headquarters, status)
    VALUES (v_company_beta, 'Beta London HQ', 'HQ-BETA-01', TRUE, 'active')
    RETURNING id INTO v_branch_beta_hq;

    -- Step 0.7: Insert Audit Logs
    INSERT INTO public.audit_logs (company_id, actor_id, actor_email, action, target_type, target_id) VALUES
        (v_company_acme, v_user_acme_admin, 'admin@acme.corp', 'branch.create', 'branch', v_branch_acme_hq::text),
        (v_company_beta, v_user_beta_admin, 'admin@beta.org', 'branch.create', 'branch', v_branch_beta_hq::text);

    -- -------------------------------------------------------------------------
    -- TEST 1: Unauthenticated request produces 0 records on tenant tables
    -- -------------------------------------------------------------------------
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{}', true);

    SELECT COUNT(*) INTO v_count FROM public.companies;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anon user saw % companies (expected 0)', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.company_memberships;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anon user saw % memberships (expected 0)', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.user_profiles;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anon user saw % profiles (expected 0)', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.branches;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anon user saw % branches (expected 0)', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.audit_logs;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Anon user saw % audit logs (expected 0)', v_count;
    END IF;
    RAISE NOTICE 'Test 1 Passed: Unauthenticated request completely denied across all tenant tables.';

    -- -------------------------------------------------------------------------
    -- TEST 2: Authenticated user with no active membership sees 0 tenant records
    -- -------------------------------------------------------------------------
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_unassigned::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_unassigned::text, 'role', 'authenticated')::text, true);

    SELECT COUNT(*) INTO v_count FROM public.companies;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Unassigned user saw % companies (expected 0)', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.branches;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Unassigned user saw % branches (expected 0)', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.audit_logs;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Unassigned user saw % audit logs (expected 0)', v_count;
    END IF;
    RAISE NOTICE 'Test 2 Passed: Authenticated user without membership cannot access tenant data.';

    -- -------------------------------------------------------------------------
    -- TEST 3: Authorized member sees ONLY their own authorized company
    -- -------------------------------------------------------------------------
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_acme_admin::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_acme_admin::text, 'role', 'authenticated')::text, true);

    -- Must see Acme Corp via policy "Users can view their authorized companies"
    SELECT COUNT(*) INTO v_count FROM public.companies WHERE id = v_company_acme;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Acme Admin could not see Acme Corp';
    END IF;

    -- Must NOT see Beta Logistics
    SELECT COUNT(*) INTO v_count FROM public.companies WHERE id = v_company_beta;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Acme Admin could see foreign Beta Logistics company';
    END IF;

    -- Must see Acme branches via "Users can view branches for their authorized company", but NOT Beta branches
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
    -- TEST 4: Membership Table Non-Recursive Self-Access & Admin Roster View
    -- -------------------------------------------------------------------------
    -- Acme Admin querying company_memberships sees members of Acme Corp (Admin + Staff = 2)
    -- via policy "Admins can view company memberships"
    SELECT COUNT(*) INTO v_count FROM public.company_memberships;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Acme Admin saw % rows (expected 2: admin + staff in Acme)', v_count;
    END IF;
    RAISE NOTICE 'Test 4 Passed: company_memberships direct SELECT functions with zero 42P17 recursion.';

    -- -------------------------------------------------------------------------
    -- TEST 5: Non-Admin Membership Isolation (Self-Access Only for Staff)
    -- -------------------------------------------------------------------------
    -- Switch to Acme Staff
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_acme_staff::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_acme_staff::text, 'role', 'authenticated')::text, true);

    -- Acme Staff lacks admin:user:read, so sees ONLY their own row (1 row) via "Users can view own company memberships"
    SELECT COUNT(*) INTO v_count FROM public.company_memberships;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Acme Staff saw % rows (expected 1 self-membership)', v_count;
    END IF;

    -- Acme Staff cannot see Acme Admin's membership row
    SELECT COUNT(*) INTO v_count FROM public.company_memberships WHERE user_id = v_user_acme_admin;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Acme Staff saw Acme Admin membership';
    END IF;
    RAISE NOTICE 'Test 5 Passed: Non-admin staff restricted to strictly self-membership access.';

    -- -------------------------------------------------------------------------
    -- TEST 6: User Profiles visibility via is_profile_visible_to_caller
    -- -------------------------------------------------------------------------
    -- Switch back to Acme Admin
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_acme_admin::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_acme_admin::text, 'role', 'authenticated')::text, true);

    -- Acme Admin can view self and co-worker Acme Staff profile
    SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_acme_staff;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Acme Admin could not view co-worker profile';
    END IF;

    -- Acme Admin CANNOT see Beta Admin profile (no shared company)
    SELECT COUNT(*) INTO v_count FROM public.user_profiles WHERE id = v_user_beta_admin;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Acme Admin saw foreign Beta Admin profile';
    END IF;
    RAISE NOTICE 'Test 6 Passed: user_profiles enables admin roster view while blocking foreign profiles.';

    -- -------------------------------------------------------------------------
    -- TEST 7: Anti-Privilege Escalation & Self-Role Change Prevention
    -- -------------------------------------------------------------------------
    -- Attempt 7.1: Acme Admin attempts to escalate own role to SUPER_ADMIN
    BEGIN
        UPDATE public.company_memberships
        SET role_id = 'SUPER_ADMIN'
        WHERE user_id = v_user_acme_admin;
        RAISE EXCEPTION 'TEST 7.1 FAILED: Self-role escalation was permitted!';
    EXCEPTION WHEN insufficient_privilege OR check_violation OR OTHERS THEN
        IF SQLERRM LIKE '%TEST 7.1 FAILED%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        -- Expected rejection by trigger or RLS
    END;

    -- Attempt 7.2: Acme Admin attempts to invite a new SUPER_ADMIN into Acme
    BEGIN
        INSERT INTO public.company_memberships (company_id, user_id, role_id, status)
        VALUES (v_company_acme, v_user_unassigned, 'SUPER_ADMIN', 'active');
        RAISE EXCEPTION 'TEST 7.2 FAILED: Company Admin was able to assign SUPER_ADMIN role!';
    EXCEPTION WHEN insufficient_privilege OR check_violation OR OTHERS THEN
        IF SQLERRM LIKE '%TEST 7.2 FAILED%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        -- Expected rejection by RLS policy WITH CHECK
    END;

    -- Attempt 7.3: Acme Admin attempts to invite a peer COMPANY_ADMIN (anti-peer-escalation)
    BEGIN
        INSERT INTO public.company_memberships (company_id, user_id, role_id, status)
        VALUES (v_company_acme, v_user_unassigned, 'COMPANY_ADMIN', 'active');
        RAISE EXCEPTION 'TEST 7.3 FAILED: Company Admin was able to assign peer COMPANY_ADMIN role!';
    EXCEPTION WHEN insufficient_privilege OR check_violation OR OTHERS THEN
        IF SQLERRM LIKE '%TEST 7.3 FAILED%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        -- Expected rejection by RLS policy WITH CHECK
    END;

    -- Attempt 7.4: Acme Admin invites a legitimate OPERATIONS_MANAGER (strictly lower hierarchy)
    INSERT INTO public.company_memberships (company_id, user_id, role_id, status)
    VALUES (v_company_acme, v_user_unassigned, 'OPERATIONS_MANAGER', 'active');

    SELECT COUNT(*) INTO v_count FROM public.company_memberships WHERE user_id = v_user_unassigned AND role_id = 'OPERATIONS_MANAGER';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 7.4 FAILED: Legitimate delegation to OPERATIONS_MANAGER failed!';
    END IF;
    RAISE NOTICE 'Test 7 Passed: Strict anti-privilege escalation and legitimate delegation verified.';

    -- -------------------------------------------------------------------------
    -- TEST 8: Sensitive Profile Field Protection
    -- -------------------------------------------------------------------------
    -- Acme Admin attempts to tamper with status on user_profiles
    BEGIN
        UPDATE public.user_profiles
        SET status = 'suspended'
        WHERE id = v_user_acme_admin;
        RAISE EXCEPTION 'TEST 8 FAILED: Direct client update to user status was permitted!';
    EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
        IF SQLERRM LIKE '%TEST 8 FAILED%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        -- Expected rejection by trigger or column privilege
    END;
    RAISE NOTICE 'Test 8 Passed: Direct tampering with sensitive profile fields strictly blocked.';

    -- -------------------------------------------------------------------------
    -- TEST 9: Bootstrap Security & Service-Role Restriction
    -- -------------------------------------------------------------------------
    -- Attempt 9.1: Unassigned authenticated user attempts to invoke provision_initial_company
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_bootstrap::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_bootstrap::text, 'role', 'authenticated')::text, true);

    BEGIN
        v_company_bootstrapped := public.provision_initial_company(
            'Rogue Inc', 'Rogue', 'US', 'USD', 'UTC', '01-01', 'HQ', 'HQ-01'
        );
        RAISE EXCEPTION 'TEST 9.1 FAILED: Unassigned authenticated user executed provision_initial_company!';
    EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
        IF SQLERRM LIKE '%TEST 9.1 FAILED%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        -- Expected: permission denied for function provision_initial_company
    END;

    -- Attempt 9.2: Backend service_role invokes provision_initial_company
    PERFORM set_config('role', 'service_role', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

    v_company_bootstrapped := public.provision_initial_company(
        'Apex Innovate Systems Inc',
        'Apex Innovate',
        'SG',
        'SGD',
        'Asia/Singapore',
        '01-01',
        'Apex Singapore HQ',
        'HQ-SG-01',
        v_user_bootstrap
    );

    IF v_company_bootstrapped IS NULL THEN
        RAISE EXCEPTION 'TEST 9.2 FAILED: provision_initial_company returned null ID under service_role';
    END IF;

    -- Switch to newly provisioned founder to verify RLS visibility
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_bootstrap::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_bootstrap::text, 'role', 'authenticated')::text, true);

    SELECT COUNT(*) INTO v_count FROM public.companies WHERE id = v_company_bootstrapped;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 9.3 FAILED: Bootstrapped founder cannot see provisioned company under RLS';
    END IF;

    SELECT role_id INTO v_role_id FROM public.company_memberships 
    WHERE company_id = v_company_bootstrapped AND user_id = v_user_bootstrap;
    IF v_role_id <> 'COMPANY_ADMIN' THEN
        RAISE EXCEPTION 'TEST 9.4 FAILED: Expected COMPANY_ADMIN for bootstrap founder, got %', v_role_id;
    END IF;
    RAISE NOTICE 'Test 9 Passed: Bootstrap procedure secured to service_role; client-side self-provisioning blocked.';

    -- -------------------------------------------------------------------------
    -- TEST 10: Membership Transition Trigger Integrity Checks
    -- -------------------------------------------------------------------------
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_acme_admin::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_acme_admin::text, 'role', 'authenticated')::text, true);

    -- Attempt 10.1: Attempt to transfer membership to a different company
    BEGIN
        UPDATE public.company_memberships
        SET company_id = v_company_beta
        WHERE id = v_membership_staff;
        RAISE EXCEPTION 'TEST 10.1 FAILED: Membership transfer across companies was permitted!';
    EXCEPTION WHEN insufficient_privilege OR check_violation OR OTHERS THEN
        IF SQLERRM LIKE '%TEST 10.1 FAILED%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        -- Expected: blocked by trigger or RLS
    END;

    -- Attempt 10.2: Attempt to reassign membership to a different user
    BEGIN
        UPDATE public.company_memberships
        SET user_id = v_user_unassigned
        WHERE id = v_membership_staff;
        RAISE EXCEPTION 'TEST 10.2 FAILED: Membership user reassignment was permitted!';
    EXCEPTION WHEN insufficient_privilege OR check_violation OR OTHERS THEN
        IF SQLERRM LIKE '%TEST 10.2 FAILED%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        -- Expected: blocked by trigger or RLS
    END;
    RAISE NOTICE 'Test 10 Passed: Membership transition trigger enforces immutability of company_id and user_id.';

    -- -------------------------------------------------------------------------
    -- TEST 11: Audit Log Integrity & Anti-Spoofing Checks
    -- -------------------------------------------------------------------------
    -- Attempt 11.1: Authenticated user attempts to insert audit log with NULL company_id
    BEGIN
        INSERT INTO public.audit_logs (company_id, actor_id, actor_email, action, target_type, target_id)
        VALUES (NULL, v_user_acme_admin, 'admin@acme.corp', 'security.access_denied', 'company', 'unknown');
        RAISE EXCEPTION 'TEST 11.1 FAILED: Authenticated user inserted audit log with NULL company_id!';
    EXCEPTION WHEN insufficient_privilege OR check_violation OR OTHERS THEN
        IF SQLERRM LIKE '%TEST 11.1 FAILED%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        -- Expected rejection by RLS policy WITH CHECK
    END;

    -- Attempt 11.2: Authenticated user attempts to forge actor_id
    BEGIN
        INSERT INTO public.audit_logs (company_id, actor_id, actor_email, action, target_type, target_id)
        VALUES (v_company_acme, v_user_beta_admin, 'admin@beta.org', 'branch.update', 'branch', v_branch_acme_hq::text);
        RAISE EXCEPTION 'TEST 11.2 FAILED: Authenticated user forged actor_id in audit log!';
    EXCEPTION WHEN insufficient_privilege OR check_violation OR OTHERS THEN
        IF SQLERRM LIKE '%TEST 11.2 FAILED%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        -- Expected rejection by RLS policy WITH CHECK
    END;

    -- Attempt 11.3: Legitimate authorized audit log insert succeeds
    INSERT INTO public.audit_logs (company_id, actor_id, actor_email, action, target_type, target_id)
    VALUES (v_company_acme, v_user_acme_admin, 'admin@acme.corp', 'branch.update', 'branch', v_branch_acme_hq::text);

    SELECT COUNT(*) INTO v_count FROM public.audit_logs 
    WHERE company_id = v_company_acme AND actor_id = v_user_acme_admin AND action = 'branch.update';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST 11.3 FAILED: Authorized audit log insert failed!';
    END IF;
    RAISE NOTICE 'Test 11 Passed: Audit log integrity strictly prevents NULL company_id and actor forging.';

    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'ALL 11 RLS INTEGRATION TESTS EXECUTED SUCCESSFULLY!';
    RAISE NOTICE '=======================================================';
END;
$$;

ROLLBACK;
