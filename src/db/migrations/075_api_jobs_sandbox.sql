-- ============================================================
-- GUIDON - MIGRACJA 075
-- Zadania asynchroniczne API (202 + polling) i sandbox do testow
-- ============================================================
--
-- Uruchomic PO 074.
--
-- 1. api_jobs - praca, ktora nie konczy sie w jednym zapytaniu (np. import
--    setek zadan przez POST /api/v1/projects/{id}/tasks/import). API
--    odpowiada 202 Accepted z Location: /api/v1/jobs/{id}; klient odpytuje
--    status (queued -> running -> succeeded/failed), postep (done/total) i
--    wynik. Widzi je tylko ich wlasciciel; pisze tylko serwer (service_role).
--
-- 2. organizations.is_sandbox - organizacja testowa, ktora kazdy moze sobie
--    utworzyc przez POST /api/v1/sandbox: projekt z przykladowymi zadaniami
--    do cwiczenia API i agentow bez ruszania prawdziwej pracy; mozna ja w
--    kazdej chwili zresetowac. Poza flaga to zwykla organizacja (te same
--    uprawnienia i limity).
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.api_jobs (
    id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    kind        text        NOT NULL CHECK (kind IN ('task_import')),
    status      text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    total       integer     NOT NULL DEFAULT 0 CHECK (total >= 0),
    done        integer     NOT NULL DEFAULT 0 CHECK (done >= 0),
    result      jsonb,
    error       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_jobs_user ON public.api_jobs (user_id, created_at DESC);

ALTER TABLE public.api_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_jobs TO service_role;


ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_organizations_sandbox ON public.organizations (created_by) WHERE is_sandbox;


COMMIT;
