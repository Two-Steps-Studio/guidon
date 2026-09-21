-- ============================================================
-- GUIDON - MIGRACJA 038
-- Naprawa dryfu tasks_status_check ('ai_working' odrzucany)
-- ============================================================
--
-- Uruchomic PO 037.
--
-- Na czesci baz (produkcja) constraint tasks_status_check nie dopuszcza
-- 'ai_working' mimo migracji 016 - start_task/status ai_working konczyl sie
-- bledem "violates check constraint tasks_status_check" (widoczne przez
-- MCP/API oraz przy przeciaganiu do kolumny AI we wtyczce Unity).
-- Ponizej idempotentne odtworzenie constraintu z pelnym slownikiem statusow;
-- przed tym mapowanie starych statusow z migracji 002, zeby ADD CONSTRAINT
-- nie padl na starych wierszach.
-- ============================================================

BEGIN;


UPDATE public.tasks SET status = 'review' WHERE status = 'testing';
UPDATE public.tasks SET status = 'done'   WHERE status = 'completed';

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_status_check
        CHECK (status IN ('backlog', 'todo', 'in_progress', 'ai_working', 'review', 'done'));


COMMIT;
