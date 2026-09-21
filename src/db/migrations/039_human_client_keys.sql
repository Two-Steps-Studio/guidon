-- ============================================================
-- GUIDON - MIGRACJA 039
-- api_keys.human_client: klucze klientow obslugiwanych przez czlowieka
-- ============================================================
--
-- Uruchomic PO 038.
--
-- BUG "403 - Przerzucanie taska w Unity"
--
-- Wtyczka Unity przeciaga zadania przez PATCH /api/v1/tasks/{id}/status -
-- ten sam endpoint, ktory obsluguje agentow AI. Dla kazdego klucza API
-- nakladal on bramki "AI" (project_ai_permissions.can_change_status /
-- can_complete_tasks, projects.allow_ai_auto_complete), wiec CZLOWIEK
-- przeciagajacy zadanie do Done w Unity dostawal 403, dopoki admin projektu
-- nie zezwolil "AI" na konczenie zadan. Bramki maja chronic przed agentem
-- dzialajacym bez zgody, nie przed uzytkownikiem, ktory to samo moze zrobic
-- w przegladarce (RLS - owner/admin/developer - pozostaje prawdziwa granica).
--
-- human_client = true oznacza klucz wydany klientowi obslugiwanemu przez
-- czlowieka (wtyczka Unity, wystawiana przez /auth/plugin-login); tylko
-- takie klucze pomijaja bramki AI (src/lib/api/task-transitions.ts).
--
-- KOLUMNE USTAWIA WYLACZNIE SERWER (service_role). INSERT dla `authenticated`
-- jest od teraz kolumnowy i human_client nie obejmuje - inaczej developer
-- mogl by sam wystawic klucz dla wlasnego agenta AI z human_client = true
-- i obejsc zgode admina projektu. UPDATE dla `authenticated` byl juz
-- ograniczony do revoked_at (016), wiec po wstawieniu nie da sie jej zmienic.
--
-- Backfill: istniejace klucze wtyczki (name = 'Unity Plugin', tak nazywa je
-- src/app/auth/plugin-login/actions.ts), zeby dzialaly bez ponownego logowania.
-- ============================================================

BEGIN;


ALTER TABLE public.api_keys
    ADD COLUMN IF NOT EXISTS human_client boolean NOT NULL DEFAULT false;

UPDATE public.api_keys SET human_client = true WHERE name = 'Unity Plugin';

REVOKE INSERT ON public.api_keys FROM authenticated;

GRANT INSERT (user_id, name, key_prefix, key_hash, scopes, bot_label)
    ON public.api_keys
    TO authenticated;


COMMIT;
