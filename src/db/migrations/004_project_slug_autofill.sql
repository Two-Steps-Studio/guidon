BEGIN;

-- ============================================================
-- GUIDON — MIGRATION 004
-- Auto-fill projects.slug
-- ============================================================
--
-- Run AFTER 002.
--
-- PROBLEM
-- -------
-- 002 added projects.slug as NOT NULL with no DEFAULT. Every
-- existing INSERT path omits it:
--
--   src/app/api/v1/projects/route.ts        (POST)
--   src/app/organizations/[id]/page.tsx     (create dialog)
--
-- so creating a project fails with a not-null violation. 002
-- backfilled existing rows but did nothing for new ones.
--
-- FIX
-- ---
-- A BEFORE INSERT trigger derives a slug from the project name
-- when none is supplied. BEFORE triggers run ahead of the
-- NOT NULL and CHECK checks, so the row validates.
--
-- This is done in the database rather than only in the two call
-- sites so that any future insert path — a script, the SQL
-- editor, a seeding job — cannot reintroduce the same failure.
-- The application may still send an explicit slug; the trigger
-- only fills in a missing one.
-- ============================================================


-- ============================================================
-- 1. SLUGIFY HELPER
-- ============================================================

CREATE OR REPLACE FUNCTION private.slugify(
    p_value text
)
    RETURNS text
    LANGUAGE sql
    IMMUTABLE
SET search_path = ''
AS $$
SELECT COALESCE(
    NULLIF(
        trim(
            BOTH '-' FROM
            regexp_replace(
                lower(COALESCE(p_value, '')),
                '[^a-z0-9]+',
                '-',
                'g'
            )
        ),
        ''
    ),
    'project'
);
$$;


-- ============================================================
-- 2. UNIQUE-WITHIN-ORGANIZATION SLUG
-- ============================================================
--
-- Mirrors the uq_projects_org_slug index from 002: the same
-- base name in two different organizations is fine, twice in
-- one organization is not.
-- ============================================================

CREATE OR REPLACE FUNCTION private.next_project_slug(
    p_organization_id uuid,
    p_name text,
    p_exclude_id uuid DEFAULT NULL
)
    RETURNS text
    LANGUAGE plpgsql
    STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_base      text;
    v_candidate text;
    v_suffix    integer := 1;
BEGIN

    v_base := private.slugify(p_name);

    -- Leave room for a '-NN' suffix inside the 64 character limit.
    v_base := left(v_base, 60);
    v_base := COALESCE(NULLIF(trim(BOTH '-' FROM v_base), ''), 'project');

    v_candidate := v_base;

    WHILE EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.organization_id = p_organization_id
          AND p.slug = v_candidate
          AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
    )
    LOOP
        v_suffix := v_suffix + 1;
        v_candidate := v_base || '-' || v_suffix::text;
    END LOOP;

    RETURN v_candidate;

END;
$$;


-- ============================================================
-- 3. TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION private.handle_project_slug()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN

    IF NEW.slug IS NULL OR trim(NEW.slug) = '' THEN

        NEW.slug := private.next_project_slug(
            NEW.organization_id,
            NEW.name
        );

    ELSE

        -- Normalise a caller-supplied slug so it cannot fail the
        -- format CHECK on casing or stray punctuation.
        NEW.slug := private.next_project_slug(
            NEW.organization_id,
            NEW.slug,
            NEW.id
        );

    END IF;

    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS set_project_slug ON public.projects;

CREATE TRIGGER set_project_slug
    BEFORE INSERT ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION private.handle_project_slug();


-- ============================================================
-- 4. PRIVILEGES
-- ============================================================

REVOKE ALL ON FUNCTION private.slugify(text) FROM PUBLIC, anon;
REVOKE ALL
    ON FUNCTION private.next_project_slug(uuid, text, uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.slugify(text) TO authenticated;
GRANT EXECUTE
    ON FUNCTION private.next_project_slug(uuid, text, uuid)
    TO authenticated;


COMMIT;
