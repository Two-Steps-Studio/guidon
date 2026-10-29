-- ============================================================
-- GUIDON - MIGRACJA 102
-- Prośby agentów o zgodę: centralna skrzynka akceptacji
-- ============================================================
--
-- Uruchomić PO 101 (numeracja zostawia luki - kolejność plików wystarcza).
--
-- KONTEKST
-- --------
-- Agent (klucz API / aplikacja MCP) bez prawa do ryzykownej akcji
-- (ukończenie zadania, usunięcie zadania - przełączniki AI Permissions,
-- 016) dostawał tylko 403. Teraz może poprosić o zgodę: prośba trafia do
-- skrzynki projektu, właściciel lub admin ją akceptuje albo odrzuca z
-- komentarzem. Akcję wykonuje dopiero akceptujący człowiek, swoimi
-- uprawnieniami (RLS tasks_*), a odrzucenie niczego nie zmienia.
--
-- - public.request_agent_approval: tworzy prośbę jako właściciel klucza
--   (rola owner/admin/developer, klucz jego i nieodwołany). Jedna
--   oczekująca prośba na zadanie i akcję - ponowna prośba zwraca istniejącą
--   (created=false), więc agent ponawiający zapytanie nie zasypuje
--   powiadomieniami.
-- - public.decide_agent_approval: owner/admin, tylko prośba oczekująca i
--   nieprzeterminowana; blokada wiersza, więc dwie równoczesne decyzje nie
--   przejdą obie. Status zmienia się PRZED wykonaniem akcji - odrzucenie i
--   wyścig nigdy niczego nie wykonują.
-- - public.mark_agent_approval_failed: gdy zaakceptowana akcja się nie
--   udała, ten sam człowiek zapisuje błąd (status failed), zamiast udawać
--   wykonanie.
--
-- task_id ON DELETE SET NULL: po usunięciu zadania prośba (i jej decyzja)
-- zostaje w historii; snapshot trzyma tytuł i status z chwili prośby.
-- Wygaśnięcie: expires_at (7 dni); przeterminowanej nie da się zatwierdzić.
--
-- Zapis tylko przez funkcje; czytają członkowie projektu.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_approval_requests (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    task_id          uuid        REFERENCES public.tasks(id) ON DELETE SET NULL,
    action           text        NOT NULL CHECK (action IN ('complete_task', 'delete_task')),
    reason           text        CHECK (reason IS NULL OR char_length(reason) <= 2000),
    snapshot         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    requested_by     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    api_key_id       uuid        REFERENCES public.api_keys(id) ON DELETE SET NULL,
    app_name         text        CHECK (app_name IS NULL OR char_length(app_name) <= 120),
    status           text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'failed')),
    decided_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at       timestamptz,
    decision_comment text        CHECK (decision_comment IS NULL OR char_length(decision_comment) <= 2000),
    created_at       timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
CREATE INDEX IF NOT EXISTS agent_approval_requests_project
    ON public.agent_approval_requests (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_approval_requests_task ON public.agent_approval_requests (task_id);
CREATE UNIQUE INDEX IF NOT EXISTS agent_approval_requests_one_pending
    ON public.agent_approval_requests (task_id, action) WHERE status = 'pending';

ALTER TABLE public.agent_approval_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_approval_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_approval_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_approval_requests TO service_role;

DROP POLICY IF EXISTS agent_approval_requests_select ON public.agent_approval_requests;
CREATE POLICY agent_approval_requests_select ON public.agent_approval_requests FOR SELECT TO authenticated
    USING (private.project_access(project_id));

CREATE OR REPLACE FUNCTION public.request_agent_approval(
    p_task_id  uuid,
    p_action   text,
    p_reason   text,
    p_key_id   uuid,
    p_app_name text
)
RETURNS TABLE (id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task  record;
    v_id    uuid;
BEGIN
    IF p_action NOT IN ('complete_task', 'delete_task') THEN
        RAISE EXCEPTION 'Unknown action' USING ERRCODE = '22023';
    END IF;
    SELECT t.id, t.project_id, t.title, t.status INTO v_task FROM public.tasks t WHERE t.id = p_task_id;
    IF v_task.id IS NULL OR COALESCE(private.project_role(v_task.project_id), '') NOT IN ('owner', 'admin', 'developer') THEN
        RAISE EXCEPTION 'You cannot ask for approval on this task' USING ERRCODE = '42501';
    END IF;
    IF p_key_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.api_keys k
        WHERE k.id = p_key_id AND k.user_id = (SELECT auth.uid()) AND k.revoked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'The key is not yours' USING ERRCODE = '42501';
    END IF;

    -- An expired request no longer blocks a new one.
    UPDATE public.agent_approval_requests r SET status = 'expired'
    WHERE r.task_id = p_task_id AND r.action = p_action AND r.status = 'pending' AND r.expires_at <= now();

    INSERT INTO public.agent_approval_requests AS r
        (project_id, task_id, action, reason, snapshot, requested_by, api_key_id, app_name)
    VALUES (
        v_task.project_id, p_task_id, p_action, NULLIF(btrim(p_reason), ''),
        jsonb_build_object('title', v_task.title, 'status', v_task.status),
        (SELECT auth.uid()), p_key_id, NULLIF(btrim(left(p_app_name, 120)), '')
    )
    ON CONFLICT (task_id, action) WHERE status = 'pending' DO NOTHING
    RETURNING r.id INTO v_id;

    IF v_id IS NOT NULL THEN
        RETURN QUERY SELECT v_id, true;
    ELSE
        RETURN QUERY SELECT r.id, false FROM public.agent_approval_requests r
        WHERE r.task_id = p_task_id AND r.action = p_action AND r.status = 'pending';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_agent_approval(
    p_id      uuid,
    p_approve boolean,
    p_comment text
)
RETURNS SETOF public.agent_approval_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_row public.agent_approval_requests;
BEGIN
    SELECT * INTO v_row FROM public.agent_approval_requests r WHERE r.id = p_id FOR UPDATE;
    IF v_row.id IS NULL OR COALESCE(private.project_role(v_row.project_id), '') NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Only project owners and admins can decide' USING ERRCODE = '42501';
    END IF;
    IF v_row.status <> 'pending' THEN
        RAISE EXCEPTION 'Already decided' USING ERRCODE = 'P0001';
    END IF;
    IF v_row.expires_at <= now() THEN
        UPDATE public.agent_approval_requests r SET status = 'expired' WHERE r.id = p_id;
        RAISE EXCEPTION 'Expired' USING ERRCODE = 'P0001';
    END IF;
    IF p_approve AND v_row.task_id IS NULL THEN
        RAISE EXCEPTION 'The task no longer exists' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY
    UPDATE public.agent_approval_requests r
    SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
        decided_by = (SELECT auth.uid()),
        decided_at = now(),
        decision_comment = NULLIF(btrim(left(p_comment, 2000)), '')
    WHERE r.id = p_id
    RETURNING r.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_agent_approval_failed(p_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.agent_approval_requests r
    SET status = 'failed',
        decision_comment = left(concat_ws(E'\n', r.decision_comment, p_error), 2000)
    WHERE r.id = p_id AND r.status = 'approved' AND r.decided_by = (SELECT auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.request_agent_approval(uuid, text, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_agent_approval(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_agent_approval_failed(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_agent_approval(uuid, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_agent_approval(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_agent_approval_failed(uuid, text) TO authenticated;

-- Notifications for owners/admins about a new request.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('task_assigned', 'module_review', 'module_automation', 'agent_approval'));

COMMIT;
