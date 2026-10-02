-- ============================================================
-- GUIDON - MIGRACJA 046
-- Wlacznik funkcji AI per projekt
-- ============================================================
--
-- Uruchomic PO 045.
--
-- KONTEKST
-- --------
-- Projekt moze wylaczyc wszystkie funkcje AI naraz - przy tworzeniu i
-- pozniej w ustawieniach. Wylaczone AI ukrywa kolumne "AI Working" (o ile
-- nic w niej nie zostalo), sekcje uprawnien AI w ustawieniach, asystenta
-- AI na tablicy i generowanie insightow w Pamieci; Server Actions czatu
-- AI i insightow odmawiaja, a w /api/v1 klucze agentow AI (nie
-- human_client, 039) nie moga zmieniac statusow ani komentowac. Klienci
-- ludzcy (Discord, plugin Unity) dzialaja dalej.
--
-- DEFAULT true: istniejace projekty zachowuja sie dokladnie jak przed ta
-- migracja.
--
-- WAZNE: jak w 029 - GRANT UPDATE na projects jest zawezony do listy
-- kolumn (luka self-elevation, patrz 023), wiec nowa kolumna musi do niej
-- trafic w tej samej migracji, inaczej zapis z ustawien projektu dostanie
-- "permission denied" mimo przejscia RLS.
-- ============================================================

BEGIN;


ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;


REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (name, description, status, color, allow_ai_auto_complete, avatar_url, project_type, methodology, ai_enabled)
    ON public.projects
    TO authenticated;


COMMIT;
