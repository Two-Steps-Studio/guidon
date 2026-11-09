-- ============================================================
-- GUIDON - MIGRACJA 121
-- Kolejka przeglądu pamięci: wszystko, co napisała aplikacja AI
-- ============================================================
--
-- Uruchomić PO 120, PRZED wdrożeniem kodu, który zapisuje needs_review
-- (API/MCP i akceptacja w kolejce zapisują tę kolumnę).
--
-- KONTEKST
-- --------
-- Do przeglądu trafiały tylko wnioski AI (memory_type = 'ai_insight',
-- verified = false). Wpis dodany albo zmieniony przez API, MCP lub
-- wbudowanego asystenta - z dowolnym typem: fakt, reguła, ograniczenie -
-- wyglądał jak wpis człowieka: klucz API należy do osoby, więc created_by
-- tego nie odróżnia.
--
-- needs_review = true: wpis napisała aplikacja i człowiek go jeszcze nie
-- przejrzał. Ustawia go serwer przy zapisie przez aplikację
-- (src/lib/api/project-resources.ts); czyści akceptacja w kolejce
-- (src/app/projects/[id]/memory/actions.ts). Istniejące niezweryfikowane
-- wnioski AI trafiają do kolejki od razu.
--
-- Tylko nowa kolumna i dane; polityki RLS bez zmian (granty na tabelę obejmują
-- nową kolumnę). Idempotentna.
-- ============================================================

BEGIN;

ALTER TABLE public.project_memory
    ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

UPDATE public.project_memory
SET needs_review = true
WHERE memory_type = 'ai_insight' AND verified IS NOT TRUE AND needs_review = false;

-- The review queue is read per project; most rows are false.
CREATE INDEX IF NOT EXISTS project_memory_needs_review_idx
    ON public.project_memory (project_id)
    WHERE needs_review;

COMMIT;
