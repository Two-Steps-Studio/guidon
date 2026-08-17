BEGIN;

-- ============================================================
-- GUIDON — MIGRATION 003
-- Team profile visibility
-- ============================================================
--
-- Run AFTER 002.
--
-- PROBLEM
-- -------
-- 001 ships exactly one SELECT policy on public.profiles:
--
--     profiles_select_own  USING (id = auth.uid())
--
-- A user can therefore only ever read their OWN profile row.
-- Every collaborative surface that joins to profiles silently
-- returns NULL for everybody else:
--
--   - the organization / project member lists
--   - task assignee names and avatars
--   - task comment authors
--   - "created by" / "verified by" attribution
--
-- The queries succeed, so this fails silently rather than loudly.
--
-- FIX
-- ---
-- Allow a user to read the profile of anyone with whom they share
-- an organization or a project — and nobody else. Profiles remain
-- invisible across organization boundaries.
--
-- The lookup runs through a SECURITY DEFINER helper so that it does
-- not recurse back through the membership tables' own policies.
-- ============================================================


-- ============================================================
-- 1. HELPER: DOES THE CALLER SHARE A WORKSPACE WITH THIS USER?
-- ============================================================

DROP FUNCTION IF EXISTS private.shares_workspace_with(uuid);

CREATE FUNCTION private.shares_workspace_with(
    p_user_id uuid
)
    RETURNS boolean
    LANGUAGE sql
    STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT EXISTS (

    -- Shared organization
    SELECT 1
    FROM public.organization_members mine
    JOIN public.organization_members theirs
         ON theirs.organization_id = mine.organization_id
    WHERE mine.user_id = (SELECT auth.uid())
      AND theirs.user_id = p_user_id

    UNION ALL

    -- Shared project (covers guests who are on a project but not
    -- a full member of the owning organization)
    SELECT 1
    FROM public.project_members mine
    JOIN public.project_members theirs
         ON theirs.project_id = mine.project_id
    WHERE mine.user_id = (SELECT auth.uid())
      AND theirs.user_id = p_user_id
);
$$;


REVOKE ALL
    ON FUNCTION private.shares_workspace_with(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
    ON FUNCTION private.shares_workspace_with(uuid)
    TO authenticated;


-- ============================================================
-- 2. POLICY: READ TEAMMATES' PROFILES
-- ============================================================
--
-- Kept as a separate policy rather than widening
-- profiles_select_own, so that the "own row" guarantee stays
-- readable and independently auditable. Postgres ORs multiple
-- permissive SELECT policies together.
-- ============================================================

DROP POLICY IF EXISTS profiles_select_team ON public.profiles;

CREATE POLICY profiles_select_team
ON public.profiles
FOR SELECT
TO authenticated
USING (
    private.shares_workspace_with(id)
);


-- ============================================================
-- 3. REMOVE DEAD ANON INSERT POLICY
-- ============================================================
--
-- 001 created:
--
--     profiles_insert_trigger  FOR INSERT TO anon  WITH CHECK (true)
--
-- The stated rationale — "safe because the trigger enforces
-- id = auth.uid()" — does not hold: private.handle_new_user()
-- fires on auth.users, and does not constrain direct inserts
-- into public.profiles.
--
-- In practice anon has no INSERT grant on the table, so this was
-- verified NOT to be exploitable. It is dropped anyway because a
-- WITH CHECK (true) policy for anon is one stray GRANT away from
-- becoming one, and the SECURITY DEFINER trigger does not need a
-- policy in the first place.
-- ============================================================

DROP POLICY IF EXISTS profiles_insert_trigger ON public.profiles;


-- Belt and braces: anon has no business touching these tables.
REVOKE ALL ON public.profiles              FROM anon;
REVOKE ALL ON public.organizations         FROM anon;
REVOKE ALL ON public.organization_members  FROM anon;
REVOKE ALL ON public.projects              FROM anon;
REVOKE ALL ON public.project_members       FROM anon;
REVOKE ALL ON public.tasks                 FROM anon;
REVOKE ALL ON public.task_comments         FROM anon;
REVOKE ALL ON public.roadmap_phases        FROM anon;
REVOKE ALL ON public.project_files         FROM anon;
REVOKE ALL ON public.technologies          FROM anon;
REVOKE ALL ON public.invitations           FROM anon;
REVOKE ALL ON public.activity_logs         FROM anon;
REVOKE ALL ON public.context_decisions     FROM anon;
REVOKE ALL ON public.context_relations     FROM anon;
REVOKE ALL ON public.context_sources       FROM anon;
REVOKE ALL ON public.project_memory        FROM anon;


-- ============================================================
-- 4. SUPPORTING INDEX
-- ============================================================
--
-- shares_workspace_with() filters both membership tables by
-- user_id; 001 already indexes those columns, so no new index is
-- required here. Listed explicitly so the omission reads as
-- deliberate rather than forgotten.
-- ============================================================


COMMIT;
