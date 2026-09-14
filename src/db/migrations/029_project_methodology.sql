-- ============================================================
-- GUIDON - MIGRACJA 029
-- Metodologia projektu (Standardowa / Scrum) - część 1/3
-- ============================================================
--
-- Uruchomić PO 028.
--
-- KONTEKST
-- --------
-- Pierwsza część większej funkcji: projekt będzie mógł działać w trybie
-- Scrum (sprinty, backlog, story points, burndown - kolejne części), ale
-- na razie to tylko pole opisowe wybierane przy tworzeniu projektu i w
-- ustawieniach, wyświetlane jako badge - bez wpływu na tablicę Kanban ani
-- roadmapę. Odrębne od project_type (023) - to kategoria (Gra/Strona/...),
-- methodology to sposób pracy (Standardowa/Scrum).
--
-- WAŻNE: 014/017/018/023 zawęziły GRANT UPDATE na projects do konkretnej
-- listy kolumn (luka self-elevation - patrz komentarz w 023). Nowa kolumna
-- musi trafić do tej listy w tej samej migracji, inaczej zapis z ustawień
-- projektu dostanie "permission denied" mimo przejścia RLS.
-- ============================================================

BEGIN;


ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS methodology text NOT NULL DEFAULT 'standard'
    CHECK (methodology IN ('standard', 'scrum'));


REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (name, description, status, color, allow_ai_auto_complete, avatar_url, project_type, methodology)
    ON public.projects
    TO authenticated;


COMMIT;
