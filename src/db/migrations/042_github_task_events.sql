-- ============================================================
-- GUIDON - MIGRACJA 042
-- Integracja GitHub -> zadania: rejestr przetworzonych zdarzen
-- ============================================================
--
-- Uruchomic PO 041.
--
-- Webhook GitHub App (src/app/api/github/webhook/route.ts) zamienia
-- commity i pull requesty odwolujace sie do zadania (guidon#1a2b3c4d)
-- na komentarz + zmiane statusu. GitHub dostarcza webhooki "co najmniej
-- raz" (ponowienia, recznie "Redeliver", ten sam commit wypchniety na
-- kolejna galaz) - bez tej tabeli to samo zdarzenie dodaloby komentarz
-- drugi raz. Jeden wiersz = (zadanie, klucz zdarzenia), np.
-- ('...', 'commit:<sha>') albo ('...', 'pr:12:closed'); INSERT ... ON
-- CONFLICT DO NOTHING RETURNING mowi webhookowi, czy to pierwsze
-- przetworzenie.
--
-- RLS jak task_comments (001): odczyt dla kazdego czlonka projektu,
-- wstawianie dla owner/admin/developer - webhook dziala jako osoba, ktora
-- polaczyla repozytorium (github_connections.connected_by), wiec jesli
-- ta osoba straci role w projekcie, integracja przestaje pisac zamiast
-- omijac RLS.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.github_task_events (
    task_id     uuid        NOT NULL,
    event_key   text        NOT NULL CHECK (length(event_key) BETWEEN 1 AND 200),
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, event_key)
);

ALTER TABLE public.github_task_events
DROP CONSTRAINT IF EXISTS github_task_events_task_id_fkey;

ALTER TABLE public.github_task_events
    ADD CONSTRAINT github_task_events_task_id_fkey
        FOREIGN KEY (task_id)
            REFERENCES public.tasks(id)
            ON DELETE CASCADE;


ALTER TABLE public.github_task_events ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS github_task_events_select ON public.github_task_events;
CREATE POLICY github_task_events_select
ON public.github_task_events
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = github_task_events.task_id
          AND private.project_access(t.project_id)
    )
);

DROP POLICY IF EXISTS github_task_events_insert ON public.github_task_events;
CREATE POLICY github_task_events_insert
ON public.github_task_events
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = github_task_events.task_id
          AND private.project_role(t.project_id) IN ('owner', 'admin', 'developer')
    )
);


GRANT SELECT, INSERT ON public.github_task_events TO authenticated;


COMMIT;
