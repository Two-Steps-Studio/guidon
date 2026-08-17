BEGIN;

-- ============================================================
-- GUIDON — MIGRATION 006
-- Correct service-role detection in set_project_creator
-- ============================================================
--
-- Run AFTER 005.
--
-- PROBLEM
-- -------
-- 005 tried to recognise a trusted server-side caller with:
--
--     current_user <> 'service_role'
--
-- That never matches. private.set_project_creator() is
-- SECURITY DEFINER, and inside a SECURITY DEFINER function
-- current_user is the FUNCTION OWNER, not the role of the
-- caller. So the check is always true and the function raises
--
--     'Authentication required to create a project'
--
-- for service-role requests as well — the exact opposite of
-- the documented intent, which was to let server-side
-- automation create projects by naming the creator explicitly.
--
-- Verified empirically: a POST to /rest/v1/projects using the
-- service role key returned P0001 with that message.
--
-- The same idiom appears three times in 001
-- (handle_new_organization, handle_new_project, validate_task).
-- There it is dead code rather than a bug: each use is ANDed
-- with `auth.uid() IS NOT NULL`, which is already false for a
-- service-role request, so the RAISE cannot fire either way.
-- Those are deliberately left alone — the guards behave
-- correctly, only the service_role exemption is unreachable.
--
-- FIX
-- ---
-- Read the role from the request JWT, which PostgREST exposes
-- as a GUC and which SECURITY DEFINER does not disturb.
-- ============================================================


-- ============================================================
-- 1. ROLE HELPER
-- ============================================================
--
-- current_setting(..., true) returns NULL rather than raising
-- when the GUC is absent (direct psql, a background job), and
-- the claims payload is not guaranteed to be valid JSON, so
-- both failure modes are swallowed. Absent claims => not the
-- service role, which is the safe default.
-- ============================================================

CREATE OR REPLACE FUNCTION private.is_service_role()
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
SET search_path = ''
AS $$
DECLARE
    v_claims text;
    v_role   text;
BEGIN

    v_claims := current_setting('request.jwt.claims', true);

    IF v_claims IS NULL OR v_claims = '' THEN
        RETURN false;
    END IF;

    BEGIN
        v_role := v_claims::jsonb ->> 'role';
    EXCEPTION WHEN others THEN
        RETURN false;
    END;

    RETURN v_role = 'service_role';

END;
$$;


REVOKE ALL ON FUNCTION private.is_service_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_service_role() TO authenticated;


-- ============================================================
-- 2. CORRECTED set_project_creator
-- ============================================================
--
-- Behaviour, unchanged in intent from 005:
--
--   authenticated user -> created_by is forced to auth.uid(),
--                         any client-supplied value ignored
--   service role       -> allowed, but MUST supply created_by
--   anything else      -> rejected
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

    ELSIF NOT private.is_service_role() THEN

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


-- The trigger itself is unchanged; CREATE OR REPLACE above swaps
-- the body in place. Recreated defensively in case 005 was only
-- partially applied.

DROP TRIGGER IF EXISTS set_project_creator ON public.projects;

CREATE TRIGGER set_project_creator
    BEFORE INSERT ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION private.set_project_creator();


COMMIT;
