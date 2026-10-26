-- ============================================================
-- GUIDON - MIGRACJA 089
-- Kolejka dostarczeń webhooków: ponawianie i historia
-- ============================================================
--
-- Uruchomić PO 088.
--
-- Do tej pory webhook był wysyłany raz; nieudana próba zostawała tylko jako
-- last_status/last_error na organization_webhooks. Teraz każde zdarzenie dla
-- każdego webhooka to wiersz organization_webhook_deliveries:
-- - id jest też nagłówkiem X-Guidon-Delivery i polem "id" w treści - ten sam
--   przy każdej próbie, więc odbiorca może odrzucać duplikaty;
-- - status: pending (czeka na pierwszą próbę albo ponowienie), succeeded,
--   failed (koniec prób albo odpowiedź, której ponawianie nic nie da);
-- - next_attempt_at: kiedy najwcześniej ponowić (src/lib/webhooks/retry.ts).
--
-- Zapisuje i przetwarza tylko service role (aplikacja po sprawdzeniu
-- uprawnień); owner/admin organizacji widzi historię swoich webhooków -
-- ta sama reguła co organization_webhooks_select (050).
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.organization_webhook_deliveries (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id       uuid        NOT NULL REFERENCES public.organization_webhooks(id) ON DELETE CASCADE,
    organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_type       text        NOT NULL CHECK (event_type IN ('task.created', 'task.status_changed', 'task.completed')),
    payload          jsonb       NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384),
    status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
    attempts         integer     NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
    next_attempt_at  timestamptz,
    last_status      integer,
    last_error       text        CHECK (last_error IS NULL OR char_length(last_error) <= 300),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    delivered_at     timestamptz,
    CHECK (status <> 'pending' OR next_attempt_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_due
    ON public.organization_webhook_deliveries (next_attempt_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook
    ON public.organization_webhook_deliveries (webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_deliveries_org
    ON public.organization_webhook_deliveries (organization_id);

ALTER TABLE public.organization_webhook_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.organization_webhook_deliveries FROM anon, authenticated;
GRANT SELECT ON public.organization_webhook_deliveries TO authenticated;
GRANT ALL ON public.organization_webhook_deliveries TO service_role;

DROP POLICY IF EXISTS organization_webhook_deliveries_select ON public.organization_webhook_deliveries;
CREATE POLICY organization_webhook_deliveries_select
ON public.organization_webhook_deliveries
FOR SELECT
TO authenticated
USING (private.org_role(organization_id) IN ('owner', 'admin'));


COMMIT;
