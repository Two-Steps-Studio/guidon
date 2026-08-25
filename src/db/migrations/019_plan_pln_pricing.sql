-- ============================================================
-- GUIDON — MIGRACJA 019
-- Cena planów w PLN obok istniejącego price_cents (EUR)
-- ============================================================
--
-- Uruchomić PO 018.
--
-- Osobna kolumna z ustaloną ceną PLN, nie przelicznik kursu EUR->PLN
-- w locie — kurs zmienia się codziennie, a przeliczona "na żywo" cena
-- nie jest tym, co faktycznie obciąży kartę klienta. Stałe ceny per
-- waluta (zaokrąglone do progów psychologicznych, jak robi to
-- większość SaaS) to poprawny model, ten sam co price_cents.
--
-- GRANT: authenticated ma tylko SELECT na plans (015), UPDATE/INSERT/
-- DELETE wyłącznie przez service_role, które już ma pełny dostęp do
-- wszystkich kolumn — nowa kolumna nie wymaga żadnej zmiany GRANT,
-- w przeciwieństwie do organizations/projects (014/017).
-- ============================================================

BEGIN;


ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_pln_cents integer CHECK (price_pln_cents >= 0);

UPDATE public.plans SET price_pln_cents = 0 WHERE id = 'free';
UPDATE public.plans SET price_pln_cents = 3900 WHERE id = 'pro';
UPDATE public.plans SET price_pln_cents = 8900 WHERE id = 'team';
UPDATE public.plans SET price_pln_cents = 21900 WHERE id = 'business';


COMMIT;
