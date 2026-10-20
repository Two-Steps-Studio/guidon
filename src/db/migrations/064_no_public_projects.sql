-- ============================================================
-- GUIDON - MIGRACJA 064
-- Cudze projekty nie wyswietlaja sie nikomu spoza nich
-- ============================================================
--
-- Uruchomic PO 063. Bezpieczna do ponownego uruchomienia.
--
-- KONTEKST
-- --------
-- Zgloszenie: na liscie projektow widac projekty innych osob, do ktorych
-- nie ma sie dostepu.
--
-- private.project_access (001) przepuszczal projekt z visibility =
-- 'public' do KAZDEGO zalogowanego uzytkownika instancji - a za nim jego
-- zadania, komentarze, pliki i reszte (wszystkie polityki pytaja
-- project_access). Aplikacja nigdzie nie pozwala ustawic 'public' (ani nie
-- ma stron "publicznego projektu"), wiec ta galaz tylko otwierala dane
-- projektow, ktore w ten sposob dostaly 'public' poza aplikacja (import,
-- reczna zmiana w bazie, stare dane). Teraz dostep maja: czlonek projektu,
-- czlonek organizacji przy visibility = 'organization' i - jak w 009 -
-- tworca projektu. Istniejace projekty 'public' przechodza na 'private'.
--
-- Do tego projects_select jest tworzony od nowa, a kazda INNA polityka
-- SELECT na projects usuwana: polityka dopisana recznie w panelu Supabase
-- (np. "Enable read access for all users") dzialalaby obok naszej (polityki
-- RLS sa laczone przez OR) i tez pokazywala wszystkie projekty.
-- ============================================================

BEGIN;


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
      )
);
$$;


UPDATE public.projects SET visibility = 'private' WHERE visibility = 'public';


DO $$
DECLARE
    v_policy record;
BEGIN
    FOR v_policy IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'projects'
          AND cmd IN ('SELECT', 'ALL')
          AND policyname <> 'projects_select'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.projects', v_policy.policyname);
    END LOOP;
END;
$$;

DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select
ON public.projects
FOR SELECT
TO authenticated
USING (
    private.project_access(id)
    OR created_by = (SELECT auth.uid())
);


COMMIT;
