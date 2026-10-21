-- ============================================================
-- GUIDON - MIGRACJA 071
-- Platnosci: ceny tygodniowe/miesieczne/roczne, trial bez karty raz na
-- organizacje, okres karencji przy nieudanej platnosci
-- ============================================================
--
-- Uruchomic PO 070.
--
-- KONTEKST
-- --------
-- Do tej pory plan mial jedna cene w Stripe (plans.stripe_price_id,
-- miesieczna), checkout zawsze dawal 14 dni trialu (z karta), a
-- subskrypcja 'past_due' trzymala plan w nieskonczonosc.
--
-- 1. plan_prices: Price ze Stripe dla planu i okresu (week/month/year).
--    Najwyzej jedna AKTYWNA cena na plan i okres - zmiana ceny to nowy
--    wiersz, stary active = false (Stripe tez nie zmienia kwoty Price,
--    a istniejace subskrypcje na starej cenie dalej musza sie mapowac na
--    plan - dlatego webhook szuka po stripe_price_id bez patrzenia na
--    active). plans.stripe_price_id zostaje i jest przepisane tutaj jako
--    cena miesieczna - webhook nadal je rozpoznaje.
--    Czyta kazdy zalogowany (jak plans), pisze tylko service_role.
--
-- 2. subscriptions.billing_interval - okres oplacanej ceny (z webhooka).
--
-- 3. subscriptions.trial_used_at - kiedy organizacja zaczela trial. Trial
--    jest raz na organizacje; checkout bez trialu, gdy jest ustawione.
--    Organizacje, ktore juz kiedys mialy subskrypcje w Stripe, dostaly
--    wtedy trial bezwarunkowo - oznaczone jako wykorzystane.
--
-- 4. subscriptions.past_due_since - od kiedy platnosc jest zalegla.
--    Aplikacja (src/lib/billing/billing-core.ts) trzyma plan jeszcze przez
--    okres karencji, potem liczy limity jak dla Free, dopoki platnosc nie
--    przejdzie. Webhook ustawia przy wejsciu w past_due i czysci po wyjsciu.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.plan_prices (
    stripe_price_id     text        NOT NULL PRIMARY KEY,
    plan_id             text        NOT NULL REFERENCES public.plans (id) ON DELETE CASCADE,
    billing_interval    text        NOT NULL CHECK (billing_interval IN ('week', 'month', 'year')),
    amount_cents        integer     NOT NULL CHECK (amount_cents >= 0),
    active              boolean     NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_prices_plan ON public.plan_prices (plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS plan_prices_one_active_per_interval
    ON public.plan_prices (plan_id, billing_interval)
    WHERE active;

ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_prices_select ON public.plan_prices;
CREATE POLICY plan_prices_select
ON public.plan_prices
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.plan_prices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_prices TO service_role;

INSERT INTO public.plan_prices (stripe_price_id, plan_id, billing_interval, amount_cents)
SELECT p.stripe_price_id, p.id, 'month', COALESCE(p.price_cents, 0)
FROM public.plans p
WHERE p.stripe_price_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.plan_prices pp
      WHERE pp.plan_id = p.id AND pp.billing_interval = 'month' AND pp.active
  )
ON CONFLICT (stripe_price_id) DO NOTHING;


ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_interval text;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_interval_check;
ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_billing_interval_check
    CHECK (billing_interval IS NULL OR billing_interval IN ('week', 'month', 'year'));

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_used_at timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

UPDATE public.subscriptions
SET trial_used_at = COALESCE(current_period_start, now())
WHERE stripe_subscription_id IS NOT NULL
  AND trial_used_at IS NULL;

UPDATE public.subscriptions
SET past_due_since = now()
WHERE status = 'past_due'
  AND past_due_since IS NULL;


COMMIT;
