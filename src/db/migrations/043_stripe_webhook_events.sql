-- ============================================================
-- GUIDON - MIGRACJA 043
-- Stripe webhook: rejestr przetworzonych zdarzen (idempotencja)
-- ============================================================
--
-- Uruchomic PO 042.
--
-- src/app/api/stripe/webhook/route.ts synchronizuje subscriptions z realnymi
-- platnosciami Stripe. Stripe dostarcza zdarzenia "co najmniej raz" (wlasny
-- retry przy braku 2xx, reczny "Resend" w Dashboardzie) - bez tej tabeli to
-- samo zdarzenie (np. dwa razy dostarczone checkout.session.completed)
-- mogloby np. ponownie przeliczyc okres subskrypcji. Ten sam wzorzec co
-- github_task_events (042): INSERT ... ON CONFLICT DO NOTHING RETURNING
-- mowi webhookowi, czy to pierwsze przetworzenie danego Stripe event id.
--
-- Brak polityk INSERT/UPDATE/DELETE dla `authenticated` - dokladnie ta sama
-- lekcja co subscriptions (015): ten webhook nie dziala jako zaden
-- zalogowany uzytkownik (Stripe nie niesie sesji ani czlonkostwa w
-- projekcie/organizacji), wiec jedyna legalna sciezka zapisu to service_role,
-- tak samo jak dla samej tabeli subscriptions ktora ten webhook aktualizuje.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    event_id    text        NOT NULL PRIMARY KEY,
    event_type  text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);


ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies for `authenticated` at all - service_role only, same
-- reasoning as subscriptions (015). Nothing for a regular user to ever
-- read or write here.

GRANT SELECT, INSERT ON public.stripe_webhook_events TO service_role;


COMMIT;
