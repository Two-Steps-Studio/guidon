-- ============================================================
-- GUIDON - MIGRACJA 101
-- Osobiste klucze API z datą ważności
-- ============================================================
--
-- Uruchomić PO 100 (niezależna od niej - kolejność dowolna).
--
-- KONTEKST
-- --------
-- api_keys.expires_at istnieje od 073 (tokeny OAuth wygasają po godzinie)
-- i authenticateApiKey już odrzuca wygasły klucz. Osobisty klucz z Profilu
-- nie mógł jednak dostać daty ważności: od 039 INSERT do api_keys jest
-- kolumnowy i expires_at w nim nie ma. Ktoś, kto daje klucz agentowi,
-- powinien móc ograniczyć go w czasie (domyślnie 90 dni w formularzu).
--
-- Tylko expires_at: human_client i oauth_grant_id nadal ustawia wyłącznie
-- serwer (039, 073).
-- ============================================================

BEGIN;

GRANT INSERT (expires_at) ON public.api_keys TO authenticated;

COMMIT;
