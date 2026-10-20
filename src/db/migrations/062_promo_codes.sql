-- ============================================================
-- GUIDON - MIGRACJA 062
-- Kody promocyjne: plan za darmo na N dni
-- ============================================================
--
-- Uruchomic PO 061.
--
-- KONTEKST
-- --------
-- Dwa rodzaje promocji w Guidon Cloud:
-- - ZNIZKI na platny plan - natywne kody promocyjne Stripe (Stripe
--   Dashboard -> Coupons/Promotion codes). Checkout ma
--   allow_promotion_codes, wiec kod wpisuje sie przy platnosci; Stripe
--   liczy rabat, podatki i odnowienia. Tu nic nie trzeba.
-- - PLAN ZA DARMO na okres (np. Pro na 30 dni) - kody Guidona, ponizej.
--   Tworzy je admin instancji (/admin/promo-codes), realizuje owner/admin
--   organizacji na stronie Billing.
--
-- promo_codes: kod (zapisany wielkimi literami), plan, liczba dni, opcjonalny
-- limit uzyc i data waznosci, aktywny/wylaczony.
-- promo_redemptions: kto, ktora organizacja, do kiedy - jedna organizacja
-- realizuje dany kod raz.
--
-- Przyznany plan siedzi w subscriptions.promo_plan_id / promo_until, OSOBNO
-- od plan_id: webhook Stripe nadpisuje plan_id przy kazdej zmianie
-- subskrypcji, a promocja ma przetrwac do swojej daty. Aplikacja
-- (src/lib/limits.ts) bierze lepszy z dwoch planow, dopoki promo_until jest
-- w przyszlosci - po tej dacie promocja po prostu przestaje dzialac, bez
-- zadnego zadania w tle.
--
-- promo_plan_id celowo BEZ klucza obcego do plans: drugi FK z subscriptions
-- do plans zrobilby niejednoznacznym kazde osadzenie PostgREST
-- "plans (*)" (limits.ts, billing, admin) - zapytanie konczyloby sie bledem,
-- a kazda organizacja spadalaby do limitow Free. Plan sprawdza
-- redeem_promo_code, a promo_codes.plan_id ma normalny FK.
--
-- Wszystko pisze tylko service role (jak subscriptions w 015): inaczej
-- owner moglby sam sobie dac plan. redeem_promo_code robi cala realizacje w
-- jednej transakcji z blokada wiersza kodu, wiec limit uzyc nie przecieknie
-- przy rownoczesnych probach.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.promo_codes (
    id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code             text NOT NULL UNIQUE
                     CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
    plan_id          text NOT NULL REFERENCES public.plans(id),
    duration_days    integer NOT NULL CHECK (duration_days BETWEEN 1 AND 3650),
    max_redemptions  integer CHECK (max_redemptions IS NULL OR max_redemptions >= 1),
    redemption_count integer NOT NULL DEFAULT 0,
    expires_at       timestamptz,
    active           boolean NOT NULL DEFAULT true,
    note             text CHECK (note IS NULL OR length(note) <= 500),
    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
    id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    promo_code_id   uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    redeemed_by     uuid,
    plan_id         text NOT NULL,
    granted_until   timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (promo_code_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_org ON public.promo_redemptions (organization_id);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
-- Bez polityk dla authenticated: czyta i pisze tylko serwer.
REVOKE ALL ON public.promo_codes FROM anon, authenticated;
REVOKE ALL ON public.promo_redemptions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_redemptions TO service_role;


ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS promo_plan_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS promo_until timestamptz;


-- Wynik: error NULL = przyznano; inaczej jeden z kodow:
-- not_found, inactive, expired, used_up, already_redeemed, has_better_plan.
CREATE OR REPLACE FUNCTION public.redeem_promo_code(
    p_code            text,
    p_organization_id uuid,
    p_user_id         uuid
)
    RETURNS TABLE (error text, plan_id text, granted_until timestamptz)
    LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
    v_code       public.promo_codes%ROWTYPE;
    v_sub        public.subscriptions%ROWTYPE;
    v_rank       integer;
    v_paid_rank  integer;
    v_promo_rank integer;
    v_from       timestamptz;
    v_until      timestamptz;
BEGIN
    SELECT * INTO v_code
    FROM public.promo_codes c
    WHERE c.code = upper(btrim(p_code))
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::timestamptz;
        RETURN;
    END IF;
    IF NOT v_code.active THEN
        RETURN QUERY SELECT 'inactive'::text, NULL::text, NULL::timestamptz;
        RETURN;
    END IF;
    IF v_code.expires_at IS NOT NULL AND v_code.expires_at <= now() THEN
        RETURN QUERY SELECT 'expired'::text, NULL::text, NULL::timestamptz;
        RETURN;
    END IF;
    IF v_code.max_redemptions IS NOT NULL AND v_code.redemption_count >= v_code.max_redemptions THEN
        RETURN QUERY SELECT 'used_up'::text, NULL::text, NULL::timestamptz;
        RETURN;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.promo_redemptions r
        WHERE r.promo_code_id = v_code.id AND r.organization_id = p_organization_id
    ) THEN
        RETURN QUERY SELECT 'already_redeemed'::text, NULL::text, NULL::timestamptz;
        RETURN;
    END IF;

    INSERT INTO public.subscriptions (organization_id, plan_id, status)
    VALUES (p_organization_id, 'free', 'active')
    ON CONFLICT (organization_id) DO NOTHING;

    SELECT * INTO v_sub
    FROM public.subscriptions s
    WHERE s.organization_id = p_organization_id
    FOR UPDATE;

    SELECT p.sort_order INTO v_rank FROM public.plans p WHERE p.id = v_code.plan_id;
    SELECT p.sort_order INTO v_paid_rank FROM public.plans p WHERE p.id = v_sub.plan_id;
    SELECT p.sort_order INTO v_promo_rank FROM public.plans p
    WHERE p.id = v_sub.promo_plan_id AND v_sub.promo_until > now();

    -- Nic nie daje (i nie zuzywa kodu), gdy organizacja ma juz ten plan
    -- albo lepszy - oplacony albo z innej, wciaz trwajacej promocji.
    IF (v_sub.status IN ('active', 'trialing') AND COALESCE(v_paid_rank, 0) >= v_rank AND v_sub.plan_id <> 'free')
       OR (v_promo_rank IS NOT NULL AND v_promo_rank > v_rank) THEN
        RETURN QUERY SELECT 'has_better_plan'::text, NULL::text, NULL::timestamptz;
        RETURN;
    END IF;

    -- Ten sam plan z trwajacej promocji: dni sie dodaja.
    v_from := CASE
        WHEN v_sub.promo_plan_id = v_code.plan_id AND v_sub.promo_until > now() THEN v_sub.promo_until
        ELSE now()
    END;
    v_until := v_from + make_interval(days => v_code.duration_days);

    UPDATE public.subscriptions s
    SET promo_plan_id = v_code.plan_id, promo_until = v_until
    WHERE s.organization_id = p_organization_id;

    INSERT INTO public.promo_redemptions (promo_code_id, organization_id, redeemed_by, plan_id, granted_until)
    VALUES (v_code.id, p_organization_id, p_user_id, v_code.plan_id, v_until);

    UPDATE public.promo_codes c
    SET redemption_count = c.redemption_count + 1
    WHERE c.id = v_code.id;

    RETURN QUERY SELECT NULL::text, v_code.plan_id, v_until;
END;
$$;

REVOKE ALL
    ON FUNCTION public.redeem_promo_code(text, uuid, uuid)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.redeem_promo_code(text, uuid, uuid)
TO service_role;


COMMIT;
