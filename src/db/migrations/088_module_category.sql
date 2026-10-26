-- ============================================================
-- GUIDON - MIGRACJA 088
-- Kategoria modułu w ustawieniach pakietu
-- ============================================================
--
-- Uruchomić PO 087.
--
-- Moduł może mieć własną kategorię (np. "Marketing"); pasek boczny projektu
-- pokazuje osobną grupę dla każdej kategorii zamiast jednej listy "Custom
-- modules". Dla modułów z katalogu kategoria siedzi w settings - 082
-- dopuszczało tam tylko defaultView, więc ograniczenie dostaje drugi klucz:
-- category, tekst 1-40 znaków (bez białych znaków na brzegach). Dla modułów
-- treści (projects.custom_modules, 079) kategoria jest polem w JSON-ie
-- i sprawdza ją aplikacja.
-- ============================================================

BEGIN;


ALTER TABLE public.project_module_packages DROP CONSTRAINT IF EXISTS module_settings_shape;
ALTER TABLE public.project_module_packages ADD CONSTRAINT module_settings_shape CHECK (
  jsonb_typeof(settings) = 'object'
  AND settings - 'defaultView' - 'category' = '{}'::jsonb
  AND (NOT settings ? 'defaultView' OR (jsonb_typeof(settings->'defaultView') = 'string' AND settings->>'defaultView' ~ '^[a-z][a-z0-9-]{0,63}$'))
  AND (NOT settings ? 'category' OR (
    jsonb_typeof(settings->'category') = 'string'
    AND char_length(settings->>'category') BETWEEN 1 AND 40
    AND settings->>'category' = btrim(settings->>'category')
  ))
  AND octet_length(settings::text) <= 1024
);


COMMIT;
