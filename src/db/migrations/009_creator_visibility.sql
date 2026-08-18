-- ============================================================
-- 009 — WIDOCZNOŚĆ DLA TWÓRCY: naprawa INSERT ... RETURNING
-- ============================================================
--
-- OBJAW
-- -----
-- Tworzenie organizacji i projektu kończy się błędem:
--
--   new row violates row-level security policy for table "organizations"
--   new row violates row-level security policy for table "projects"
--
-- Dotyczy obu ścieżek zapisu w aplikacji — .insert().select().single()
-- w src/app/organizations/page.tsx, src/app/organizations/[id]/page.tsx
-- oraz /api/v1/organizations i /api/v1/projects.
--
--
-- PRZYCZYNA
-- ---------
-- PostgreSQL stosuje politykę SELECT również do wiersza zwracanego
-- przez RETURNING (a .select() w supabase-js to właśnie RETURNING).
-- Kolejność jest taka:
--
--   1. trigger BEFORE  -> ustawia created_by
--   2. wstawienie wiersza
--   3. WITH CHECK polityki INSERT           <- przechodzi (true)
--   4. USING polityki SELECT dla RETURNING  <- ODRZUCA
--   5. trigger AFTER   -> dopiero tutaj powstaje członkostwo
--
-- W punkcie 4 członkostwa jeszcze nie ma, więc is_org_member() i
-- project_access() zwracają false. Wiersz jest poprawnie zapisany,
-- ale całość zostaje wycofana przy próbie jego odczytania.
--
-- Dlatego INSERT bez RETURNING działał, a z RETURNING nie — co
-- maskowało błąd, bo tabela po fakcie wyglądała poprawnie.
--
-- Problem dotyczy WYŁĄCZNIE tych dwóch tabel: ich polityka SELECT
-- pyta o własne `id`. Tabele podrzędne (tasks, roadmap_phases,
-- technologies, project_memory, context_sources) pytają o
-- project_id rodzica, który jest widoczny już przed zapisem —
-- sprawdzone, INSERT ... RETURNING przechodzi tam bez zmian.
--
--
-- ROZWIĄZANIE
-- -----------
-- Twórca widzi to, co właśnie utworzył. created_by jest ustawiane
-- przez trigger BEFORE (005/006), więc w punkcie 4 ma już wartość.
--
-- ŚWIADOMY KOMPROMIS: klauzula nie wygasa po zakończeniu instrukcji,
-- więc osoba usunięta później z organizacji lub projektu zachowa
-- prawo ODCZYTU tego jednego wiersza. Zakres wycieku jest ograniczony
-- do metadanych (nazwa, opis) — polityki UPDATE i DELETE pozostają
-- nietknięte, a wiersze podrzędne dalej wymagają członkostwa, bo ich
-- polityki pytają o project_access(project_id).
--
-- Rozważona alternatywa: odroczony klucz obcy i tworzenie członkostwa
-- w triggerze BEFORE. Odrzucona — DEFERRABLE INITIALLY DEFERRED na
-- kluczu obcym członkostwa zmienia zachowanie każdej transakcji
-- dotykającej tych tabel, żeby naprawić jeden przypadek brzegowy.
-- ============================================================

BEGIN;


-- ============================================================
-- 1. ORGANIZACJE
-- ============================================================

DROP POLICY IF EXISTS organizations_select ON public.organizations;

CREATE POLICY organizations_select
ON public.organizations
FOR SELECT
TO authenticated
USING (
    private.is_org_member(id)
    OR created_by = auth.uid()
);


-- ============================================================
-- 2. PROJEKTY
-- ============================================================

DROP POLICY IF EXISTS projects_select ON public.projects;

CREATE POLICY projects_select
ON public.projects
FOR SELECT
TO authenticated
USING (
    private.project_access(id)
    OR created_by = auth.uid()
);


COMMIT;
