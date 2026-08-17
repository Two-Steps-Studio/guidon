BEGIN;

-- ============================================================
-- GUIDON — FINAL DATABASE + RLS MIGRATION
-- ============================================================
--
-- Designed for the existing Guidon schema.
--
-- DOES NOT:
--   - DROP application tables
--   - DELETE normal application data
--   - recreate the whole database from scratch
--
-- DOES:
--   - clean previous RLS policies
--   - clean old helper functions
--   - safely remove dependent triggers
--   - fix foreign keys
--   - add membership uniqueness
--   - create secure RLS helper functions
--   - fix organization creation
--   - auto-create organization owner
--   - fix project creation
--   - auto-create project owner
--   - protect the last owner
--   - secure project visibility
--   - secure all project resources
--   - prevent cross-project context relations
--   - secure activity logs
--   - secure invitations
--   - add updated_at triggers
--   - backfill missing owners for existing data
--
-- ============================================================


-- ============================================================
-- 1. REQUIRED EXTENSION
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 2. PRIVATE SCHEMA
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;


-- ============================================================
-- 3. REMOVE EXISTING POLICIES
-- ============================================================
--
-- We do this dynamically so old policy names do not matter.
-- ============================================================

DO $$
DECLARE
r RECORD;
BEGIN

FOR r IN
SELECT
    schemaname,
    tablename,
    policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
                    'profiles',
                    'organizations',
                    'organization_members',
                    'projects',
                    'project_members',
                    'tasks',
                    'roadmap_phases',
                    'project_files',
                    'technologies',
                    'invitations',
                    'activity_logs',
                    'context_decisions',
                    'context_relations',
                    'context_sources',
                    'project_memory',
                    'task_comments'
    )
    LOOP

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            r.policyname,
            r.schemaname,
            r.tablename
        );

END LOOP;

END
$$;


-- ============================================================
-- 4. REMOVE KNOWN AUTH/OWNERSHIP TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created
ON auth.users;

DROP TRIGGER IF EXISTS on_organization_created
ON public.organizations;

DROP TRIGGER IF EXISTS on_project_created
ON public.projects;


-- ============================================================
-- 5. REMOVE EVERY TRIGGER DEPENDING ON THE OLD
--    public.update_updated_at_column()
--
-- IMPORTANT:
-- Older migrations used different names such as:
--   update_phases_updated_at
--
-- Therefore we discover them automatically.
-- ============================================================

DO $$
DECLARE
r RECORD;
BEGIN

FOR r IN
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    t.tgname  AS trigger_name
FROM pg_trigger t
         JOIN pg_class c
              ON c.oid = t.tgrelid
         JOIN pg_namespace n
              ON n.oid = c.relnamespace
         JOIN pg_proc p
              ON p.oid = t.tgfoid
         JOIN pg_namespace pn
              ON pn.oid = p.pronamespace
WHERE NOT t.tgisinternal
  AND pn.nspname = 'public'
  AND p.proname = 'update_updated_at_column'
    LOOP

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON %I.%I',
            r.trigger_name,
            r.schema_name,
            r.table_name
        );

END LOOP;

END
$$;


-- ============================================================
-- 6. REMOVE ANY OLD TRIGGERS DEPENDING ON FUNCTIONS WE WILL DROP
-- ============================================================
--
-- IMPORTANT: This MUST come before DROP FUNCTION calls
-- to avoid dependency errors
-- ============================================================

DO $$
DECLARE
r RECORD;
BEGIN

-- Drop ALL triggers that depend on ANY update_updated_at_column function
-- regardless of which schema the function or trigger is in
FOR r IN
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    t.tgname  AS trigger_name
FROM pg_trigger t
         JOIN pg_class c
              ON c.oid = t.tgrelid
         JOIN pg_namespace n
              ON n.oid = c.relnamespace
         JOIN pg_proc p
              ON p.oid = t.tgfoid
         JOIN pg_namespace pn
              ON pn.oid = p.pronamespace
WHERE NOT t.tgisinternal
  AND p.proname = 'update_updated_at_column'
    LOOP

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON %I.%I',
            r.trigger_name,
            r.schema_name,
            r.table_name
        );

END LOOP;

-- Drop protection triggers
FOR r IN
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    t.tgname  AS trigger_name
FROM pg_trigger t
         JOIN pg_class c
              ON c.oid = t.tgrelid
         JOIN pg_namespace n
              ON n.oid = c.relnamespace
         JOIN pg_proc p
              ON p.oid = t.tgfoid
         JOIN pg_namespace pn
              ON pn.oid = p.pronamespace
WHERE NOT t.tgisinternal
  AND p.proname IN ('protect_org_owner', 'protect_project_owner', 'validate_task')
    LOOP

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON %I.%I',
            r.trigger_name,
            r.schema_name,
            r.table_name
        );

END LOOP;

-- Drop auth/user triggers
FOR r IN
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    t.tgname  AS trigger_name
FROM pg_trigger t
         JOIN pg_class c
              ON c.oid = t.tgrelid
         JOIN pg_namespace n
              ON n.oid = c.relnamespace
         JOIN pg_proc p
              ON p.oid = t.tgfoid
         JOIN pg_namespace pn
              ON pn.oid = p.pronamespace
WHERE NOT t.tgisinternal
  AND p.proname = 'handle_new_user'
    LOOP

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON %I.%I',
            r.trigger_name,
            r.schema_name,
            r.table_name
        );

END LOOP;

-- Drop organization/project creation triggers
FOR r IN
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    t.tgname  AS trigger_name
FROM pg_trigger t
         JOIN pg_class c
              ON c.oid = t.tgrelid
         JOIN pg_namespace n
              ON n.oid = c.relnamespace
         JOIN pg_proc p
              ON p.oid = t.tgfoid
         JOIN pg_namespace pn
              ON pn.oid = p.pronamespace
WHERE NOT t.tgisinternal
  AND p.proname IN ('handle_new_organization', 'handle_new_project')
    LOOP

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON %I.%I',
            r.trigger_name,
            r.schema_name,
            r.table_name
        );

END LOOP;

END
$$;


-- ============================================================
-- 7. DROP OLD PUBLIC FUNCTIONS
--
-- DROP is used intentionally because PostgreSQL cannot change
-- input parameter names with CREATE OR REPLACE FUNCTION.
-- ============================================================

DROP FUNCTION IF EXISTS public.user_org_ids(uuid);
DROP FUNCTION IF EXISTS public.user_org_role(uuid, uuid);

DROP FUNCTION IF EXISTS public.project_member_ids(uuid);
DROP FUNCTION IF EXISTS public.project_member_role(uuid, uuid);

DROP FUNCTION IF EXISTS public.context_entity_project_id(text, uuid);

DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.handle_new_organization();
DROP FUNCTION IF EXISTS public.handle_new_project();

DROP FUNCTION IF EXISTS public.update_updated_at_column();


-- ============================================================
-- 8. DROP FUNCTIONS FROM PREVIOUS FAILED PRIVATE MIGRATIONS
-- ============================================================

DROP FUNCTION IF EXISTS private.is_org_member(uuid);
DROP FUNCTION IF EXISTS private.org_role(uuid);

DROP FUNCTION IF EXISTS private.is_project_member(uuid);
DROP FUNCTION IF EXISTS private.project_role(uuid);

DROP FUNCTION IF EXISTS private.project_access(uuid);

DROP FUNCTION IF EXISTS private.entity_project_id(text, uuid);

DROP FUNCTION IF EXISTS private.handle_new_user();
DROP FUNCTION IF EXISTS private.handle_new_organization();
DROP FUNCTION IF EXISTS private.handle_new_project();

DROP FUNCTION IF EXISTS private.update_updated_at_column();

DROP FUNCTION IF EXISTS private.protect_org_owner();
DROP FUNCTION IF EXISTS private.protect_project_owner();

DROP FUNCTION IF EXISTS private.validate_task();


-- ============================================================
-- 9. FOREIGN KEYS
-- ============================================================


-- PROFILES

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_id_fkey
        FOREIGN KEY (id)
            REFERENCES auth.users(id)
            ON DELETE CASCADE;


-- ORGANIZATIONS

ALTER TABLE public.organizations
DROP CONSTRAINT IF EXISTS organizations_created_by_fkey;

ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_created_by_fkey
        FOREIGN KEY (created_by)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;


-- ORGANIZATION MEMBERS

ALTER TABLE public.organization_members
DROP CONSTRAINT IF EXISTS organization_members_organization_id_fkey;

ALTER TABLE public.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey
        FOREIGN KEY (organization_id)
            REFERENCES public.organizations(id)
            ON DELETE CASCADE;


ALTER TABLE public.organization_members
DROP CONSTRAINT IF EXISTS organization_members_user_id_fkey;

ALTER TABLE public.organization_members
    ADD CONSTRAINT organization_members_user_id_fkey
        FOREIGN KEY (user_id)
            REFERENCES public.profiles(id)
            ON DELETE CASCADE;


-- PROJECTS

ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_organization_id_fkey;

ALTER TABLE public.projects
    ADD CONSTRAINT projects_organization_id_fkey
        FOREIGN KEY (organization_id)
            REFERENCES public.organizations(id)
            ON DELETE CASCADE;


ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_created_by_fkey;

ALTER TABLE public.projects
    ADD CONSTRAINT projects_created_by_fkey
        FOREIGN KEY (created_by)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;


-- PROJECT MEMBERS

ALTER TABLE public.project_members
DROP CONSTRAINT IF EXISTS project_members_project_id_fkey;

ALTER TABLE public.project_members
    ADD CONSTRAINT project_members_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


ALTER TABLE public.project_members
DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;

ALTER TABLE public.project_members
    ADD CONSTRAINT project_members_user_id_fkey
        FOREIGN KEY (user_id)
            REFERENCES public.profiles(id)
            ON DELETE CASCADE;


-- TASKS

ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_assignee_id_fkey
        FOREIGN KEY (assignee_id)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;


ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_created_by_fkey
        FOREIGN KEY (created_by)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;


-- ROADMAP

ALTER TABLE public.roadmap_phases
DROP CONSTRAINT IF EXISTS roadmap_phases_project_id_fkey;

ALTER TABLE public.roadmap_phases
    ADD CONSTRAINT roadmap_phases_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


ALTER TABLE public.roadmap_phases
DROP CONSTRAINT IF EXISTS roadmap_phases_created_by_fkey;

ALTER TABLE public.roadmap_phases
    ADD CONSTRAINT roadmap_phases_created_by_fkey
        FOREIGN KEY (created_by)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;


-- FILES

ALTER TABLE public.project_files
DROP CONSTRAINT IF EXISTS project_files_project_id_fkey;

ALTER TABLE public.project_files
    ADD CONSTRAINT project_files_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


ALTER TABLE public.project_files
DROP CONSTRAINT IF EXISTS project_files_uploaded_by_fkey;

ALTER TABLE public.project_files
    ADD CONSTRAINT project_files_uploaded_by_fkey
        FOREIGN KEY (uploaded_by)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;


-- TECHNOLOGIES

ALTER TABLE public.technologies
DROP CONSTRAINT IF EXISTS technologies_project_id_fkey;

ALTER TABLE public.technologies
    ADD CONSTRAINT technologies_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


-- INVITATIONS

ALTER TABLE public.invitations
DROP CONSTRAINT IF EXISTS invitations_organization_id_fkey;

ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_organization_id_fkey
        FOREIGN KEY (organization_id)
            REFERENCES public.organizations(id)
            ON DELETE CASCADE;


ALTER TABLE public.invitations
DROP CONSTRAINT IF EXISTS invitations_project_id_fkey;

ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


ALTER TABLE public.invitations
DROP CONSTRAINT IF EXISTS invitations_invited_by_fkey;

ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_invited_by_fkey
        FOREIGN KEY (invited_by)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;


-- ACTIVITY LOGS

ALTER TABLE public.activity_logs
DROP CONSTRAINT IF EXISTS activity_logs_project_id_fkey;

ALTER TABLE public.activity_logs
    ADD CONSTRAINT activity_logs_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


ALTER TABLE public.activity_logs
DROP CONSTRAINT IF EXISTS activity_logs_organization_id_fkey;

ALTER TABLE public.activity_logs
    ADD CONSTRAINT activity_logs_organization_id_fkey
        FOREIGN KEY (organization_id)
            REFERENCES public.organizations(id)
            ON DELETE CASCADE;


ALTER TABLE public.activity_logs
DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey;

ALTER TABLE public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_fkey
        FOREIGN KEY (user_id)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;


-- CONTEXT DECISIONS

ALTER TABLE public.context_decisions
DROP CONSTRAINT IF EXISTS context_decisions_project_id_fkey;

ALTER TABLE public.context_decisions
    ADD CONSTRAINT context_decisions_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


ALTER TABLE public.context_decisions
DROP CONSTRAINT IF EXISTS context_decisions_made_by_fkey;

ALTER TABLE public.context_decisions
    ADD CONSTRAINT context_decisions_made_by_fkey
        FOREIGN KEY (made_by)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;


-- CONTEXT SOURCES

ALTER TABLE public.context_sources
DROP CONSTRAINT IF EXISTS context_sources_project_id_fkey;

ALTER TABLE public.context_sources
    ADD CONSTRAINT context_sources_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


ALTER TABLE public.context_sources
DROP CONSTRAINT IF EXISTS context_sources_author_fkey;

ALTER TABLE public.context_sources
    ADD CONSTRAINT context_sources_author_fkey
        FOREIGN KEY (author)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;


-- PROJECT MEMORY

ALTER TABLE public.project_memory
DROP CONSTRAINT IF EXISTS project_memory_project_id_fkey;

ALTER TABLE public.project_memory
    ADD CONSTRAINT project_memory_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


ALTER TABLE public.project_memory
DROP CONSTRAINT IF EXISTS project_memory_source_id_fkey;

ALTER TABLE public.project_memory
    ADD CONSTRAINT project_memory_source_id_fkey
        FOREIGN KEY (source_id)
            REFERENCES public.context_sources(id)
            ON DELETE SET NULL;


ALTER TABLE public.project_memory
DROP CONSTRAINT IF EXISTS project_memory_verified_by_fkey;

ALTER TABLE public.project_memory
    ADD CONSTRAINT project_memory_verified_by_fkey
        FOREIGN KEY (verified_by)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;


ALTER TABLE public.project_memory
DROP CONSTRAINT IF EXISTS project_memory_created_by_fkey;

ALTER TABLE public.project_memory
    ADD CONSTRAINT project_memory_created_by_fkey
        FOREIGN KEY (created_by)
            REFERENCES public.profiles(id)
            ON DELETE CASCADE;


-- TASK COMMENTS

ALTER TABLE public.task_comments
DROP CONSTRAINT IF EXISTS task_comments_task_id_fkey;

ALTER TABLE public.task_comments
    ADD CONSTRAINT task_comments_task_id_fkey
        FOREIGN KEY (task_id)
            REFERENCES public.tasks(id)
            ON DELETE CASCADE;


ALTER TABLE public.task_comments
DROP CONSTRAINT IF EXISTS task_comments_author_id_fkey;

ALTER TABLE public.task_comments
    ADD CONSTRAINT task_comments_author_id_fkey
        FOREIGN KEY (author_id)
            REFERENCES public.profiles(id)
            ON DELETE CASCADE;


-- ============================================================
-- 10. REMOVE DUPLICATE MEMBERSHIPS
-- ============================================================

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY organization_id, user_id
            ORDER BY
                CASE role
                    WHEN 'owner' THEN 1
                    WHEN 'admin' THEN 2
                    WHEN 'member' THEN 3
                    ELSE 99
                END,
                joined_at NULLS LAST,
                id
        ) AS rn
    FROM public.organization_members
)
DELETE FROM public.organization_members om
    USING ranked r
WHERE om.id = r.id
  AND r.rn > 1;


WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY project_id, user_id
            ORDER BY
                CASE role
                    WHEN 'owner' THEN 1
                    WHEN 'admin' THEN 2
                    WHEN 'developer' THEN 3
                    WHEN 'tester' THEN 4
                    WHEN 'viewer' THEN 5
                    ELSE 99
                END,
                joined_at NULLS LAST,
                id
        ) AS rn
    FROM public.project_members
)
DELETE FROM public.project_members pm
    USING ranked r
WHERE pm.id = r.id
  AND r.rn > 1;


-- ============================================================
-- 11. UNIQUE MEMBERSHIP INDEXES
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS
    uq_organization_members_org_user
    ON public.organization_members (
    organization_id,
    user_id
    );


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_project_members_project_user
    ON public.project_members (
    project_id,
    user_id
    );


-- ============================================================
-- 12. SAFE DATA INTEGRITY CONSTRAINTS
-- ============================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invitations_exactly_one_target'
    ) THEN

ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_exactly_one_target
        CHECK (
            (
                (organization_id IS NOT NULL)::integer +
    (project_id IS NOT NULL)::integer
    ) = 1
    )
    NOT VALID;

END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invitations_valid_role'
    ) THEN

ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_valid_role
        CHECK (
            role IN (
                     'owner',
                     'admin',
                     'member',
                     'developer',
                     'tester',
                     'viewer'
                )
            )
    NOT VALID;

END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tasks_estimated_hours_nonnegative'
    ) THEN

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_estimated_hours_nonnegative
        CHECK (
            estimated_hours IS NULL
                OR estimated_hours >= 0
            )
    NOT VALID;

END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tasks_actual_hours_nonnegative'
    ) THEN

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_actual_hours_nonnegative
        CHECK (
            actual_hours IS NULL
                OR actual_hours >= 0
            )
    NOT VALID;

END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'project_files_size_nonnegative'
    ) THEN

ALTER TABLE public.project_files
    ADD CONSTRAINT project_files_size_nonnegative
        CHECK (
            size_bytes IS NULL
                OR size_bytes >= 0
            )
    NOT VALID;

END IF;


END
$$;


-- ============================================================
-- 13. PRIVATE FUNCTION:
--     ORGANIZATION MEMBERSHIP
-- ============================================================

CREATE FUNCTION private.is_org_member(
    p_organization_id uuid
)
    RETURNS boolean
    LANGUAGE sql
    STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = (SELECT auth.uid())
);
$$;


-- ============================================================
-- 14. PRIVATE FUNCTION:
--     ORGANIZATION ROLE
-- ============================================================

CREATE FUNCTION private.org_role(
    p_organization_id uuid
)
    RETURNS text
    LANGUAGE sql
    STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT om.role
FROM public.organization_members om
WHERE om.organization_id = p_organization_id
  AND om.user_id = (SELECT auth.uid())
    LIMIT 1;
$$;


-- ============================================================
-- 15. PRIVATE FUNCTION:
--     PROJECT MEMBERSHIP
-- ============================================================

CREATE FUNCTION private.is_project_member(
    p_project_id uuid
)
    RETURNS boolean
    LANGUAGE sql
    STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = (SELECT auth.uid())
);
$$;


-- ============================================================
-- 16. PRIVATE FUNCTION:
--     PROJECT ROLE
-- ============================================================

CREATE FUNCTION private.project_role(
    p_project_id uuid
)
    RETURNS text
    LANGUAGE sql
    STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT pm.role
FROM public.project_members pm
WHERE pm.project_id = p_project_id
  AND pm.user_id = (SELECT auth.uid())
    LIMIT 1;
$$;


-- ============================================================
-- 17. PRIVATE FUNCTION:
--     PROJECT ACCESS
-- ============================================================
--
-- PRIVATE:
--   project members only
--
-- ORGANIZATION:
--   organization members + project members
--
-- PUBLIC:
--   any authenticated user
-- ============================================================

CREATE FUNCTION private.project_access(
    p_project_id uuid
)
    RETURNS boolean
    LANGUAGE sql
    STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND (
        (
            p.visibility = 'public'
                AND (SELECT auth.uid()) IS NOT NULL
            )

            OR

        private.is_project_member(
                p.id
        )

            OR

        (
            p.visibility = 'organization'
                AND private.is_org_member(
                    p.organization_id
                    )
            )
        )
);
$$;


-- ============================================================
-- 18. PRIVATE FUNCTION:
--     CONTEXT ENTITY -> PROJECT
-- ============================================================

CREATE FUNCTION private.entity_project_id(
    p_entity_type text,
    p_entity_id uuid
)
    RETURNS uuid
    LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_project_id uuid;
BEGIN

CASE p_entity_type

        WHEN 'project' THEN

SELECT p.id
INTO v_project_id
FROM public.projects p
WHERE p.id = p_entity_id;


WHEN 'task' THEN

SELECT t.project_id
INTO v_project_id
FROM public.tasks t
WHERE t.id = p_entity_id;


WHEN 'phase' THEN

SELECT rp.project_id
INTO v_project_id
FROM public.roadmap_phases rp
WHERE rp.id = p_entity_id;


WHEN 'decision' THEN

SELECT cd.project_id
INTO v_project_id
FROM public.context_decisions cd
WHERE cd.id = p_entity_id;


WHEN 'file' THEN

SELECT pf.project_id
INTO v_project_id
FROM public.project_files pf
WHERE pf.id = p_entity_id;


WHEN 'source' THEN

SELECT cs.project_id
INTO v_project_id
FROM public.context_sources cs
WHERE cs.id = p_entity_id;


WHEN 'memory' THEN

SELECT pm.project_id
INTO v_project_id
FROM public.project_memory pm
WHERE pm.id = p_entity_id;


ELSE

            v_project_id := NULL;

END CASE;

RETURN v_project_id;

END;
$$;


-- ============================================================
-- 19. AUTO-PROFILE FUNCTION
-- ============================================================

CREATE FUNCTION private.handle_new_user()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN

INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url
)
VALUES (
           NEW.id,
           COALESCE(NEW.email, ''),
           NEW.raw_user_meta_data ->> 'full_name',
           NEW.raw_user_meta_data ->> 'avatar_url'
       )
    ON CONFLICT (id)
    DO UPDATE SET
    email = EXCLUDED.email,
               full_name = COALESCE(
               EXCLUDED.full_name,
               public.profiles.full_name
               ),
               avatar_url = COALESCE(
               EXCLUDED.avatar_url,
               public.profiles.avatar_url
               );

RETURN NEW;

END;
$$;


-- ============================================================
-- 20. AUTO ORGANIZATION OWNER
-- ============================================================

CREATE FUNCTION private.handle_new_organization()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN

    -- Auto-set created_by from authenticated user if not provided
    IF NEW.created_by IS NULL THEN
        NEW.created_by := (SELECT auth.uid());
    END IF;

    -- Prevent spoofing: ensure created_by matches authenticated user
    IF (SELECT auth.uid()) IS NOT NULL
       AND NEW.created_by <> (SELECT auth.uid())
       AND current_user <> 'service_role'
    THEN
        RAISE EXCEPTION 'created_by must match authenticated user';
    END IF;

    -- Auto-create owner membership
    INSERT INTO public.organization_members (
        organization_id,
        user_id,
        role
    )
    VALUES (
           NEW.id,
           NEW.created_by,
           'owner'
       )
    ON CONFLICT (
        organization_id,
        user_id
    )
    DO UPDATE SET
    role = 'owner';


RETURN NEW;

END;
$$;


-- ============================================================
-- 21. AUTO PROJECT OWNER
-- ============================================================

CREATE FUNCTION private.handle_new_project()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN

    -- Auto-set created_by from authenticated user if not provided
    IF NEW.created_by IS NULL THEN
        NEW.created_by := (SELECT auth.uid());
    END IF;

    -- Prevent spoofing: ensure created_by matches authenticated user
    IF (SELECT auth.uid()) IS NOT NULL
       AND NEW.created_by <> (SELECT auth.uid())
       AND current_user <> 'service_role'
    THEN
        RAISE EXCEPTION 'created_by must match authenticated user';
    END IF;

    -- Auto-create owner membership
    INSERT INTO public.project_members (
        project_id,
        user_id,
        role
    )
    VALUES (
           NEW.id,
           NEW.created_by,
           'owner'
       )
    ON CONFLICT (
        project_id,
        user_id
    )
    DO UPDATE SET
    role = 'owner';


RETURN NEW;

END;
$$;


-- ============================================================
-- 22. UPDATED_AT FUNCTION
-- ============================================================

CREATE FUNCTION private.update_updated_at_column()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN

    NEW.updated_at = CURRENT_TIMESTAMP;

RETURN NEW;

END;
$$;


-- ============================================================
-- 23. PROTECT LAST ORGANIZATION OWNER
-- ============================================================

CREATE FUNCTION private.protect_org_owner()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
owner_count integer;
BEGIN

    IF TG_OP = 'DELETE' THEN

        IF OLD.role <> 'owner' THEN
            RETURN OLD;
END IF;


SELECT COUNT(*)
INTO owner_count
FROM public.organization_members om
WHERE om.organization_id = OLD.organization_id
  AND om.role = 'owner'
  AND om.id <> OLD.id;


IF owner_count = 0 THEN

            RAISE EXCEPTION
                'Cannot remove the last organization owner';

END IF;


RETURN OLD;

END IF;


    IF TG_OP = 'UPDATE' THEN

        IF OLD.role = 'owner'
           AND NEW.role <> 'owner'
        THEN

SELECT COUNT(*)
INTO owner_count
FROM public.organization_members om
WHERE om.organization_id = OLD.organization_id
  AND om.role = 'owner'
  AND om.id <> OLD.id;


IF owner_count = 0 THEN

                RAISE EXCEPTION
                    'Cannot demote the last organization owner';

END IF;

END IF;

RETURN NEW;

END IF;


RETURN NEW;

END;
$$;


-- ============================================================
-- 24. PROTECT LAST PROJECT OWNER
-- ============================================================

CREATE FUNCTION private.protect_project_owner()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
owner_count integer;
BEGIN

    IF TG_OP = 'DELETE' THEN

        IF OLD.role <> 'owner' THEN
            RETURN OLD;
END IF;


SELECT COUNT(*)
INTO owner_count
FROM public.project_members pm
WHERE pm.project_id = OLD.project_id
  AND pm.role = 'owner'
  AND pm.id <> OLD.id;


IF owner_count = 0 THEN

            RAISE EXCEPTION
                'Cannot remove the last project owner';

END IF;


RETURN OLD;

END IF;


    IF TG_OP = 'UPDATE' THEN

        IF OLD.role = 'owner'
           AND NEW.role <> 'owner'
        THEN

SELECT COUNT(*)
INTO owner_count
FROM public.project_members pm
WHERE pm.project_id = OLD.project_id
  AND pm.role = 'owner'
  AND pm.id <> OLD.id;


IF owner_count = 0 THEN

                RAISE EXCEPTION
                    'Cannot demote the last project owner';

END IF;

END IF;

RETURN NEW;

END IF;


RETURN NEW;

END;
$$;


-- ============================================================
-- 25. TASK VALIDATION
-- ============================================================

CREATE FUNCTION private.validate_task()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
assignee_exists boolean;
    decision_project uuid;
BEGIN

    IF NEW.created_by IS NULL THEN
        NEW.created_by := (SELECT auth.uid());
END IF;


    IF (SELECT auth.uid()) IS NOT NULL
       AND NEW.created_by <> (SELECT auth.uid())
       AND current_user <> 'service_role'
    THEN

        RAISE EXCEPTION
            'created_by must match authenticated user';

END IF;


    IF NEW.assignee_id IS NOT NULL THEN

SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = NEW.project_id
      AND pm.user_id = NEW.assignee_id
)
INTO assignee_exists;


IF NOT assignee_exists THEN

            RAISE EXCEPTION
                'Task assignee must belong to the project';

END IF;

END IF;


    IF NEW.decision_id IS NOT NULL THEN

SELECT cd.project_id
INTO decision_project
FROM public.context_decisions cd
WHERE cd.id = NEW.decision_id;


IF decision_project IS NULL THEN

            RAISE EXCEPTION
                'Referenced decision does not exist';

END IF;


        IF decision_project <> NEW.project_id THEN

            RAISE EXCEPTION
                'Task decision must belong to the same project';

END IF;

END IF;


RETURN NEW;

END;
$$;


-- ============================================================
-- 26. TRIGGERS
-- ============================================================

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION private.handle_new_user();


CREATE TRIGGER on_organization_created
    AFTER INSERT ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION private.handle_new_organization();


CREATE TRIGGER on_project_created
    AFTER INSERT ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION private.handle_new_project();


CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


CREATE TRIGGER update_roadmap_phases_updated_at
    BEFORE UPDATE ON public.roadmap_phases
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


CREATE TRIGGER update_context_decisions_updated_at
    BEFORE UPDATE ON public.context_decisions
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


CREATE TRIGGER update_context_sources_updated_at
    BEFORE UPDATE ON public.context_sources
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


CREATE TRIGGER update_project_memory_updated_at
    BEFORE UPDATE ON public.project_memory
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


CREATE TRIGGER update_task_comments_updated_at
    BEFORE UPDATE ON public.task_comments
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


CREATE TRIGGER protect_organization_owner
    BEFORE UPDATE OR DELETE
ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION private.protect_org_owner();


CREATE TRIGGER protect_project_owner
    BEFORE UPDATE OR DELETE
ON public.project_members
FOR EACH ROW
EXECUTE FUNCTION private.protect_project_owner();


CREATE TRIGGER validate_task_before_write
    BEFORE INSERT OR UPDATE
                         ON public.tasks
                         FOR EACH ROW
                         EXECUTE FUNCTION private.validate_task();


-- ============================================================
-- 27. BACKFILL ORGANIZATION OWNERS
-- ============================================================

INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role
)
SELECT
    o.id,
    o.created_by,
    'owner'
FROM public.organizations o
WHERE o.created_by IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = o.created_by
)
    ON CONFLICT (
    organization_id,
    user_id
)
DO UPDATE SET
    role = 'owner';


-- ============================================================
-- 28. BACKFILL PROJECT OWNERS
-- ============================================================

INSERT INTO public.project_members (
    project_id,
    user_id,
    role
)
SELECT
    p.id,
    p.created_by,
    'owner'
FROM public.projects p
WHERE p.created_by IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = p.created_by
)
  AND EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p.organization_id
      AND om.user_id = p.created_by
)
    ON CONFLICT (
    project_id,
    user_id
)
DO UPDATE SET
    role = 'owner';


-- ============================================================
-- 29. ENABLE RLS
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.context_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.context_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.context_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 30. PROFILES RLS
-- ============================================================

CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
               TO authenticated
               USING (
               id = (SELECT auth.uid())
               );


CREATE POLICY profiles_insert_own
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
    id = (SELECT auth.uid())
);


-- Allow anon role to insert profiles (for new user signup via trigger)
-- This is safe because the trigger enforces id = auth.uid()
CREATE POLICY profiles_insert_trigger
ON public.profiles
FOR INSERT
TO anon
WITH CHECK (
    true
);


CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
                      TO authenticated
                      USING (
                      id = (SELECT auth.uid())
                      )
    WITH CHECK (
                      id = (SELECT auth.uid())
                      );


-- ============================================================
-- 31. ORGANIZATIONS RLS
-- ============================================================

CREATE POLICY organizations_insert
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (
    -- Allow insertion; trigger will set and validate created_by
    true
);


CREATE POLICY organizations_select
ON public.organizations
FOR SELECT
                      TO authenticated
                      USING (
                      private.is_org_member(id)
                      );


CREATE POLICY organizations_update
ON public.organizations
FOR UPDATE
               TO authenticated
               USING (
               private.org_role(id) IN ('owner', 'admin')
               )
    WITH CHECK (
               private.org_role(id) IN ('owner', 'admin')
               );


CREATE POLICY organizations_delete
ON public.organizations
FOR DELETE
TO authenticated
USING (
    private.org_role(id) = 'owner'
);


-- ============================================================
-- 32. ORGANIZATION MEMBERS
-- ============================================================

CREATE POLICY organization_members_select
ON public.organization_members
FOR SELECT
               TO authenticated
               USING (
               user_id = (SELECT auth.uid())
               OR private.is_org_member(organization_id)
               );


CREATE POLICY organization_members_insert_owner
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
    private.org_role(organization_id) = 'owner'
);


CREATE POLICY organization_members_insert_admin
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
    private.org_role(organization_id) = 'admin'
    AND role IN ('admin', 'member')
);


CREATE POLICY organization_members_update_owner
ON public.organization_members
FOR UPDATE
                             TO authenticated
                             USING (
                             private.org_role(organization_id) = 'owner'
                             )
    WITH CHECK (
                             private.org_role(organization_id) = 'owner'
                             AND role IN ('owner', 'admin', 'member')
                             );


CREATE POLICY organization_members_update_admin
ON public.organization_members
FOR UPDATE
               TO authenticated
               USING (
               private.org_role(organization_id) = 'admin'
               AND role <> 'owner'
               )
    WITH CHECK (
               private.org_role(organization_id) = 'admin'
               AND role IN ('admin', 'member')
               );


CREATE POLICY organization_members_delete_owner
ON public.organization_members
FOR DELETE
TO authenticated
USING (
    private.org_role(organization_id) = 'owner'
);


CREATE POLICY organization_members_delete_admin
ON public.organization_members
FOR DELETE
TO authenticated
USING (
    private.org_role(organization_id) = 'admin'
    AND role <> 'owner'
);


-- ============================================================
-- 33. PROJECTS
-- ============================================================

CREATE POLICY projects_insert
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (
    -- Trigger will set and validate created_by
    -- Only check organization membership
    private.is_org_member(organization_id)
);


CREATE POLICY projects_select
ON public.projects
FOR SELECT
                      TO authenticated
                      USING (
                      private.project_access(id)
                      );


CREATE POLICY projects_update
ON public.projects
FOR UPDATE
               TO authenticated
               USING (
               private.project_role(id) IN ('owner', 'admin')
               )
    WITH CHECK (
               private.project_role(id) IN ('owner', 'admin')
               );


CREATE POLICY projects_delete
ON public.projects
FOR DELETE
TO authenticated
USING (
    private.project_role(id) = 'owner'
);


-- ============================================================
-- 34. PROJECT MEMBERS
-- ============================================================

CREATE POLICY project_members_select
ON public.project_members
FOR SELECT
               TO authenticated
               USING (
               user_id = (SELECT auth.uid())
               OR private.is_project_member(project_id)
               );


CREATE POLICY project_members_insert_owner
ON public.project_members
FOR INSERT
TO authenticated
WITH CHECK (
    private.project_role(project_id) = 'owner'
);


CREATE POLICY project_members_insert_admin
ON public.project_members
FOR INSERT
TO authenticated
WITH CHECK (
    private.project_role(project_id) = 'admin'
    AND role IN (
        'admin',
        'developer',
        'tester',
        'viewer'
    )
);


CREATE POLICY project_members_update_owner
ON public.project_members
FOR UPDATE
                             TO authenticated
                             USING (
                             private.project_role(project_id) = 'owner'
                             )
    WITH CHECK (
                             private.project_role(project_id) = 'owner'
                             AND role IN (
                             'owner',
                             'admin',
                             'developer',
                             'tester',
                             'viewer'
                             )
                             );


CREATE POLICY project_members_update_admin
ON public.project_members
FOR UPDATE
               TO authenticated
               USING (
               private.project_role(project_id) = 'admin'
               AND role <> 'owner'
               )
    WITH CHECK (
               private.project_role(project_id) = 'admin'
               AND role IN (
               'admin',
               'developer',
               'tester',
               'viewer'
               )
               );


CREATE POLICY project_members_delete_owner
ON public.project_members
FOR DELETE
TO authenticated
USING (
    private.project_role(project_id) = 'owner'
);


CREATE POLICY project_members_delete_admin
ON public.project_members
FOR DELETE
TO authenticated
USING (
    private.project_role(project_id) = 'admin'
    AND role <> 'owner'
);


-- ============================================================
-- 35. TASKS
-- ============================================================

CREATE POLICY tasks_select
ON public.tasks
FOR SELECT
               TO authenticated
               USING (
               private.project_access(project_id)
               );


CREATE POLICY tasks_insert
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
    private.project_role(project_id) IN (
        'owner',
        'admin',
        'developer'
    )
);


CREATE POLICY tasks_update
ON public.tasks
FOR UPDATE
                      TO authenticated
                      USING (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin',
                      'developer'
                      )
                      )
    WITH CHECK (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin',
                      'developer'
                      )
                      );


CREATE POLICY tasks_delete
ON public.tasks
FOR DELETE
TO authenticated
USING (
    private.project_role(project_id) IN (
        'owner',
        'admin'
    )
);


-- ============================================================
-- 36. ROADMAP
-- ============================================================

CREATE POLICY roadmap_select
ON public.roadmap_phases
FOR SELECT
               TO authenticated
               USING (
               private.project_access(project_id)
               );


CREATE POLICY roadmap_insert
ON public.roadmap_phases
FOR INSERT
TO authenticated
WITH CHECK (
    private.project_role(project_id) IN (
        'owner',
        'admin'
    )
);


CREATE POLICY roadmap_update
ON public.roadmap_phases
FOR UPDATE
                      TO authenticated
                      USING (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin'
                      )
                      )
    WITH CHECK (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin'
                      )
                      );


CREATE POLICY roadmap_delete
ON public.roadmap_phases
FOR DELETE
TO authenticated
USING (
    private.project_role(project_id) IN (
        'owner',
        'admin'
    )
);


-- ============================================================
-- 37. PROJECT FILES
-- ============================================================

CREATE POLICY project_files_select
ON public.project_files
FOR SELECT
               TO authenticated
               USING (
               private.project_access(project_id)
               );


CREATE POLICY project_files_insert
ON public.project_files
FOR INSERT
TO authenticated
WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND private.project_role(project_id) IN (
        'owner',
        'admin',
        'developer'
    )
);


CREATE POLICY project_files_update
ON public.project_files
FOR UPDATE
                      TO authenticated
                      USING (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin'
                      )
                      )
    WITH CHECK (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin'
                      )
                      );


CREATE POLICY project_files_delete
ON public.project_files
FOR DELETE
TO authenticated
USING (
    private.project_role(project_id) IN (
        'owner',
        'admin'
    )
);


-- ============================================================
-- 38. TECHNOLOGIES
-- ============================================================

CREATE POLICY technologies_select
ON public.technologies
FOR SELECT
               TO authenticated
               USING (
               private.project_access(project_id)
               );


CREATE POLICY technologies_insert
ON public.technologies
FOR INSERT
TO authenticated
WITH CHECK (
    private.project_role(project_id) IN (
        'owner',
        'admin'
    )
);


CREATE POLICY technologies_update
ON public.technologies
FOR UPDATE
                      TO authenticated
                      USING (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin'
                      )
                      )
    WITH CHECK (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin'
                      )
                      );


CREATE POLICY technologies_delete
ON public.technologies
FOR DELETE
TO authenticated
USING (
    private.project_role(project_id) IN (
        'owner',
        'admin'
    )
);


-- ============================================================
-- 39. CONTEXT DECISIONS
-- ============================================================

CREATE POLICY decisions_select
ON public.context_decisions
FOR SELECT
               TO authenticated
               USING (
               private.project_access(project_id)
               );


CREATE POLICY decisions_insert
ON public.context_decisions
FOR INSERT
TO authenticated
WITH CHECK (
    private.project_role(project_id) IN (
        'owner',
        'admin',
        'developer'
    )
);


CREATE POLICY decisions_update
ON public.context_decisions
FOR UPDATE
                      TO authenticated
                      USING (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin',
                      'developer'
                      )
                      )
    WITH CHECK (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin',
                      'developer'
                      )
                      );


CREATE POLICY decisions_delete
ON public.context_decisions
FOR DELETE
TO authenticated
USING (
    private.project_role(project_id) IN (
        'owner',
        'admin'
    )
);


-- ============================================================
-- 40. CONTEXT SOURCES
-- ============================================================

CREATE POLICY context_sources_select
ON public.context_sources
FOR SELECT
               TO authenticated
               USING (
               private.project_access(project_id)
               );


CREATE POLICY context_sources_insert
ON public.context_sources
FOR INSERT
TO authenticated
WITH CHECK (
    private.project_role(project_id) IN (
        'owner',
        'admin',
        'developer'
    )
);


CREATE POLICY context_sources_update
ON public.context_sources
FOR UPDATE
                      TO authenticated
                      USING (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin',
                      'developer'
                      )
                      )
    WITH CHECK (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin',
                      'developer'
                      )
                      );


CREATE POLICY context_sources_delete
ON public.context_sources
FOR DELETE
TO authenticated
USING (
    private.project_role(project_id) IN (
        'owner',
        'admin'
    )
);


-- ============================================================
-- 41. PROJECT MEMORY
-- ============================================================

CREATE POLICY project_memory_select
ON public.project_memory
FOR SELECT
               TO authenticated
               USING (
               private.project_access(project_id)
               );


CREATE POLICY project_memory_insert
ON public.project_memory
FOR INSERT
TO authenticated
WITH CHECK (
    created_by = (SELECT auth.uid())
    AND private.project_role(project_id) IN (
        'owner',
        'admin',
        'developer'
    )
);


CREATE POLICY project_memory_update
ON public.project_memory
FOR UPDATE
                      TO authenticated
                      USING (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin',
                      'developer'
                      )
                      )
    WITH CHECK (
                      private.project_role(project_id) IN (
                      'owner',
                      'admin',
                      'developer'
                      )
                      );


CREATE POLICY project_memory_delete
ON public.project_memory
FOR DELETE
TO authenticated
USING (
    private.project_role(project_id) IN (
        'owner',
        'admin'
    )
);


-- ============================================================
-- 42. TASK COMMENTS
-- ============================================================

CREATE POLICY task_comments_select
ON public.task_comments
FOR SELECT
               TO authenticated
               USING (
               EXISTS (
               SELECT 1
               FROM public.tasks t
               WHERE t.id = task_comments.task_id
               AND private.project_access(t.project_id)
               )
               );


CREATE POLICY task_comments_insert
ON public.task_comments
FOR INSERT
TO authenticated
WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_comments.task_id
          AND private.project_role(t.project_id) IN (
              'owner',
              'admin',
              'developer',
              'tester'
          )
    )
);


CREATE POLICY task_comments_update
ON public.task_comments
FOR UPDATE
                      TO authenticated
                      USING (
                      author_id = (SELECT auth.uid())
                      )
    WITH CHECK (
                      author_id = (SELECT auth.uid())
                      );


CREATE POLICY task_comments_delete
ON public.task_comments
FOR DELETE
TO authenticated
USING (
    author_id = (SELECT auth.uid())
);


-- ============================================================
-- 43. CONTEXT RELATIONS
-- ============================================================

CREATE POLICY context_relations_select
ON public.context_relations
FOR SELECT
               TO authenticated
               USING (

               private.entity_project_id(
               source_type,
               source_id
               ) IS NOT NULL

               AND

               private.entity_project_id(
               source_type,
               source_id
               ) =
               private.entity_project_id(
               target_type,
               target_id
               )

               AND

               private.project_access(
               private.entity_project_id(
               source_type,
               source_id
               )
               )
               );


CREATE POLICY context_relations_insert
ON public.context_relations
FOR INSERT
TO authenticated
WITH CHECK (

    created_by = (SELECT auth.uid())

    AND

    private.entity_project_id(
        source_type,
        source_id
    ) IS NOT NULL

    AND

    private.entity_project_id(
        source_type,
        source_id
    ) =
    private.entity_project_id(
        target_type,
        target_id
    )

    AND

    private.project_role(
        private.entity_project_id(
            source_type,
            source_id
        )
    ) IN (
        'owner',
        'admin',
        'developer'
    )
);


CREATE POLICY context_relations_delete
ON public.context_relations
FOR DELETE
TO authenticated
USING (

    private.project_role(
        private.entity_project_id(
            source_type,
            source_id
        )
    ) IN (
        'owner',
        'admin'
    )
);


-- ============================================================
-- 44. ACTIVITY LOGS
-- ============================================================

CREATE POLICY activity_logs_select
ON public.activity_logs
FOR SELECT
               TO authenticated
               USING (

               (
               project_id IS NOT NULL
               AND private.project_access(project_id)
               )

               OR

               (
               organization_id IS NOT NULL
               AND private.is_org_member(organization_id)
               )
               );


CREATE POLICY activity_logs_insert
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (

    user_id = (SELECT auth.uid())

    AND

    (
        (
            project_id IS NOT NULL
            AND private.project_access(project_id)
        )

        OR

        (
            organization_id IS NOT NULL
            AND private.is_org_member(organization_id)
        )
    )

    AND

    (
        organization_id IS NULL

        OR

        EXISTS (
            SELECT 1
            FROM public.organizations o
            WHERE o.id = activity_logs.organization_id
              AND (
                  activity_logs.project_id IS NULL
                  OR EXISTS (
                      SELECT 1
                      FROM public.projects p
                      WHERE p.id = activity_logs.project_id
                        AND p.organization_id = o.id
                  )
              )
        )
    )
);


-- ============================================================
-- 45. INVITATIONS
-- ============================================================

CREATE POLICY invitations_recipient_select
ON public.invitations
FOR SELECT
                      TO authenticated
                      USING (
                      lower(email) = lower(
                      COALESCE(
                      (
                      SELECT p.email
                      FROM public.profiles p
                      WHERE p.id = (SELECT auth.uid())
                      ),
                      ''
                      )
                      )
                      );


CREATE POLICY invitations_org_owner_insert
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (
    organization_id IS NOT NULL
    AND project_id IS NULL
    AND invited_by = (SELECT auth.uid())
    AND private.org_role(organization_id) = 'owner'
    AND role IN (
        'owner',
        'admin',
        'member'
    )
);


CREATE POLICY invitations_org_admin_insert
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (
    organization_id IS NOT NULL
    AND project_id IS NULL
    AND invited_by = (SELECT auth.uid())
    AND private.org_role(organization_id) = 'admin'
    AND role IN (
        'admin',
        'member'
    )
);


CREATE POLICY invitations_project_owner_insert
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (
    project_id IS NOT NULL
    AND organization_id IS NULL
    AND invited_by = (SELECT auth.uid())
    AND private.project_role(project_id) = 'owner'
    AND role IN (
        'owner',
        'admin',
        'developer',
        'tester',
        'viewer'
    )
);


CREATE POLICY invitations_project_admin_insert
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (
    project_id IS NOT NULL
    AND organization_id IS NULL
    AND invited_by = (SELECT auth.uid())
    AND private.project_role(project_id) = 'admin'
    AND role IN (
        'admin',
        'developer',
        'tester',
        'viewer'
    )
);


CREATE POLICY invitations_manager_update
ON public.invitations
FOR UPDATE
                                           TO authenticated
                                           USING (
                                           (
                                           organization_id IS NOT NULL
                                           AND private.org_role(organization_id) IN (
                                           'owner',
                                           'admin'
                                           )
                                           )

                                           OR

                                           (
                                           project_id IS NOT NULL
                                           AND private.project_role(project_id) IN (
                                           'owner',
                                           'admin'
                                           )
                                           )
                                           )
    WITH CHECK (
                                           (
                                           organization_id IS NOT NULL
                                           AND private.org_role(organization_id) IN (
                                           'owner',
                                           'admin'
                                           )
                                           )

                                           OR

                                           (
                                           project_id IS NOT NULL
                                           AND private.project_role(project_id) IN (
                                           'owner',
                                           'admin'
                                           )
                                           )
                                           );


CREATE POLICY invitations_manager_delete
ON public.invitations
FOR DELETE
TO authenticated
USING (
    (
        organization_id IS NOT NULL
        AND private.org_role(organization_id) IN (
            'owner',
            'admin'
        )
    )

    OR

    (
        project_id IS NOT NULL
        AND private.project_role(project_id) IN (
            'owner',
            'admin'
        )
    )
);


-- ============================================================
-- 46. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email
    ON public.profiles(email);


CREATE INDEX IF NOT EXISTS idx_organizations_created_by
    ON public.organizations(created_by);


CREATE INDEX IF NOT EXISTS idx_organization_members_org
    ON public.organization_members(organization_id);


CREATE INDEX IF NOT EXISTS idx_organization_members_user
    ON public.organization_members(user_id);


CREATE INDEX IF NOT EXISTS idx_organization_members_role
    ON public.organization_members(role);


CREATE INDEX IF NOT EXISTS idx_projects_org
    ON public.projects(organization_id);


CREATE INDEX IF NOT EXISTS idx_projects_created_by
    ON public.projects(created_by);


CREATE INDEX IF NOT EXISTS idx_projects_status
    ON public.projects(status);


CREATE INDEX IF NOT EXISTS idx_projects_visibility
    ON public.projects(visibility);


CREATE INDEX IF NOT EXISTS idx_project_members_project
    ON public.project_members(project_id);


CREATE INDEX IF NOT EXISTS idx_project_members_user
    ON public.project_members(user_id);


CREATE INDEX IF NOT EXISTS idx_project_members_role
    ON public.project_members(role);


CREATE INDEX IF NOT EXISTS idx_tasks_project
    ON public.tasks(project_id);


CREATE INDEX IF NOT EXISTS idx_tasks_status
    ON public.tasks(status);


CREATE INDEX IF NOT EXISTS idx_tasks_priority
    ON public.tasks(priority);


CREATE INDEX IF NOT EXISTS idx_tasks_assignee
    ON public.tasks(assignee_id);


CREATE INDEX IF NOT EXISTS idx_tasks_decision
    ON public.tasks(decision_id);


CREATE INDEX IF NOT EXISTS idx_roadmap_phases_project
    ON public.roadmap_phases(project_id);


CREATE INDEX IF NOT EXISTS idx_roadmap_phases_status
    ON public.roadmap_phases(status);


CREATE INDEX IF NOT EXISTS idx_project_files_project
    ON public.project_files(project_id);


CREATE INDEX IF NOT EXISTS idx_project_files_category
    ON public.project_files(category);


CREATE INDEX IF NOT EXISTS idx_technologies_project
    ON public.technologies(project_id);


CREATE INDEX IF NOT EXISTS idx_technologies_category
    ON public.technologies(category);


CREATE INDEX IF NOT EXISTS idx_invitations_org
    ON public.invitations(organization_id);


CREATE INDEX IF NOT EXISTS idx_invitations_project
    ON public.invitations(project_id);


CREATE INDEX IF NOT EXISTS idx_invitations_email
    ON public.invitations(email);


CREATE INDEX IF NOT EXISTS idx_invitations_status
    ON public.invitations(status);


CREATE INDEX IF NOT EXISTS idx_activity_project
    ON public.activity_logs(project_id);


CREATE INDEX IF NOT EXISTS idx_activity_org
    ON public.activity_logs(organization_id);


CREATE INDEX IF NOT EXISTS idx_activity_user
    ON public.activity_logs(user_id);


CREATE INDEX IF NOT EXISTS idx_activity_created
    ON public.activity_logs(created_at);


CREATE INDEX IF NOT EXISTS idx_decisions_project
    ON public.context_decisions(project_id);


CREATE INDEX IF NOT EXISTS idx_decisions_status
    ON public.context_decisions(status);


CREATE INDEX IF NOT EXISTS idx_decisions_type
    ON public.context_decisions(decision_type);


CREATE INDEX IF NOT EXISTS idx_context_relations_source
    ON public.context_relations(source_type, source_id);


CREATE INDEX IF NOT EXISTS idx_context_relations_target
    ON public.context_relations(target_type, target_id);


CREATE INDEX IF NOT EXISTS idx_context_sources_project
    ON public.context_sources(project_id);


CREATE INDEX IF NOT EXISTS idx_context_sources_type
    ON public.context_sources(source_type);


CREATE INDEX IF NOT EXISTS idx_project_memory_project
    ON public.project_memory(project_id);


CREATE INDEX IF NOT EXISTS idx_project_memory_source
    ON public.project_memory(source_id);


CREATE INDEX IF NOT EXISTS idx_project_memory_type
    ON public.project_memory(memory_type);


CREATE INDEX IF NOT EXISTS idx_task_comments_task
    ON public.task_comments(task_id);


CREATE INDEX IF NOT EXISTS idx_task_comments_author
    ON public.task_comments(author_id);


-- ============================================================
-- 47. FUNCTION PRIVILEGES
-- ============================================================

REVOKE ALL
    ON SCHEMA private
    FROM PUBLIC;

REVOKE ALL
    ON SCHEMA private
    FROM anon;


GRANT USAGE
ON SCHEMA private
TO authenticated;


REVOKE ALL
    ON FUNCTION private.is_org_member(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION private.is_org_member(uuid)
TO authenticated;


REVOKE ALL
    ON FUNCTION private.org_role(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION private.org_role(uuid)
TO authenticated;


REVOKE ALL
    ON FUNCTION private.is_project_member(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION private.is_project_member(uuid)
TO authenticated;


REVOKE ALL
    ON FUNCTION private.project_role(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION private.project_role(uuid)
TO authenticated;


REVOKE ALL
    ON FUNCTION private.project_access(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION private.project_access(uuid)
TO authenticated;


REVOKE ALL
    ON FUNCTION private.entity_project_id(text, uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION private.entity_project_id(text, uuid)
TO authenticated;


-- ============================================================
-- 48. TABLE GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.profiles
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.organizations
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.organization_members
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.projects
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.project_members
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.tasks
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.roadmap_phases
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.project_files
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.technologies
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.invitations
    TO authenticated;


GRANT SELECT, INSERT
    ON public.activity_logs
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.context_decisions
    TO authenticated;


GRANT SELECT, INSERT, DELETE
    ON public.context_relations
    TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.context_sources
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.project_memory
    TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.task_comments
    TO authenticated;


-- ============================================================
-- 49. FINAL COMMIT
-- ============================================================

COMMIT;