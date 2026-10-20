-- ============================================================
-- GUIDON - MIGRACJA 061
-- Automatyczne usuwanie ukonczonych zadan po N dniach
-- ============================================================
--
-- Uruchomic PO 060.
--
-- KONTEKST
-- --------
-- Kolumna Done rosnie bez konca. Projekt moze teraz wlaczyc
-- (projects.done_cleanup_days, NULL = wylaczone) usuwanie zadan, ktore
-- sa ukonczone dluzej niz N dni.
--
-- tasks.done_at: kiedy zadanie zostalo ukonczone. Utrzymywane wylacznie
-- przez trigger (set_task_done_at): ustawiane, gdy is_done staje sie
-- true, czyszczone, gdy zadanie wraca do pracy, a przy kazdej innej
-- zmianie przepisywane ze starego wiersza - klient nie moze go cofnac w
-- przeszlosc (developer nie moze usuwac zadan, wiec "postarzenie" daty
-- byloby obejsciem tasks_delete). Nazwa zaczyna sie od "w", bo triggery
-- BEFORE odpalaja sie alfabetycznie, a is_done liczy validate_task_workflow.
-- Istniejace ukonczone zadania dostaja done_at = updated_at (najlepsze, co
-- mamy).
--
-- public.purge_finished_tasks(project_id): usuwa ukonczone zadania
-- glownego poziomu (subtaski ida z nimi przez ON DELETE CASCADE z 010;
-- ukonczony subtask otwartego zadania zostaje - to czesc zywej listy)
-- starsze niz ustawienie projektu, najwyzej 500 na wywolanie, i zwraca
-- ich liczbe. SECURITY DEFINER, bo wywoluje je aplikacja przy otwarciu
-- tablicy w imieniu kazdego czlonka (takze viewera): robi tylko to, na co
-- owner/admin juz sie zgodzil w ustawieniach, nic wiecej. Wymaga dostepu
-- do projektu (private.project_access, jak tasks_select).
--
-- WAZNE: jak w 055 - GRANT UPDATE na projects jest zawezony do listy
-- kolumn, wiec nowa kolumna trafia do niej w tej samej migracji.
-- ============================================================

BEGIN;


ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS done_at timestamptz;

UPDATE public.tasks
SET done_at = COALESCE(updated_at, created_at, now())
WHERE is_done AND done_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project_done_at
    ON public.tasks (project_id, done_at)
    WHERE is_done AND parent_task_id IS NULL;


CREATE OR REPLACE FUNCTION private.set_task_done_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NOT NEW.is_done THEN
        NEW.done_at := NULL;
    ELSIF TG_OP = 'UPDATE' AND OLD.is_done THEN
        NEW.done_at := COALESCE(OLD.done_at, now());
    ELSE
        NEW.done_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_task_done_at ON public.tasks;
DROP TRIGGER IF EXISTS workflow_set_task_done_at ON public.tasks;
CREATE TRIGGER workflow_set_task_done_at
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.set_task_done_at();


ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS done_cleanup_days integer;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_done_cleanup_days_check;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_done_cleanup_days_check
    CHECK (done_cleanup_days IS NULL OR done_cleanup_days BETWEEN 1 AND 3650);

REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (name, description, status, color, allow_ai_auto_complete, avatar_url, project_type, methodology, ai_enabled, disabled_modules, done_cleanup_days)
    ON public.projects
    TO authenticated;


CREATE OR REPLACE FUNCTION public.purge_finished_tasks(
    p_project_id uuid
)
    RETURNS integer
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_days integer;
    v_count integer;
BEGIN
    IF NOT private.project_access(p_project_id) THEN
        RETURN 0;
    END IF;

    SELECT done_cleanup_days INTO v_days
    FROM public.projects
    WHERE id = p_project_id;

    IF v_days IS NULL THEN
        RETURN 0;
    END IF;

    WITH doomed AS (
        SELECT id
        FROM public.tasks
        WHERE project_id = p_project_id
          AND parent_task_id IS NULL
          AND is_done
          AND done_at < now() - make_interval(days => v_days)
        ORDER BY done_at
        LIMIT 500
    )
    DELETE FROM public.tasks t
    USING doomed
    WHERE t.id = doomed.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL
    ON FUNCTION public.purge_finished_tasks(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.purge_finished_tasks(uuid)
TO authenticated;


COMMIT;
