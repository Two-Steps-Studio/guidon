-- ============================================================
-- GUIDON - MIGRACJA 094
-- Automatyzacje modułów: kolejka uruchomień, logi, retry
-- ============================================================
--
-- Uruchomić PO 093.
--
-- Manifest modułu (silnik 1.2) może mieć automatyzacje: gdy wpis encji
-- zostanie utworzony / zmieniony / usunięty (opcjonalnie: gdy pole ma daną
-- wartość), wykonaj do 5 akcji z zamkniętej listy - utwórz zadanie,
-- powiadom ownerów/adminów projektu, wyślij webhook organizacji. Każda akcja
-- wymaga uprawnienia zatwierdzonego przy instalacji (tasks:write,
-- notifications:send, webhooks:send). Akcje nie zapisują danych modułu,
-- więc automatyzacja nie wywoła ani siebie, ani innej (bez pętli).
--
-- - module_automation_runs: jedno uruchomienie = automatyzacja x wpis x
--   zdarzenie x rewizja pakietu; dedupe_key unikalny, więc to samo
--   zdarzenie przetworzone dwa razy jest jednym uruchomieniem. Retry z
--   odstępami (1 min, 5 min, 30 min, 2 h), piąta porażka jest ostateczna.
--   results zapamiętuje wykonane akcje, więc retry nie powtarza tych, które
--   się udały. Czytają owner/admin projektu (log w konfiguracji modułu);
--   zapisuje tylko serwer (service role).
-- - Zdarzenie webhooka module.automation (050, 089 dostają nowy typ).
-- - notifications.type: module_automation.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.module_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_id text NOT NULL,
  automation_id text NOT NULL CHECK (automation_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  record_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('record.created', 'record.updated', 'record.deleted')),
  record_values jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(record_values) = 'object' AND octet_length(record_values::text) <= 16384),
  dedupe_key text NOT NULL UNIQUE CHECK (length(dedupe_key) <= 300),
  triggered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  next_attempt_at timestamptz,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 300),
  results jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(results) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'pending' OR next_attempt_at IS NOT NULL),
  FOREIGN KEY (project_id, module_id) REFERENCES public.project_module_packages(project_id, module_id)
);
CREATE INDEX IF NOT EXISTS module_automation_runs_due ON public.module_automation_runs(next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS module_automation_runs_module ON public.module_automation_runs(project_id, module_id, created_at DESC);
ALTER TABLE public.module_automation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.module_automation_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.module_automation_runs TO authenticated;
GRANT ALL ON public.module_automation_runs TO service_role;
DROP POLICY IF EXISTS module_automation_runs_select ON public.module_automation_runs;
CREATE POLICY module_automation_runs_select ON public.module_automation_runs FOR SELECT TO authenticated
  USING (private.project_role(project_id) IN ('owner', 'admin'));

-- Webhook event type module.automation (constraints from 050 and 089).
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE conrelid IN ('public.organization_webhooks'::regclass, 'public.organization_webhook_deliveries'::regclass)
      AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%task.status_changed%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END
$$;
ALTER TABLE public.organization_webhooks ADD CONSTRAINT organization_webhooks_events_check CHECK (
  cardinality(events) > 0 AND events <@ ARRAY['task.created', 'task.status_changed', 'task.completed', 'module.automation']::text[]);
ALTER TABLE public.organization_webhook_deliveries ADD CONSTRAINT organization_webhook_deliveries_event_type_check CHECK (
  event_type IN ('task.created', 'task.status_changed', 'task.completed', 'module.automation'));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('task_assigned', 'module_review', 'module_automation'));


COMMIT;
