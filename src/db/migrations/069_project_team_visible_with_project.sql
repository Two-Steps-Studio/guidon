-- ============================================================
-- GUIDON - MIGRACJA 069
-- Kto widzi projekt, widzi jego zespol
-- ============================================================
--
-- Uruchomic PO 068.
--
-- KONTEKST
-- --------
-- project_members_select (001) pokazywal sklad projektu tylko jego
-- czlonkom. Od 067 projekt widza tez czlonkowie organizacji (widocznosc
-- 'organization') oraz jej wlasciciel i admini - ale nie widzieli, kto nad
-- nim pracuje (drzewko czlonkow organizacji, strona Czlonkowie projektu).
-- Teraz: kto ma dostep do projektu (private.project_access), widzi jego
-- zespol. Zapis bez zmian (owner/admin projektu).
-- ============================================================

BEGIN;


DROP POLICY IF EXISTS project_members_select ON public.project_members;
CREATE POLICY project_members_select
ON public.project_members
FOR SELECT
TO authenticated
USING (
    user_id = (SELECT auth.uid())
    OR private.project_access(project_id)
);


COMMIT;
