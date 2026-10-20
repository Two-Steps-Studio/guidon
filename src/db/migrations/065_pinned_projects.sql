-- ============================================================
-- GUIDON - MIGRACJA 065
-- Przypiete projekty (do 3 na osobe)
-- ============================================================
--
-- Uruchomic PO 064.
--
-- KONTEKST
-- --------
-- Kazdy moze przypiac do 3 projektow na gore listy projektow i pulpitu.
-- To ustawienie osoby, nie projektu, wiec siedzi w jej profilu:
-- profiles.pinned_project_ids (kolejnosc = kolejnosc przypiecia).
-- Edytuje je wlasciciel profilu (profiles_update_own z 001). Id projektu,
-- do ktorego ktos stracil dostep albo ktory usunieto, po prostu sie nie
-- wyswietla - aplikacja filtruje je przy odczycie, bez kaskad.
-- ============================================================

BEGIN;


ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS pinned_project_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pinned_project_ids_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_pinned_project_ids_check
    CHECK (cardinality(pinned_project_ids) <= 3);

GRANT UPDATE (pinned_project_ids) ON public.profiles TO authenticated;


COMMIT;
