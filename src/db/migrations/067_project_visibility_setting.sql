-- ============================================================
-- GUIDON - MIGRACJA 067
-- Widocznosc projektu w organizacji
-- ============================================================
--
-- Uruchomic PO 066.
--
-- KONTEKST
-- --------
-- Po wlaczeniu RLS (066) zwykly czlonek organizacji nie widzi jej
-- projektow, w ktorych nie zostal dodany do project_members: projekty
-- mialy visibility = 'private' (domyslne z 000), a aplikacja nie dawala
-- jak tego zmienic. Teraz:
--
-- - Ustawienia projektu -> Widocznosc: "tylko czlonkowie projektu"
--   ('private') albo "cala organizacja" ('organization') - zmienia
--   owner/admin projektu (kolumna dopisana do GRANT UPDATE, jak w 061).
-- - Nowe projekty domyslnie 'organization' - Guidon to narzedzie zespolu.
--   Istniejace zostaja jak sa; wlasciciel przelacza je w ustawieniach.
-- - Wlasciciel i admin ORGANIZACJI widza kazdy jej projekt (takze
--   'private') - zarzadzaja organizacja, nie moga nie widziec, co w niej
--   jest. Zmieniac projekt moga dalej tylko jego owner/admin (project_role,
--   bez zmian).
-- - 'public' nie wraca (064): CHECK dopuszcza juz tylko dwie wartosci.
--
-- Czlonek organizacji widzi projekt 'organization' bez roli w projekcie
-- (tylko do odczytu), dopoki owner/admin projektu go nie doda.
-- ============================================================

BEGIN;


UPDATE public.projects SET visibility = 'private' WHERE visibility NOT IN ('private', 'organization');
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_visibility_check;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_visibility_check
    CHECK (visibility IN ('private', 'organization'));
ALTER TABLE public.projects ALTER COLUMN visibility SET DEFAULT 'organization';


CREATE OR REPLACE FUNCTION private.project_access(
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
        private.is_project_member(p.id)
        OR (
            p.visibility = 'organization'
            AND private.is_org_member(p.organization_id)
        )
        OR private.org_role(p.organization_id) IN ('owner', 'admin')
      )
);
$$;


REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (name, description, status, color, allow_ai_auto_complete, avatar_url, project_type, methodology, ai_enabled, disabled_modules, done_cleanup_days, visibility)
    ON public.projects
    TO authenticated;


COMMIT;
