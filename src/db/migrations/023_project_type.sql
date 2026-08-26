-- ============================================================
-- GUIDON - MIGRACJA 023
-- Typ projektu (Gra / Strona / Aplikacja mobilna / API / Narzędzie / Inne)
-- ============================================================
--
-- Uruchomić PO 022.
--
-- Czysto opisowe pole, wybierane przy tworzeniu projektu i w ustawieniach -
-- na razie wyświetlane jako badge, bez wpływu na inne funkcje. NULL dla
-- projektów sprzed tej migracji (brak wymuszonej wartości domyślnej).
--
-- WAŻNE: 014/017/018 zawęziły GRANT UPDATE na projects do konkretnej listy
-- kolumn (luka self-elevation - patrz komentarze w tych migracjach). Nowa
-- kolumna musi trafić do tej listy w tej samej migracji, inaczej zapis z
-- ustawień projektu dostanie "permission denied" mimo przejścia RLS.
-- ============================================================

BEGIN;


ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_type text
    CHECK (project_type IS NULL OR project_type IN ('game', 'website', 'mobile_app', 'api', 'tool', 'other'));


REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (name, description, status, color, allow_ai_auto_complete, avatar_url, project_type)
    ON public.projects
    TO authenticated;


COMMIT;
