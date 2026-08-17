BEGIN;

-- ============================================================
-- GUIDON — MIGRATION 007
-- Allow organizations and projects to be deleted
-- ============================================================
--
-- Run AFTER 006.
--
-- PROBLEM
-- -------
-- private.protect_org_owner() and private.protect_project_owner()
-- are BEFORE UPDATE OR DELETE triggers on the membership tables.
-- They refuse to remove or demote the last owner, which is the
-- correct rule for someone editing a member list.
--
-- But organization_members.organization_id and
-- project_members.project_id are ON DELETE CASCADE. Deleting the
-- parent row therefore cascades into the membership table, fires
-- these triggers, and hits the very rule that is meant to protect
-- a *surviving* workspace:
--
--     P0001: Cannot remove the last project owner
--
-- Net effect: DELETE FROM public.projects and
-- DELETE FROM public.organizations always fail. Deleting a project
-- or an organization is impossible through any path — API, UI, or
-- SQL editor. Confirmed empirically: deleting a freshly created
-- test project returned exactly the error above.
--
-- FIX
-- ---
-- Skip the guard when the parent row is already gone. During a
-- cascade Postgres deletes the parent first and then applies the
-- referential action to the children, so by the time these
-- triggers run the parent is no longer visible to them.
--
-- Deliberately narrow: when the parent still exists this is an
-- ordinary member-list edit and the original protection applies
-- unchanged. Only the cascade path is exempted.
-- ============================================================


-- ============================================================
-- 1. ORGANIZATION OWNER PROTECTION
-- ============================================================

CREATE OR REPLACE FUNCTION private.protect_org_owner()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    owner_count integer;
BEGIN

    IF TG_OP = 'DELETE' THEN

        -- Parent already deleted: this is a cascade, not a member edit.
        IF NOT EXISTS (
            SELECT 1
            FROM public.organizations o
            WHERE o.id = OLD.organization_id
        ) THEN
            RETURN OLD;
        END IF;

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
-- 2. PROJECT OWNER PROTECTION
-- ============================================================

CREATE OR REPLACE FUNCTION private.protect_project_owner()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    owner_count integer;
BEGIN

    IF TG_OP = 'DELETE' THEN

        -- Parent already deleted: this is a cascade, not a member edit.
        IF NOT EXISTS (
            SELECT 1
            FROM public.projects p
            WHERE p.id = OLD.project_id
        ) THEN
            RETURN OLD;
        END IF;

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
-- 3. REMOVE SMOKE-TEST LEFTOVERS
-- ============================================================
--
-- Two throwaway projects were created while verifying migrations
-- 002/004/005/006 and could not be deleted because of the bug
-- fixed above. They are removed here; the cascade also clears
-- their tasks, technologies and memberships.
--
-- Matches on the exact generated slugs, so it cannot touch a real
-- project even if one is later named something similar.
-- ============================================================

DELETE FROM public.projects
WHERE slug IN (
    'rendering-pipeline-v2',
    'rendering-pipeline-v2-2'
)
AND name = 'Rendering Pipeline!! v2';


COMMIT;
