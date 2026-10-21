-- ============================================================
-- GUIDON - MIGRACJA 074
-- Przypiete zadania w pasku bocznym
-- ============================================================
--
-- Uruchomic PO 073.
--
-- Tak samo jak przypiete projekty (065): kazdy przypina dla siebie, do 10
-- zadan, widocznych w pasku bocznym na kazdej stronie aplikacji. Lista id
-- w profilu (kolejnosc = kolejnosc przypinania); zadania, ktorych osoba juz
-- nie widzi (RLS) albo usuniete, aplikacja po prostu pomija.
-- ============================================================

BEGIN;


ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS pinned_task_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pinned_task_ids_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_pinned_task_ids_check
    CHECK (cardinality(pinned_task_ids) <= 10);

GRANT UPDATE (pinned_task_ids) ON public.profiles TO authenticated;


COMMIT;
