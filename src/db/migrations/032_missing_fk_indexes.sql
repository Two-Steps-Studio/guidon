-- ============================================================
-- GUIDON - MIGRACJA 032
-- Brakujace indeksy na kolumnach kluczy obcych (ON DELETE SET
-- NULL / NO ACTION w strone profiles/plans)
-- ============================================================
--
-- KONTEKST
-- --------
--
-- Ten sam wzorzec co 027 (idx_api_keys_user): kazda z ponizszych kolumn to
-- FK bez indeksu, gdzie usuniecie wiersza po stronie rodzica (profiles albo
-- plans) wymaga od Postgresa odnalezienia wszystkich odwolujacych sie
-- wierszy - zeby ustawic je na NULL (ON DELETE SET NULL) albo sprawdzic, czy
-- w ogole istnieja (ON DELETE NO ACTION). Bez indeksu to sekwencyjny skan
-- calej tabeli przy kazdym takim usunieciu, nie tylko przy odczycie.
--
-- Zidentyfikowane przez porownanie kazdego FK w public (information_schema)
-- z wiodaca kolumna kazdego istniejacego indeksu - patrz
-- tests/db/compat.test.mjs dla tej samej metody bootstrapu schematu na
-- PGlite uzytej do znalezienia tej listy.
--
-- tasks.created_by jest tu najwazniejsza pozycja: tasks to najwieksza i
-- najczesciej odpytywana tabela w calej aplikacji, a usuniecie konta
-- uzytkownika (profiles, ON DELETE CASCADE z auth.users) bez tego indeksu
-- skanowaloby ja w calosci.
-- ============================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_context_decisions_made_by
    ON public.context_decisions(made_by);

CREATE INDEX IF NOT EXISTS idx_context_sources_author
    ON public.context_sources(author);

CREATE INDEX IF NOT EXISTS idx_invitations_invited_by
    ON public.invitations(invited_by);

CREATE INDEX IF NOT EXISTS idx_project_files_uploaded_by
    ON public.project_files(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_project_memory_created_by
    ON public.project_memory(created_by);

CREATE INDEX IF NOT EXISTS idx_project_memory_verified_by
    ON public.project_memory(verified_by);

CREATE INDEX IF NOT EXISTS idx_roadmap_phases_created_by
    ON public.roadmap_phases(created_by);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id
    ON public.subscriptions(plan_id);

CREATE INDEX IF NOT EXISTS idx_tasks_created_by
    ON public.tasks(created_by);

COMMIT;
