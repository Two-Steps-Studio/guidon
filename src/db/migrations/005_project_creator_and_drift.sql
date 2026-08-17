BEGIN;

-- ============================================================
-- GUIDON — MIGRATION 005
-- projects.created_by, and repo/database drift reconciliation
-- ============================================================
--
-- Run AFTER 004.
--
-- PROBLEM 1 — projects.created_by is silently NULL
-- ------------------------------------------------
-- public.projects.created_by has NO column default, and the only
-- thing claiming to populate it is private.handle_new_project(),
-- which runs on an AFTER INSERT trigger:
--
--     CREATE TRIGGER on_project_created
--         AFTER INSERT ON public.projects
--
-- Assigning NEW.<column> inside an AFTER trigger has no effect on
-- the stored row — the return value is discarded. So:
--
--   * the owner membership IS created correctly (the trigger reads
--     its own local NEW.created_by before inserting the member row)
--   * but public.projects.created_by stays NULL on disk
--
-- Nothing errors, which is why this survived: the project works,
-- the owner is right, and only "who created this" is lost.
--
-- src/app/api/v1/projects/route.ts omits created_by entirely,
-- relying on a comment that says the trigger handles it.
--
-- public.organizations does not have this problem, because it has
-- both `DEFAULT auth.uid()` on the column and a dedicated BEFORE
-- trigger (private.set_organization_creator).
--
--
-- PROBLEM 2 — the repository cannot rebuild the database
-- ------------------------------------------------------
-- private.set_organization_creator() exists in the live database
-- but appears in no migration file in this repository. A fresh
-- environment provisioned from these files therefore gets weaker
-- guarantees than production. It is (re)created below so the repo
-- and the database agree.
-- ============================================================


-- ============================================================
-- 1. RECONCILE: set_organization_creator
-- ============================================================
--
-- Reproduced verbatim from the live database so that this
-- repository can rebuild it. Hardening, not a change:
--   * refuses unauthenticated organization creation
--   * always overrides client-supplied created_by
-- ============================================================

CREATE OR REPLACE FUNCTION private.set_organization_creator()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid;
BEGIN

    current_user_id := auth.uid();

    -- Never allow an unauthenticated request to create an org.
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION
            'Authentication required to create an organization';
    END IF;

    -- Always override whatever the client sends.
    -- This prevents a client from impersonating another user.
    NEW.created_by := current_user_id;

    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS set_organization_creator ON public.organizations;

CREATE TRIGGER set_organization_creator
    BEFORE INSERT ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION private.set_organization_creator();


-- ============================================================
-- 2. FIX: set_project_creator
-- ============================================================
--
-- Mirrors the organization trigger, with one deliberate
-- difference: a service_role caller may create a project on
-- behalf of a user by supplying created_by explicitly.
--
-- Rationale — organizations are only ever created by a person
-- clicking "new organization", whereas projects are a plausible
-- target for server-side automation (templates, imports,
-- seeding). Blocking service_role outright would make those
-- impossible, so instead it must be explicit: service_role has
-- to name the creator, it never gets an implicit one.
--
-- For ordinary authenticated users the behaviour is identical
-- to organizations: created_by is forced to auth.uid() and any
-- client-supplied value is ignored.
-- ============================================================

CREATE OR REPLACE FUNCTION private.set_project_creator()
    RETURNS trigger
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id uuid;
BEGIN

    current_user_id := (SELECT auth.uid());

    IF current_user_id IS NOT NULL THEN

        -- Authenticated request: the creator is always the caller.
        NEW.created_by := current_user_id;

    ELSIF current_user <> 'service_role' THEN

        RAISE EXCEPTION
            'Authentication required to create a project';

    ELSIF NEW.created_by IS NULL THEN

        -- Trusted server key, but it must say who it is acting for,
        -- otherwise handle_new_project() cannot create an owner.
        RAISE EXCEPTION
            'created_by is required when creating a project with the service role';

    END IF;

    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS set_project_creator ON public.projects;

-- Named to sort before set_project_slug: BEFORE triggers on the same
-- event fire in alphabetical order, and the slug trigger does not
-- depend on created_by, so either order is correct — this simply
-- keeps the ownership decision first and the derivation second.
CREATE TRIGGER set_project_creator
    BEFORE INSERT ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION private.set_project_creator();


-- ============================================================
-- 3. BACKFILL EXISTING NULLS
-- ============================================================
--
-- Any project already created through the API has a NULL
-- created_by. The owner membership is correct, so the original
-- creator can be recovered from it.
-- ============================================================

UPDATE public.projects p
SET created_by = pm.user_id
FROM public.project_members pm
WHERE p.created_by IS NULL
  AND pm.project_id = p.id
  AND pm.role = 'owner';


-- ============================================================
-- 4. PRIVILEGES
-- ============================================================

REVOKE ALL
    ON FUNCTION private.set_organization_creator()
    FROM PUBLIC, anon;

REVOKE ALL
    ON FUNCTION private.set_project_creator()
    FROM PUBLIC, anon;


COMMIT;
