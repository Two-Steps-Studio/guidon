-- ============================================================
-- GUIDON - MIGRACJA 016
-- AI Task API: status ai_working, api_keys, project_ai_permissions
-- ============================================================
--
-- Uruchomić PO 015.
--
-- Cykl życia taska dla agenta AI: todo/backlog -> ai_working -> review ->
-- done. `review` już istnieje (migracja 002) - jedyny nowy stan to
-- ai_working. `ai_working -> done` bezpośrednio wymaga jednocześnie
-- projects.allow_ai_auto_complete=true I uprawnienia can_complete_tasks -
-- domyślnie oba wyłączone, zgodnie z wprost wyrażonym wymogiem: AI nie
-- oznacza tasków jako ukończone bez wyraźnej zgody.
--
-- api_keys: hash (sha256), nigdy plaintext. Revoke to UPDATE tylko kolumny
-- revoked_at (GRANT UPDATE na tej jednej kolumnie) - właściciel klucza NIE
-- może zmienić scopes/key_hash własnego klucza, ta sama lekcja co
-- project_limit w migracji 014. project_ai_permissions: domyślne wartości
-- dokładnie odzwierciedlają listę użytkownika - read/comment/status wł.,
-- complete/modify/delete wył.
-- ============================================================

BEGIN;


ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_status_check
        CHECK (status IN ('backlog', 'todo', 'in_progress', 'ai_working', 'review', 'done'));


ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS allow_ai_auto_complete boolean NOT NULL DEFAULT false;


CREATE TABLE IF NOT EXISTS public.project_ai_permissions (
    project_id            uuid        NOT NULL PRIMARY KEY,
    can_read_context      boolean     NOT NULL DEFAULT true,
    can_create_comments   boolean     NOT NULL DEFAULT true,
    can_change_status     boolean     NOT NULL DEFAULT true,
    can_complete_tasks    boolean     NOT NULL DEFAULT false,
    can_modify_settings   boolean     NOT NULL DEFAULT false,
    can_delete_tasks      boolean     NOT NULL DEFAULT false,
    updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_ai_permissions
DROP CONSTRAINT IF EXISTS project_ai_permissions_project_id_fkey;

ALTER TABLE public.project_ai_permissions
    ADD CONSTRAINT project_ai_permissions_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


CREATE TABLE IF NOT EXISTS public.api_keys (
    id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           uuid        NOT NULL,
    name              text        NOT NULL CHECK (length(trim(name)) > 0),
    key_prefix        text        NOT NULL,
    key_hash          text        NOT NULL UNIQUE,
    scopes            text[]      NOT NULL DEFAULT '{}',
    created_at        timestamptz NOT NULL DEFAULT now(),
    last_used_at      timestamptz,
    revoked_at        timestamptz
);

ALTER TABLE public.api_keys
DROP CONSTRAINT IF EXISTS api_keys_user_id_fkey;

ALTER TABLE public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey
        FOREIGN KEY (user_id)
            REFERENCES public.profiles(id)
            ON DELETE CASCADE;


ALTER TABLE public.project_ai_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS project_ai_permissions_select ON public.project_ai_permissions;
CREATE POLICY project_ai_permissions_select
ON public.project_ai_permissions
FOR SELECT
TO authenticated
USING (private.project_access(project_id));

DROP POLICY IF EXISTS project_ai_permissions_insert ON public.project_ai_permissions;
CREATE POLICY project_ai_permissions_insert
ON public.project_ai_permissions
FOR INSERT
TO authenticated
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS project_ai_permissions_update ON public.project_ai_permissions;
CREATE POLICY project_ai_permissions_update
ON public.project_ai_permissions
FOR UPDATE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'))
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));


DROP POLICY IF EXISTS api_keys_select ON public.api_keys;
CREATE POLICY api_keys_select
ON public.api_keys
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS api_keys_insert ON public.api_keys;
CREATE POLICY api_keys_insert
ON public.api_keys
FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

-- Revoke is an UPDATE of one column (see the GRANT below), not a DELETE -
-- a revoked key stays as a row (name, scopes, history) rather than
-- disappearing, matching task_attempts' (013) "log entry" instinct.
DROP POLICY IF EXISTS api_keys_revoke ON public.api_keys;
CREATE POLICY api_keys_revoke
ON public.api_keys
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));


GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ai_permissions TO authenticated;

-- api_keys: authenticated gets SELECT/INSERT freely, but UPDATE only on
-- revoked_at - the RLS policy above says "your own row," this GRANT says
-- "only this column," together closing the gap migration 014 first
-- documented: RLS alone doesn't stop a caller from writing columns a
-- policy's role-check never looks at.
GRANT SELECT, INSERT ON public.api_keys TO authenticated;
GRANT UPDATE (revoked_at) ON public.api_keys TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ai_permissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO service_role;


COMMIT;
