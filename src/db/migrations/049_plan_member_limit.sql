-- ============================================================
-- GUIDON - MIGRACJA 049
-- Limit osób w organizacji według planu: plans.member_limit
-- ============================================================
--
-- Uruchomić PO 048.
--
-- POWÓD
-- -----
-- Plan (015) ograniczał liczbę projektów, zadań i miejsce na pliki, ale
-- nie liczbę osób w organizacji. Ta migracja dodaje miejsca (seats):
--
--   plans.member_limit integer NULL
--     NULL = bez limitu (jak pozostałe limity w plans)
--     N    = organizacja na tym planie może mieć najwyżej N członków
--            (organization_members, łącznie z właścicielem)
--
-- Wartości startowe: Free 8, Pro 20, Team 50, Business 200,
-- Enterprise bez limitu.
--
-- Egzekwowane w aplikacji, tak jak pozostałe limity planu - tylko w
-- Guidon Cloud (bez DATABASE_URL). Self-hosted nie ma planów ani
-- limitów: addMember w src/app/organizations/[id]/members/actions.ts
-- sprawdza hasDirectDatabase() przed getOrgPlanLimits(), jak
-- isHostedProjectLimitReached.
--
-- Zejście na niższy plan nikogo nie usuwa - blokuje tylko dodawanie
-- kolejnych osób, dopóki organizacja nie zmieści się w limicie.
--
-- GRANT: plans ma już GRANT SELECT dla authenticated (015) na całą
-- tabelę, więc nowa kolumna jest czytelna bez dodatkowego grantu;
-- zapis tylko przez service_role, jak reszta plans.
-- ============================================================

BEGIN;


ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS member_limit integer NULL
        CHECK (member_limit IS NULL OR member_limit >= 1);

UPDATE public.plans SET member_limit = 8   WHERE id = 'free';
UPDATE public.plans SET member_limit = 20  WHERE id = 'pro';
UPDATE public.plans SET member_limit = 50  WHERE id = 'team';
UPDATE public.plans SET member_limit = 200 WHERE id = 'business';
UPDATE public.plans SET member_limit = NULL WHERE id = 'enterprise';


COMMIT;
