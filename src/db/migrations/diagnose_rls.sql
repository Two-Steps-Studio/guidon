-- ============================================================
-- DIAGNOSTIC SCRIPT FOR ORGANIZATIONS RLS ISSUE
-- ============================================================

-- 1. Check current RLS policies on organizations
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'organizations';

-- 2. Check if RLS is enabled
SELECT 
    relname AS table_name,
    relrowsecurity AS rls_enabled
FROM pg_class 
WHERE relname = 'organizations';

-- 3. Check existing triggers on organizations
SELECT 
    t.tgname AS trigger_name,
    p.proname AS function_name,
    n.nspname AS function_schema
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE c.relname = 'organizations'
AND NOT t.tgisinternal;

-- 4. Check if private schema and functions exist
SELECT 
    n.nspname AS schema_name,
    p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private'
AND p.proname IN ('is_org_member', 'org_role', 'handle_new_organization');

-- 5. Test current user context
SELECT 
    auth.uid() AS current_user_id,
    current_user AS database_user;

-- 6. Check if there are any organizations
SELECT COUNT(*) as organization_count FROM public.organizations;

-- 7. Check organization_members table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'organizations' 
AND table_schema = 'public'
ORDER BY ordinal_position;
