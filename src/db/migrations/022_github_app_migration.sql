-- ============================================================
-- GUIDON - MIGRACJA 022
-- Integracja GitHub: OAuth App -> GitHub App
-- ============================================================
--
-- Uruchomić PO 021.
--
-- 021 zakładał klasyczną OAuth App: jeden token użytkownika, jego scope
-- ("repo", potem "repo read:org") i tyle. Problem: organizacje z domyślną
-- polityką "Third-party access restricted" (prawie każda) blokują taki
-- token dopóki członek ręcznie nie kliknie "Grant" dla tej appki w
-- ustawieniach GitHuba - a to nigdy nie działało bez tego kroku.
--
-- GitHub App naprawia to strukturalnie: appkę instaluje właściciel
-- organizacji raz (wybierając repo), i od tej pory każdy autoryzowany
-- członek ma dostęp bez żadnego dodatkowego "Grant". Commity nadal idą
-- jako łączący użytkownik (nie bot) - używamy tokenu "user-to-server",
-- identycznego mechanizmu autoryzacji co wcześniej (te same endpointy
-- /login/oauth/authorize i /login/oauth/access_token), tyle że token ten
-- wygasa (~8h) i wymaga odświeżania refresh tokenem (~6 miesięcy) - stąd
-- nowe kolumny poniżej.
--
-- Stare wiersze z 021 (token OAuth App, bez installation_id/refresh
-- tokenu) są strukturalnie niekompatybilne - funkcja nigdy nie działała
-- poprawnie dla organizacji, więc czyścimy tabelę zamiast migrować dane;
-- każde istniejące połączenie wymaga ponownego podłączenia repo przez
-- nowy flow.
-- ============================================================

BEGIN;


ALTER TABLE public.github_connections
    ADD COLUMN IF NOT EXISTS installation_id            bigint,
    ADD COLUMN IF NOT EXISTS refresh_token_encrypted     text,
    ADD COLUMN IF NOT EXISTS access_token_expires_at     timestamptz,
    ADD COLUMN IF NOT EXISTS refresh_token_expires_at    timestamptz;

DELETE FROM public.github_connections;

ALTER TABLE public.github_connections
    ALTER COLUMN installation_id SET NOT NULL,
    ALTER COLUMN refresh_token_encrypted SET NOT NULL,
    ALTER COLUMN access_token_expires_at SET NOT NULL,
    ALTER COLUMN refresh_token_expires_at SET NOT NULL,
    DROP COLUMN IF EXISTS token_scope;


COMMIT;
