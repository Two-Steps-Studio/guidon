-- ============================================================
-- GUIDON - MIGRACJA 097
-- Smart Linking: zadanie <-> commit / PR / galaz, z pochodzeniem i historia
-- ============================================================
--
-- Uruchomic PO 090 (context_events). Niezalezna od 093-096.
--
-- KONTEKST
-- --------
-- Webhook GitHuba (src/app/api/github/webhook/route.ts) zostawial przy
-- zadaniu tylko komentarz i zmiane statusu. task_links zapisuje samo
-- powiazanie jako dane:
--
-- * provenance: explicit_reference (guidon#xxxx w commicie/PR/galezi),
--   manual (ktos dodal recznie), suggestion (wspolne slowa z tytulem
--   zadania - propozycja, nie fakt).
-- * status: confirmed | suggested | rejected. Sugestia ma zawsze
--   confidence < 1 i status suggested, dopoki ktos jej nie potwierdzi;
--   reczne odrzucenie nie jest nadpisywane przez kolejne zdarzenia.
-- * evidence: dlaczego powiazanie istnieje (krotki tekst), decided_by /
--   decided_at: kto potwierdzil lub odrzucil.
-- * Historia: kazde utworzenie, potwierdzenie, odrzucenie i zmiana stanu
--   PR to zdarzenie w context_events (task.link_*), w tej samej
--   transakcji (090).
--
-- RLS jak decyzje: czytaja czlonkowie projektu, zapisuja owner/admin/
-- developer. project_id zawsze z zadania (trigger), wiec nie da sie
-- dopiac powiazania do zadania innego projektu.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_links (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    task_id      uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    kind         text        NOT NULL CHECK (kind IN ('commit', 'pull_request', 'branch')),
    repository   text        NOT NULL CHECK (repository ~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'),
    external_ref text        NOT NULL CHECK (char_length(external_ref) BETWEEN 1 AND 200),
    title        text        CHECK (char_length(title) <= 300),
    url          text        CHECK (char_length(url) <= 420 AND url ~ '^https://github\.com/[^[:space:]]+$'),
    pr_state     text        CHECK (pr_state IN ('open', 'draft', 'merged', 'closed')),
    status       text        NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'suggested', 'rejected')),
    provenance   text        NOT NULL CHECK (provenance IN ('explicit_reference', 'manual', 'suggestion')),
    confidence   numeric(3,2) NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
    evidence     text        CHECK (char_length(evidence) <= 500),
    decided_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (task_id, kind, repository, external_ref),
    -- A suggestion is never presented as certain, and only suggestions wait for review.
    CHECK (provenance <> 'suggestion' OR confidence < 1),
    CHECK (status <> 'suggested' OR provenance = 'suggestion')
);
CREATE INDEX IF NOT EXISTS task_links_task ON public.task_links (task_id, status);
CREATE INDEX IF NOT EXISTS task_links_project ON public.task_links (project_id, kind, repository, external_ref);

-- project_id always comes from the task; updated_at on every change.
CREATE OR REPLACE FUNCTION private.set_task_link_project() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    SELECT t.project_id INTO NEW.project_id FROM public.tasks t WHERE t.id = NEW.task_id;
    IF NEW.project_id IS NULL THEN
        RAISE EXCEPTION 'Task not found' USING ERRCODE = '23503';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.task_id <> OLD.task_id OR NEW.kind <> OLD.kind OR NEW.repository <> OLD.repository OR NEW.external_ref <> OLD.external_ref OR NEW.provenance <> OLD.provenance THEN
            RAISE EXCEPTION 'A link keeps its task, target and provenance' USING ERRCODE = '42501';
        END IF;
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.set_task_link_project() FROM PUBLIC;
DROP TRIGGER IF EXISTS set_task_link_project ON public.task_links;
CREATE TRIGGER set_task_link_project
BEFORE INSERT OR UPDATE ON public.task_links
FOR EACH ROW EXECUTE FUNCTION private.set_task_link_project();

-- History in context_events (entity task): created, confirmed, rejected, pr state.
CREATE OR REPLACE FUNCTION private.capture_task_link_event() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_event text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_event := CASE NEW.status WHEN 'suggested' THEN 'task.link_suggested' ELSE 'task.link_created' END;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        v_event := CASE NEW.status WHEN 'confirmed' THEN 'task.link_confirmed' WHEN 'rejected' THEN 'task.link_rejected' ELSE 'task.link_reopened' END;
    ELSIF NEW.pr_state IS DISTINCT FROM OLD.pr_state THEN
        v_event := 'task.link_pr_state';
    ELSE
        RETURN NULL;
    END IF;
    PERFORM private.emit_context_event(
        NEW.project_id,
        CASE WHEN NEW.provenance = 'manual' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN 'guidon' ELSE 'github' END,
        'task', NEW.task_id, v_event, NEW.decided_by, now(),
        'link:' || NEW.id || ':' || v_event || ':' || COALESCE(NEW.pr_state, '') || ':' || extract(epoch FROM now())::bigint,
        jsonb_build_object('link_id', NEW.id, 'kind', NEW.kind, 'repository', NEW.repository, 'ref', left(NEW.external_ref, 120),
                           'provenance', NEW.provenance, 'status', NEW.status, 'confidence', NEW.confidence, 'pr_state', NEW.pr_state));
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.capture_task_link_event() FROM PUBLIC;
DROP TRIGGER IF EXISTS capture_context_event ON public.task_links;
CREATE TRIGGER capture_context_event
AFTER INSERT OR UPDATE ON public.task_links
FOR EACH ROW EXECUTE FUNCTION private.capture_task_link_event();

ALTER TABLE public.task_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_links FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_links TO authenticated, service_role;

DROP POLICY IF EXISTS task_links_select ON public.task_links;
CREATE POLICY task_links_select ON public.task_links FOR SELECT TO authenticated
    USING (private.project_access(project_id));
DROP POLICY IF EXISTS task_links_insert ON public.task_links;
CREATE POLICY task_links_insert ON public.task_links FOR INSERT TO authenticated
    WITH CHECK (private.project_role(private.entity_project_id('task', task_id)) = ANY (ARRAY['owner', 'admin', 'developer']));
DROP POLICY IF EXISTS task_links_update ON public.task_links;
CREATE POLICY task_links_update ON public.task_links FOR UPDATE TO authenticated
    USING (private.project_role(project_id) = ANY (ARRAY['owner', 'admin', 'developer']))
    WITH CHECK (private.project_role(project_id) = ANY (ARRAY['owner', 'admin', 'developer']));
DROP POLICY IF EXISTS task_links_delete ON public.task_links;
CREATE POLICY task_links_delete ON public.task_links FOR DELETE TO authenticated
    USING (private.project_role(project_id) = ANY (ARRAY['owner', 'admin']));

COMMIT;
