-- ============================================================
-- GUIDON — MIGRACJA 013
-- Previous Attempts: task_attempts (TODO.md §22)
-- ============================================================
--
-- Uruchomić PO 012.
--
-- POWÓD
-- -----
-- TODO.md §22 nazywa to jednym z dwóch najbardziej obronnych
-- wyróżników Guidona (obok FACT vs AI INSIGHT, już zrobione w
-- Etapie 3): rejestr nieudanych/częściowych podejść do zadania, tak
-- żeby agent AI (lub człowiek) nie proponował ponownie tego samego
-- rozwiązania, które już zawiodło. Pola z §22: Attempt, Problem,
-- Approach, Result, Failure reason, Files changed, Related PR,
-- Author, Agent, Timestamp.
--
-- KSZTAŁT
-- -------
-- Osobna tabela, nie kolejny memory_type w project_memory — próba ma
-- strukturalne pola (outcome, files_changed, related_pr_url), które
-- w jednym polu tekstowym project_memory.content straciłyby
-- możliwość filtrowania ("pokaż agentowi tylko nieudane próby",
-- dosłowny wymóg z §22) bez parsowania wolnego tekstu.
--
-- `outcome` jest enumem (failed/partial/succeeded), bo to właśnie ta
-- kolumna ma realny cel produktowy: agent-context.ts (§18) może
-- wybrać `WHERE outcome != 'succeeded'` zamiast zgadywać z treści.
-- `result` zostaje wolnym tekstem — co się faktycznie stało, nie
-- tylko klasyfikacja.
--
-- `agent` to wolny tekst (np. "Claude Code", "human", "Cursor"), nie
-- enum — zamknięta lista nazw narzędzi starzałaby się przy każdym
-- nowym agencie, a to pole jest czysto informacyjne, niczego nie
-- bramkuje.
--
-- Świadomie POZA zakresem tej migracji: podłączenie do
-- context_relations/ContextEntityType (§19 graf typowanych relacji).
-- To osobna, większa decyzja integracyjna (nowy typ encji w całym
-- systemie: entity_project_id(), triggery czyszczące z migracji 012,
-- UI grafu) — rdzeń funkcji (zapis/odczyt prób na tasku, eksport do
-- agent-context.ts) nie tego wymaga.
--
-- Brak UPDATE: próba to log zdarzenia, nie edytowalny dokument jak
-- decyzja. Błędny wpis się usuwa i dodaje ponownie, nie edytuje —
-- prostsza semantyka, mniej stanu do ogarnięcia w UI.
--
-- RLS
-- ---
-- Mirror task_comments (001): SELECT przez project_access() taska
-- macierzystego, INSERT wymaga created_by = auth.uid() ORAZ
-- project_role() w ('owner','admin','developer') — bez 'tester',
-- bo rejestrowanie próby implementacji to praca deweloperska, nie
-- testerska (inaczej niż komentarze, które tester też dodaje).
-- DELETE: owner/admin, jak tasks_delete/decisions_delete — historia
-- projektu, nie własność autora jak w komentarzach.
--
-- BEZPIECZEŃSTWO
-- --------------
-- Nowa tabela, RLS włączone od razu (nie ALTER na istniejącej,
-- więc nie ma okna bez ochrony). Sprawdzone npm run test:db po
-- dopisaniu asercji dla tego pliku.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.task_attempts (
    id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id        uuid        NOT NULL,
    problem        text        NOT NULL CHECK (length(trim(problem)) > 0),
    approach       text        NOT NULL CHECK (length(trim(approach)) > 0),
    outcome        text        NOT NULL CHECK (outcome IN ('failed', 'partial', 'succeeded')),
    result         text,
    failure_reason text,
    files_changed  text[]      NOT NULL DEFAULT '{}',
    related_pr_url text,
    agent          text,
    created_by     uuid        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);


ALTER TABLE public.task_attempts
DROP CONSTRAINT IF EXISTS task_attempts_task_id_fkey;

ALTER TABLE public.task_attempts
    ADD CONSTRAINT task_attempts_task_id_fkey
        FOREIGN KEY (task_id)
            REFERENCES public.tasks(id)
            ON DELETE CASCADE;


ALTER TABLE public.task_attempts
DROP CONSTRAINT IF EXISTS task_attempts_created_by_fkey;

ALTER TABLE public.task_attempts
    ADD CONSTRAINT task_attempts_created_by_fkey
        FOREIGN KEY (created_by)
            REFERENCES public.profiles(id)
            ON DELETE CASCADE;


ALTER TABLE public.task_attempts ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS task_attempts_select ON public.task_attempts;
CREATE POLICY task_attempts_select
ON public.task_attempts
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_attempts.task_id
          AND private.project_access(t.project_id)
    )
);


DROP POLICY IF EXISTS task_attempts_insert ON public.task_attempts;
CREATE POLICY task_attempts_insert
ON public.task_attempts
FOR INSERT
TO authenticated
WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_attempts.task_id
          AND private.project_role(t.project_id) IN ('owner', 'admin', 'developer')
    )
);


DROP POLICY IF EXISTS task_attempts_delete ON public.task_attempts;
CREATE POLICY task_attempts_delete
ON public.task_attempts
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_attempts.task_id
          AND private.project_role(t.project_id) IN ('owner', 'admin')
    )
);


CREATE INDEX IF NOT EXISTS idx_task_attempts_task
    ON public.task_attempts(task_id);

CREATE INDEX IF NOT EXISTS idx_task_attempts_created_by
    ON public.task_attempts(created_by);


GRANT SELECT, INSERT, DELETE
    ON public.task_attempts
    TO authenticated;


-- Redundant w praktyce (000_auth_compat.sql's ALTER DEFAULT PRIVILEGES
-- już obejmuje tabele tworzone później przez tę samą rolę na self-hosted,
-- Supabase daje service_role dostęp do nowych tabel z platformowych
-- default privileges) — ale jawny GRANT jest tani, idempotentny i nie
-- zależy od żadnego z tych dwóch mechanizmów działających tak jak
-- opisano, więc zostaje jako pas i szelki.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.task_attempts
    TO service_role;


COMMIT;
