-- ============================================================
-- GUIDON - MIGRACJA 031
-- Preferowany jezyk uzytkownika (profiles.locale)
-- ============================================================
--
-- Uruchomic PO 030.
--
-- Zrodlo prawdy dla jezyka interfejsu zalogowanego uzytkownika, czytane
-- przez src/i18n/request.ts. Bez restrykcji GRANT UPDATE per-kolumna -
-- profiles (w odroznieniu od projects, 023/029) nigdy takiej listy nie
-- mialo, caly UPDATE jest bramkowany polityka profiles_update_own (001),
-- wiec nowa kolumna nie wymaga zadnej dodatkowej zmiany GRANT.
-- ============================================================

BEGIN;


ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en'
    CHECK (locale IN ('en', 'pl', 'de', 'es'));


COMMIT;
