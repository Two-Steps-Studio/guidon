-- ============================================================
-- GUIDON - MIGRACJA 090
-- Context Engine: kanoniczny dziennik zdarzeń (event capture)
-- ============================================================
--
-- Uruchomić PO 089.
--
-- context_events to jeden, append-only strumień tego, co się dzieje w
-- projekcie: zadania, komentarze, decyzje, źródła wiedzy, pliki, próby
-- agentów AI (task_attempts) i zdarzenia GitHuba (github_task_events).
--
-- Zapis robią triggery na tabelach źródłowych, w TEJ SAMEJ transakcji co
-- zmiana (wzorzec outbox): zmiana bez zdarzenia albo zdarzenie bez zmiany
-- jest niemożliwe, niezależnie od ścieżki (Server Action, /api/v1, MCP,
-- webhook GitHuba, oba tryby bazy). Wycofana transakcja nie zostawia
-- zdarzenia.
--
-- Kanoniczny kształt:
--   source       guidon | github | agent - skąd zdarzenie przyszło
--   entity_type  task | comment | decision | source | file | attempt
--   entity_id    id wiersza; event_type np. task.status_changed
--   actor_id     auth.uid() wywołującego, a bez niego autor wiersza
--   occurred_at  kiedy to się stało (dla utworzeń: created_at wiersza)
--   received_at  kiedy zdarzenie trafiło do dziennika
--   organization_id / project_id - wyliczane w triggerze z wiersza
--                (projects.organization_id), nigdy z danych wywołującego:
--                granica tenanta nie zależy od aplikacji
--   dedupe_key   unikalny w organizacji; ON CONFLICT DO NOTHING, więc
--                ponowiony webhook GitHuba albo ponowiony backfill nie
--                tworzy duplikatu
--   payload      tylko referencje: id, nazwy zmienionych pól, statusy.
--                Bez tytułów, treści, URL-i ani niczego, co mogłoby być
--                sekretem - po treść konsument sięga do encji (przez RLS)
--   seq          kursor odczytu i replay (rosnący)
--   tx_id        transakcja, która zapisała zdarzenie - public.
--                list_context_events zwraca tylko zdarzenia z transakcji
--                już zakończonych przed najstarszą wciąż trwającą, więc
--                czytelnik idący po seq nie przeskoczy zdarzenia, które
--                dostało niższy seq, ale zatwierdziło się później
--
-- Odczyt: każdy z dostępem do projektu (ta sama reguła co
-- activity_logs_select). Zapis: tylko triggery (SECURITY DEFINER) i
-- service role; nikt nie ma UPDATE ani DELETE poza service role -
-- dziennik audytowy. Usunięcie projektu/organizacji usuwa jego zdarzenia.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.context_events (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    seq              bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
    organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id       uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    source           text        NOT NULL CHECK (source IN ('guidon', 'github', 'agent')),
    entity_type      text        NOT NULL CHECK (entity_type IN ('task', 'comment', 'decision', 'source', 'file', 'attempt')),
    entity_id        uuid        NOT NULL,
    event_type       text        NOT NULL CHECK (event_type ~ '^[a-z]+\.[a-z_]+$' AND char_length(event_type) <= 64),
    actor_id         uuid,
    occurred_at      timestamptz NOT NULL,
    received_at      timestamptz NOT NULL DEFAULT now(),
    dedupe_key       text        NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 200),
    payload          jsonb       NOT NULL DEFAULT '{}'::jsonb
                                 CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 2048),
    tx_id            xid8        NOT NULL DEFAULT pg_current_xact_id(),
    UNIQUE (organization_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS context_events_project_seq ON public.context_events (project_id, seq);
CREATE INDEX IF NOT EXISTS context_events_entity ON public.context_events (entity_type, entity_id);

ALTER TABLE public.context_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.context_events FROM anon, authenticated;
GRANT SELECT ON public.context_events TO authenticated;
GRANT ALL ON public.context_events TO service_role;

DROP POLICY IF EXISTS context_events_select ON public.context_events;
CREATE POLICY context_events_select
ON public.context_events
FOR SELECT
TO authenticated
USING (private.project_access(project_id));


-- One insert path for every trigger. Skips silently when the project is
-- already gone: a project deletion cascades to its tasks/comments, and
-- their delete triggers must not try to log against a deleted project.
CREATE OR REPLACE FUNCTION private.emit_context_event(
    p_project_id  uuid,
    p_source      text,
    p_entity_type text,
    p_entity_id   uuid,
    p_event_type  text,
    p_actor_id    uuid,
    p_occurred_at timestamptz,
    p_dedupe_key  text,
    p_payload     jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF p_project_id IS NULL THEN
        RETURN;
    END IF;
    SELECT p.organization_id INTO v_org FROM public.projects p WHERE p.id = p_project_id;
    IF v_org IS NULL THEN
        RETURN;
    END IF;
    INSERT INTO public.context_events
        (organization_id, project_id, source, entity_type, entity_id, event_type, actor_id, occurred_at, dedupe_key, payload)
    VALUES
        (v_org, p_project_id, p_source, p_entity_type, p_entity_id, p_event_type,
         COALESCE((SELECT auth.uid()), p_actor_id), COALESCE(p_occurred_at, now()), p_dedupe_key,
         jsonb_strip_nulls(COALESCE(p_payload, '{}'::jsonb)))
    ON CONFLICT (organization_id, dedupe_key) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION private.emit_context_event(uuid, text, text, uuid, text, uuid, timestamptz, text, jsonb) FROM PUBLIC;


-- Names of the columns that differ between two versions of a row, minus
-- the ones every write touches anyway.
CREATE OR REPLACE FUNCTION private.changed_fields(p_old jsonb, p_new jsonb, p_ignore text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT COALESCE(array_agg(n.key ORDER BY n.key), '{}')
    FROM jsonb_each(p_new) n
    WHERE NOT (n.key = ANY (p_ignore))
      AND (p_old -> n.key) IS DISTINCT FROM n.value;
$$;
REVOKE ALL ON FUNCTION private.changed_fields(jsonb, jsonb, text[]) FROM PUBLIC;


-- ---- tasks ------------------------------------------------------------
-- Updates are keyed by tasks.revision (086), which goes up by one on every
-- write. A write that only reorders the board (sort_order) is not an event.
CREATE OR REPLACE FUNCTION private.capture_task_event() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_fields text[];
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM private.emit_context_event(NEW.project_id, 'guidon', 'task', NEW.id, 'task.created', NEW.created_by,
            NEW.created_at, 'task:' || NEW.id || ':created',
            jsonb_build_object('status', NEW.status, 'priority', NEW.priority, 'parent_task_id', NEW.parent_task_id));
        RETURN NULL;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM private.emit_context_event(OLD.project_id, 'guidon', 'task', OLD.id, 'task.deleted', NULL,
            now(), 'task:' || OLD.id || ':deleted',
            jsonb_build_object('parent_task_id', OLD.parent_task_id));
        RETURN NULL;
    END IF;

    v_fields := private.changed_fields(to_jsonb(OLD), to_jsonb(NEW), ARRAY['sort_order', 'updated_at', 'revision']);
    IF cardinality(v_fields) = 0 THEN
        RETURN NULL;
    END IF;
    PERFORM private.emit_context_event(NEW.project_id, 'guidon', 'task', NEW.id,
        CASE WHEN 'status' = ANY (v_fields) THEN 'task.status_changed' ELSE 'task.updated' END,
        NULL, now(), 'task:' || NEW.id || ':rev:' || NEW.revision,
        jsonb_build_object('fields', to_jsonb(v_fields))
          || CASE WHEN 'status' = ANY (v_fields)
                  THEN jsonb_build_object('from', OLD.status, 'to', NEW.status) ELSE '{}'::jsonb END);
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.capture_task_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS capture_context_event ON public.tasks;
CREATE TRIGGER capture_context_event
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.capture_task_event();


-- ---- comments, decisions, sources, files --------------------------------
-- Updates of these have no revision column: the key is the transaction id,
-- so two real edits are two events and a retry inside one transaction is one.
CREATE OR REPLACE FUNCTION private.capture_row_event() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_entity  text := TG_ARGV[0];
    v_row     jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    v_id      uuid := (v_row ->> 'id')::uuid;
    v_project uuid;
    v_actor   uuid;
    v_payload jsonb := '{}'::jsonb;
    v_fields  text[];
    v_verb    text := CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END;
    v_key     text;
BEGIN
    IF v_entity = 'comment' THEN
        SELECT t.project_id INTO v_project FROM public.tasks t WHERE t.id = (v_row ->> 'task_id')::uuid;
        v_actor := (v_row ->> 'author_id')::uuid;
        v_payload := jsonb_build_object('task_id', v_row ->> 'task_id');
    ELSE
        v_project := (v_row ->> 'project_id')::uuid;
        v_actor := COALESCE(v_row ->> 'made_by', v_row ->> 'uploaded_by')::uuid;
        IF v_entity = 'decision' THEN
            v_payload := jsonb_build_object('status', v_row ->> 'status', 'decision_type', v_row ->> 'decision_type');
        ELSIF v_entity = 'source' THEN
            v_payload := jsonb_build_object('source_type', v_row ->> 'source_type');
        ELSIF v_entity = 'file' THEN
            v_payload := jsonb_build_object('category', v_row ->> 'category', 'size_bytes', v_row -> 'size_bytes');
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_fields := private.changed_fields(to_jsonb(OLD), v_row, ARRAY['updated_at']);
        IF cardinality(v_fields) = 0 THEN
            RETURN NULL;
        END IF;
        v_payload := v_payload || jsonb_build_object('fields', to_jsonb(v_fields));
        v_key := v_entity || ':' || v_id || ':updated:' || pg_current_xact_id()::text;
        v_actor := NULL;
    ELSE
        v_key := v_entity || ':' || v_id || ':' || v_verb;
        IF TG_OP = 'DELETE' THEN
            v_actor := NULL;
        END IF;
    END IF;

    PERFORM private.emit_context_event(v_project, 'guidon', v_entity, v_id, v_entity || '.' || v_verb, v_actor,
        CASE WHEN TG_OP = 'INSERT' THEN (v_row ->> 'created_at')::timestamptz ELSE now() END,
        v_key, v_payload);
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.capture_row_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS capture_context_event ON public.task_comments;
CREATE TRIGGER capture_context_event
AFTER INSERT OR UPDATE OR DELETE ON public.task_comments
FOR EACH ROW EXECUTE FUNCTION private.capture_row_event('comment');

DROP TRIGGER IF EXISTS capture_context_event ON public.context_decisions;
CREATE TRIGGER capture_context_event
AFTER INSERT OR UPDATE OR DELETE ON public.context_decisions
FOR EACH ROW EXECUTE FUNCTION private.capture_row_event('decision');

DROP TRIGGER IF EXISTS capture_context_event ON public.context_sources;
CREATE TRIGGER capture_context_event
AFTER INSERT OR UPDATE OR DELETE ON public.context_sources
FOR EACH ROW EXECUTE FUNCTION private.capture_row_event('source');

DROP TRIGGER IF EXISTS capture_context_event ON public.project_files;
CREATE TRIGGER capture_context_event
AFTER INSERT OR DELETE ON public.project_files
FOR EACH ROW EXECUTE FUNCTION private.capture_row_event('file');


-- ---- AI agent runs (task_attempts) and GitHub --------------------------
CREATE OR REPLACE FUNCTION private.capture_attempt_event() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.emit_context_event(
        (SELECT t.project_id FROM public.tasks t WHERE t.id = NEW.task_id),
        'agent', 'attempt', NEW.id, 'attempt.recorded', NEW.created_by, NEW.created_at,
        'attempt:' || NEW.id || ':recorded',
        jsonb_build_object('task_id', NEW.task_id, 'outcome', NEW.outcome, 'agent', left(NEW.agent, 64)));
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.capture_attempt_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS capture_context_event ON public.task_attempts;
CREATE TRIGGER capture_context_event
AFTER INSERT ON public.task_attempts
FOR EACH ROW EXECUTE FUNCTION private.capture_attempt_event();

-- github_task_events.event_key is GitHub's own idempotency key
-- ('commit:<sha>', 'pr:12:closed'). The webhook deletes the row when
-- processing fails so a redelivery can retry; the redelivery then hits
-- the same dedupe_key here and adds no second event.
CREATE OR REPLACE FUNCTION private.capture_github_event() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.emit_context_event(
        (SELECT t.project_id FROM public.tasks t WHERE t.id = NEW.task_id),
        'github', 'task', NEW.task_id,
        CASE WHEN NEW.event_key LIKE 'commit:%' THEN 'github.commit_linked' ELSE 'github.pull_request' END,
        NULL, NEW.created_at, 'github:' || NEW.task_id || ':' || left(NEW.event_key, 120),
        jsonb_build_object('event_key', left(NEW.event_key, 120)));
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.capture_github_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS capture_context_event ON public.github_task_events;
CREATE TRIGGER capture_context_event
AFTER INSERT ON public.github_task_events
FOR EACH ROW EXECUTE FUNCTION private.capture_github_event();


-- ---- reading and replay -------------------------------------------------
-- Events of one project after a cursor (seq), oldest first. Only events
-- whose transaction ended before the oldest one still running: an event
-- that took a lower seq but commits later is not skipped by a reader that
-- already moved past it. SECURITY INVOKER - RLS decides what is visible.
CREATE OR REPLACE FUNCTION public.list_context_events(
    p_project_id uuid,
    p_after_seq  bigint DEFAULT 0,
    p_limit      integer DEFAULT 100
)
    RETURNS TABLE (
        id uuid, seq bigint, organization_id uuid, project_id uuid, source text,
        entity_type text, entity_id uuid, event_type text, actor_id uuid,
        occurred_at timestamptz, received_at timestamptz, dedupe_key text, payload jsonb
    )
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = ''
AS $$
    SELECT e.id, e.seq, e.organization_id, e.project_id, e.source, e.entity_type, e.entity_id,
           e.event_type, e.actor_id, e.occurred_at, e.received_at, e.dedupe_key, e.payload
    FROM public.context_events e
    WHERE e.project_id = p_project_id
      AND e.seq > COALESCE(p_after_seq, 0)
      AND e.tx_id < pg_snapshot_xmin(pg_current_snapshot())
    ORDER BY e.seq
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 501);
$$;
REVOKE ALL ON FUNCTION public.list_context_events(uuid, bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_context_events(uuid, bigint, integer) TO authenticated, service_role;


-- Backfill: one *.created event for every row that existed before this
-- migration, with the same dedupe keys the triggers use - running it again
-- (or after the triggers already logged a row) adds nothing.
INSERT INTO public.context_events
    (organization_id, project_id, source, entity_type, entity_id, event_type, actor_id, occurred_at, dedupe_key, payload)
SELECT p.organization_id, t.project_id, 'guidon', 'task', t.id, 'task.created', t.created_by, COALESCE(t.created_at, now()),
       'task:' || t.id || ':created',
       jsonb_strip_nulls(jsonb_build_object('status', t.status, 'priority', t.priority, 'parent_task_id', t.parent_task_id, 'backfilled', true))
FROM public.tasks t JOIN public.projects p ON p.id = t.project_id
UNION ALL
SELECT p.organization_id, t.project_id, 'guidon', 'comment', c.id, 'comment.created', c.author_id, COALESCE(c.created_at, now()),
       'comment:' || c.id || ':created', jsonb_build_object('task_id', c.task_id, 'backfilled', true)
FROM public.task_comments c JOIN public.tasks t ON t.id = c.task_id JOIN public.projects p ON p.id = t.project_id
UNION ALL
SELECT p.organization_id, d.project_id, 'guidon', 'decision', d.id, 'decision.created', d.made_by, COALESCE(d.created_at, now()),
       'decision:' || d.id || ':created',
       jsonb_strip_nulls(jsonb_build_object('status', d.status, 'decision_type', d.decision_type, 'backfilled', true))
FROM public.context_decisions d JOIN public.projects p ON p.id = d.project_id
UNION ALL
SELECT p.organization_id, s.project_id, 'guidon', 'source', s.id, 'source.created', NULL, COALESCE(s.created_at, now()),
       'source:' || s.id || ':created',
       jsonb_strip_nulls(jsonb_build_object('source_type', s.source_type, 'backfilled', true))
FROM public.context_sources s JOIN public.projects p ON p.id = s.project_id
UNION ALL
SELECT p.organization_id, a_t.project_id, 'agent', 'attempt', a.id, 'attempt.recorded', a.created_by, COALESCE(a.created_at, now()),
       'attempt:' || a.id || ':recorded',
       jsonb_strip_nulls(jsonb_build_object('task_id', a.task_id, 'outcome', a.outcome, 'agent', left(a.agent, 64), 'backfilled', true))
FROM public.task_attempts a JOIN public.tasks a_t ON a_t.id = a.task_id JOIN public.projects p ON p.id = a_t.project_id
ORDER BY 8
ON CONFLICT (organization_id, dedupe_key) DO NOTHING;


COMMIT;
