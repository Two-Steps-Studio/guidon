-- ============================================================
-- GUIDON - MIGRACJA 049
-- Limit czlonkow projektu w planach (plans.member_limit_per_project)
-- ============================================================
--
-- Uruchomic PO 048.
--
-- KONTEKST
-- --------
-- Plany (015/034) limitowaly projekty, zadania na projekt i storage, ale
-- nie liczbe osob w projekcie - Free mial tyle miejsc co Business.
-- Nowa kolumna, ta sama konwencja co task_limit_per_project: NULL = bez
-- limitu. Egzekwowane tylko w Guidon Cloud (addMember w
-- src/app/projects/[id]/members/actions.ts, przez getOrgPlanLimits) -
-- self-hosted nie ma planow.
--
-- Istniejacy czlonkowie nie sa usuwani, jesli projekt jest juz ponad
-- limitem - blokowane jest tylko dodawanie kolejnych.
-- ============================================================

BEGIN;


ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS member_limit_per_project integer
        CHECK (member_limit_per_project IS NULL OR member_limit_per_project > 0);


UPDATE public.plans SET member_limit_per_project = 5  WHERE id = 'free';
UPDATE public.plans SET member_limit_per_project = 15 WHERE id = 'pro';
UPDATE public.plans SET member_limit_per_project = 50 WHERE id = 'team';


COMMIT;
