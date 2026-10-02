-- ============================================================
-- GUIDON - MIGRACJA 045
-- Powiadomienia w aplikacji (in-app notifications)
-- ============================================================
--
-- Uruchomic PO 044.
--
-- Pierwszy wyzwalacz: przypisanie zadania do kogos innego (updateTask
-- w projects/[id]/work/actions.ts). Kolejne typy (komentarz, zmiana
-- statusu obserwowanego zadania) moga dojsc pozniej bez zmiany schematu -
-- `type` to zwykly tekst z CHECK, nie enum, wlasnie po to.
--
-- Odbiorca (user_id) prawie zawsze rozni sie od autora akcji (kto inny
-- przypisuje Ci zadanie), wiec - inaczej niz activity_logs_insert (001) czy
-- feedback_insert (044) - "kazdy wstawia tylko wlasny wiersz" nie dziala
-- tutaj w ogole: zwykly `authenticated` nie dostaje ZADNEJ polityki INSERT
-- (ani GRANT INSERT), dokladnie jak stripe_webhook_events (043) - insert
-- dzieje sie wylacznie przez withServiceRole()/createServiceClient() z juz
-- autoryzowanego Server Action (np. updateTask sprawdzil canWriteProject
-- zanim w ogole dojdzie do wywolania createNotification), nigdy
-- bezposrednio z requesta uzytkownika.
--
-- SELECT/UPDATE/DELETE: kazdy widzi, oznacza jako przeczytane i usuwa
-- tylko wlasne powiadomienia.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.notifications (
    id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid        NOT NULL,
    project_id  uuid,
    type        text        NOT NULL CHECK (type IN ('task_assigned')),
    title       text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    body        text        CHECK (body IS NULL OR length(body) <= 1000),
    link        text        NOT NULL CHECK (length(link) BETWEEN 1 AND 500),
    read_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_user_id_fkey
        FOREIGN KEY (user_id)
            REFERENCES public.profiles(id)
            ON DELETE CASCADE;

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_project_id_fkey;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;

-- Polling the unread badge count/list is the hot path (notifications-bell.tsx).
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON public.notifications (user_id, created_at DESC);


ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_delete ON public.notifications;
CREATE POLICY notifications_delete
ON public.notifications
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));


-- Deliberately no INSERT policy and no GRANT INSERT for `authenticated` -
-- see this file's header comment. service_role has BYPASSRLS and an
-- implicit GRANT ALL, so it does not need one either.
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;


COMMIT;
