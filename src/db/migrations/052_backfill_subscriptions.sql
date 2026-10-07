-- ============================================================
-- GUIDON - MIGRACJA 052
-- Subskrypcja Free dla organizacji sprzed migracji 015
-- ============================================================
--
-- Uruchomić PO 051.
--
-- BUG
-- ---
-- 015 dodała tabelę subscriptions i trigger
-- on_organization_created_subscription, który zakłada wiersz Free dla
-- KAŻDEJ NOWEJ organizacji - ale nie uzupełniła istniejących. Organizacje
-- utworzone przed 015 nie mają więc żadnego wiersza subscriptions:
-- getOrgPlanLimits() zachowywał się dla nich jak Free (fail-closed), ale
-- zmiana planu w panelu admina kończyła się "This organization has no
-- subscription row to update.", a strona Billing pokazywała plan bez
-- wiersza, do którego Stripe mógłby się podpiąć.
--
-- NAPRAWA
-- -------
-- Jednorazowe uzupełnienie: wiersz Free dla każdej organizacji bez
-- subskrypcji. Idempotentne (NOT EXISTS + UNIQUE na organization_id) -
-- ponowne uruchomienie niczego nie zmienia. Kolumny poza organization_id
-- i plan_id biorą wartości domyślne z 015 (status 'active', okres od now()).
-- updateOrganizationPlan (src/app/admin/organizations/actions.ts) i tak
-- zakłada brakujący wiersz sam, ale bez tej migracji takie organizacje
-- czekałyby na ręczną zmianę planu.
-- ============================================================

BEGIN;


INSERT INTO public.subscriptions (organization_id, plan_id)
SELECT o.id, 'free'
FROM public.organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM public.subscriptions s WHERE s.organization_id = o.id
);


COMMIT;
