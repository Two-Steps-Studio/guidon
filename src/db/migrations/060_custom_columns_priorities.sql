-- ============================================================
-- GUIDON - MIGRACJA 060
-- Dowolne kolumny tablicy i priorytety per projekt
-- ============================================================
--
-- Uruchomic PO 059.
--
-- KONTEKST
-- --------
-- Do tej pory tasks.status mial 6 wartosci (CHECK z 016), a
-- project_board_columns (020) zmienialo tylko ich nazwe, kolejnosc i
-- widocznosc. Priorytety byly 4 na sztywno. Teraz projekt moze dodawac
-- wlasne kolumny i priorytety.
--
-- KOLUMNY: wiersz w project_board_columns ze statusem spoza wbudowanej
-- szostki to kolumna wlasna projektu (label wymagany przez aplikacje).
-- Klucz statusu: [a-z][a-z0-9_]{0,39}. is_done mowi, czy zadanie w tej
-- kolumnie jest "zrobione" (wbudowane 'done' zawsze jest). Wbudowane
-- statusy dalej znacza to samo dla API/AI (start -> in_progress /
-- ai_working, complete -> done, nowe zadanie -> backlog).
--
-- PRIORYTETY: project_task_priorities - wbudowane low/medium/high/
-- critical mozna przemianowac, przekolorowac, przestawic (rank) i ukryc;
-- wlasne dodaje sie z nowym kluczem.
--
-- tasks.is_done: utrzymywane przez trigger (status 'done' albo kolumna z
-- is_done), zeby "ukonczone" liczyc jednym warunkiem w kazdym miejscu
-- (pulpit, Moje zadania, postep, API) zamiast porownywac ze slowem 'done'.
--
-- Trigger pilnuje, ze status i priorytet zadania istnieja w jego
-- projekcie, i nie pozwala usunac wlasnej kolumny/priorytetu w uzyciu.
--
-- POPRAWKA validate_task (001): sprawdzenie "created_by = auth.uid()"
-- dzialalo tez przy UPDATE, wiec zadanie mogl edytowac/przesuwac tylko
-- jego tworca - ani reszta zespolu, ani agent AI przez API. Wyjatek
-- "current_user <> 'service_role'" nic nie dawal: funkcja jest SECURITY
-- DEFINER, wiec current_user to zawsze jej wlasciciel. Teraz: INSERT -
-- created_by musi byc zalogowanym uzytkownikiem; UPDATE - created_by nie
-- moze sie zmienic; service role (private.is_service_role, 006) zwolniona.
-- ============================================================

BEGIN;


-- ---------- tasks: otwarte slowniki + is_done ----------

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_status_check CHECK (status ~ '^[a-z][a-z0-9_]{0,39}$');

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_priority_check CHECK (priority ~ '^[a-z][a-z0-9_]{0,39}$');

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_done boolean NOT NULL DEFAULT false;
UPDATE public.tasks SET is_done = (status = 'done') WHERE is_done IS DISTINCT FROM (status = 'done');
CREATE INDEX IF NOT EXISTS idx_tasks_project_is_done ON public.tasks (project_id, is_done);


-- ---------- project_board_columns: wlasne kolumny ----------

ALTER TABLE public.project_board_columns DROP CONSTRAINT IF EXISTS project_board_columns_status_check;
ALTER TABLE public.project_board_columns
    ADD CONSTRAINT project_board_columns_status_check CHECK (status ~ '^[a-z][a-z0-9_]{0,39}$');

ALTER TABLE public.project_board_columns ADD COLUMN IF NOT EXISTS is_done boolean NOT NULL DEFAULT false;
ALTER TABLE public.project_board_columns ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.project_board_columns DROP CONSTRAINT IF EXISTS project_board_columns_color_check;
ALTER TABLE public.project_board_columns
    ADD CONSTRAINT project_board_columns_color_check CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE public.project_board_columns DROP CONSTRAINT IF EXISTS project_board_columns_label_check;
ALTER TABLE public.project_board_columns
    ADD CONSTRAINT project_board_columns_label_check CHECK (label IS NULL OR char_length(label) <= 50);

-- Usuwanie: wlasnej kolumny (pusta - pilnuje trigger nizej) albo
-- nadpisania wbudowanej (= powrot do domyslnej). Owner/admin jak 020.
DROP POLICY IF EXISTS project_board_columns_delete ON public.project_board_columns;
CREATE POLICY project_board_columns_delete
ON public.project_board_columns
FOR DELETE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'));

GRANT DELETE ON public.project_board_columns TO authenticated;


-- ---------- project_task_priorities ----------

CREATE TABLE IF NOT EXISTS public.project_task_priorities (
    project_id uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    key        text        NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
    label      text        CHECK (label IS NULL OR char_length(label) <= 50),
    color      text        CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
    rank       integer     NOT NULL,
    hidden     boolean     NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, key)
);

ALTER TABLE public.project_task_priorities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_task_priorities_select ON public.project_task_priorities;
CREATE POLICY project_task_priorities_select
ON public.project_task_priorities
FOR SELECT
TO authenticated
USING (private.project_access(project_id));

DROP POLICY IF EXISTS project_task_priorities_insert ON public.project_task_priorities;
CREATE POLICY project_task_priorities_insert
ON public.project_task_priorities
FOR INSERT
TO authenticated
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS project_task_priorities_update ON public.project_task_priorities;
CREATE POLICY project_task_priorities_update
ON public.project_task_priorities
FOR UPDATE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'))
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS project_task_priorities_delete ON public.project_task_priorities;
CREATE POLICY project_task_priorities_delete
ON public.project_task_priorities
FOR DELETE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'));

REVOKE ALL ON public.project_task_priorities FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_task_priorities TO authenticated;


-- ---------- poprawka validate_task (patrz KONTEKST) ----------

CREATE OR REPLACE FUNCTION private.validate_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    assignee_exists boolean;
    decision_project uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.created_by IS NULL THEN
            NEW.created_by := (SELECT auth.uid());
        END IF;
        IF (SELECT auth.uid()) IS NOT NULL
           AND NEW.created_by IS DISTINCT FROM (SELECT auth.uid())
           AND NOT private.is_service_role()
        THEN
            RAISE EXCEPTION 'created_by must match authenticated user';
        END IF;
    ELSIF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT private.is_service_role() THEN
        RAISE EXCEPTION 'created_by cannot be changed';
    END IF;

    IF NEW.assignee_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = NEW.project_id AND pm.user_id = NEW.assignee_id
        ) INTO assignee_exists;
        IF NOT assignee_exists THEN
            RAISE EXCEPTION 'Task assignee must belong to the project';
        END IF;
    END IF;

    IF NEW.decision_id IS NOT NULL THEN
        SELECT cd.project_id INTO decision_project
        FROM public.context_decisions cd WHERE cd.id = NEW.decision_id;
        IF decision_project IS NULL THEN
            RAISE EXCEPTION 'Referenced decision does not exist';
        END IF;
        IF decision_project <> NEW.project_id THEN
            RAISE EXCEPTION 'Task decision must belong to the same project';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


-- ---------- triggery ----------

-- SECURITY DEFINER: sprawdza slowniki projektu niezaleznie od tego, czy
-- piszacy (np. klucz AI z rola developer) widzi je przez RLS - i tak
-- widzi, ale walidacja nie powinna od tego zalezec.
CREATE OR REPLACE FUNCTION private.validate_task_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.status NOT IN ('backlog', 'todo', 'in_progress', 'ai_working', 'review', 'done')
       AND NOT EXISTS (
           SELECT 1 FROM public.project_board_columns c
           WHERE c.project_id = NEW.project_id AND c.status = NEW.status
       )
    THEN
        RAISE EXCEPTION 'Unknown status "%" for this project', NEW.status USING ERRCODE = '23514';
    END IF;

    IF NEW.priority NOT IN ('low', 'medium', 'high', 'critical')
       AND NOT EXISTS (
           SELECT 1 FROM public.project_task_priorities p
           WHERE p.project_id = NEW.project_id AND p.key = NEW.priority
       )
    THEN
        RAISE EXCEPTION 'Unknown priority "%" for this project', NEW.priority USING ERRCODE = '23514';
    END IF;

    NEW.is_done := NEW.status = 'done' OR EXISTS (
        SELECT 1 FROM public.project_board_columns c
        WHERE c.project_id = NEW.project_id AND c.status = NEW.status AND c.is_done
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_task_workflow ON public.tasks;
CREATE TRIGGER validate_task_workflow
BEFORE INSERT OR UPDATE OF status, priority, project_id, is_done ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.validate_task_workflow();


-- Zmiana is_done wlasnej kolumny przelicza zadania, ktore w niej stoja.
CREATE OR REPLACE FUNCTION private.sync_column_is_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.status <> 'done' AND NEW.is_done IS DISTINCT FROM COALESCE(OLD.is_done, false) THEN
        UPDATE public.tasks SET is_done = NEW.is_done
        WHERE project_id = NEW.project_id AND status = NEW.status;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_column_is_done ON public.project_board_columns;
CREATE TRIGGER sync_column_is_done
AFTER INSERT OR UPDATE OF is_done ON public.project_board_columns
FOR EACH ROW EXECUTE FUNCTION private.sync_column_is_done();


-- Wlasnej kolumny/priorytetu w uzyciu nie da sie usunac (zadania stracilyby
-- status). Nadpisania wbudowanych mozna usuwac zawsze.
CREATE OR REPLACE FUNCTION private.protect_used_workflow_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Usuwanie calego projektu: kaskada moze dojsc tu przed zadaniami.
    IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = OLD.project_id) THEN
        RETURN OLD;
    END IF;

    IF TG_TABLE_NAME = 'project_board_columns' THEN
        IF OLD.status NOT IN ('backlog', 'todo', 'in_progress', 'ai_working', 'review', 'done')
           AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.project_id = OLD.project_id AND t.status = OLD.status)
        THEN
            RAISE EXCEPTION 'This column still has tasks - move them first' USING ERRCODE = '23503';
        END IF;
    ELSE
        IF OLD.key NOT IN ('low', 'medium', 'high', 'critical')
           AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.project_id = OLD.project_id AND t.priority = OLD.key)
        THEN
            RAISE EXCEPTION 'Tasks still use this priority - change them first' USING ERRCODE = '23503';
        END IF;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_used_column ON public.project_board_columns;
CREATE TRIGGER protect_used_column
BEFORE DELETE ON public.project_board_columns
FOR EACH ROW EXECUTE FUNCTION private.protect_used_workflow_values();

DROP TRIGGER IF EXISTS protect_used_priority ON public.project_task_priorities;
CREATE TRIGGER protect_used_priority
BEFORE DELETE ON public.project_task_priorities
FOR EACH ROW EXECUTE FUNCTION private.protect_used_workflow_values();


COMMIT;
