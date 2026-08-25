-- ============================================================
-- GUIDON - MIGRACJA 020
-- Konfigurowalne kolumny tablicy Kanban per projekt
-- ============================================================
--
-- Uruchomić PO 019.
--
-- Nie zmienia tasks.status ani jego CHECK constraint (016) - te 6
-- wartości ('backlog','todo','in_progress','ai_working','review','done')
-- zostaje twardo zakodowane w bazie, bo AI Task API (016) i isDone()
-- (src/lib/work/task-board.ts) zależą od dokładnie tych literałów.
-- Ta migracja dodaje wyłącznie WARSTWĘ WYŚWIETLANIA per projekt: etykieta,
-- kolejność, widoczność - bez rzeczywistych, dowolnych kolumn.
--
-- Brak wiersza dla danego (project_id, status) = użyj domyślnej etykiety/
-- kolejności/widoczności z BOARD_COLUMNS (kod). Projekt, który nigdy nie
-- dostosował tablicy, nie ma tu żadnych wierszy - to jest stan domyślny,
-- nie wymaga seedowania.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.project_board_columns (
    project_id  uuid        NOT NULL,
    status      text        NOT NULL
                CHECK (status IN ('backlog', 'todo', 'in_progress', 'ai_working', 'review', 'done')),
    label       text,
    sort_order  integer     NOT NULL,
    hidden      boolean     NOT NULL DEFAULT false,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, status)
);

ALTER TABLE public.project_board_columns
DROP CONSTRAINT IF EXISTS project_board_columns_project_id_fkey;

ALTER TABLE public.project_board_columns
    ADD CONSTRAINT project_board_columns_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


ALTER TABLE public.project_board_columns ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS project_board_columns_select ON public.project_board_columns;
CREATE POLICY project_board_columns_select
ON public.project_board_columns
FOR SELECT
TO authenticated
USING (private.project_access(project_id));

-- Owner/admin only - mirrors roadmap_phases (001) and the AI Permissions
-- form's own gate: board layout is project configuration, not day-to-day
-- task work.
DROP POLICY IF EXISTS project_board_columns_insert ON public.project_board_columns;
CREATE POLICY project_board_columns_insert
ON public.project_board_columns
FOR INSERT
TO authenticated
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS project_board_columns_update ON public.project_board_columns;
CREATE POLICY project_board_columns_update
ON public.project_board_columns
FOR UPDATE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'))
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));


-- No self-elevation gap here (unlike 014/017's lesson) - every column on
-- this row (label, sort_order, hidden) is legitimately editable by
-- whoever the role-check already allows in; there is no column an owner/
-- admin "shouldn't" be able to touch on their own project's board layout.
GRANT SELECT, INSERT, UPDATE ON public.project_board_columns TO authenticated;


COMMIT;
