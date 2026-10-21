-- ============================================================
-- GUIDON - MIGRACJA 073
-- Serwer autoryzacji OAuth 2.1 (MCP, ChatGPT, Claude, Cursor, ...)
-- ============================================================
--
-- Uruchomic PO 072.
--
-- KONTEKST
-- --------
-- Do tej pory agent laczyl sie z Guidonem tylko kluczem API wklejonym
-- recznie. Klienci MCP (Claude.ai, ChatGPT, Cursor, VS Code) oczekuja
-- OAuth: odkrywaja serwer autoryzacji, rejestruja sie, czlowiek klika
-- "Zezwol" w Guidonie, a klient dostaje token. Ta migracja dodaje tabele
-- dla tego przeplywu (src/lib/oauth/oauth.ts):
--
-- oauth_clients        - zarejestrowani klienci: przez Dynamic Client
--                        Registration (RFC 7591, kind 'dcr') albo Client ID
--                        Metadata Document (client_id = URL, kind 'cimd').
--                        Tylko klienci publiczni (PKCE zamiast sekretu).
-- oauth_grants         - zgoda konkretnej osoby dla konkretnego klienta
--                        (zakresy, resource). Odwolanie = revoked_at; profil
--                        pokazuje je jako "Polaczone aplikacje".
-- oauth_codes          - jednorazowy kod autoryzacji (5 minut, PKCE S256).
-- oauth_refresh_tokens - refresh token (90 dni), rotowany przy kazdym
--                        uzyciu; ponowne uzycie zuzytego = odwolanie zgody.
--
-- Access token to zwykly klucz API (api_keys) z oauth_grant_id i
-- expires_at (godzina) - cala reszta API (zakresy, RLS, limity) dziala bez
-- zmian. Usuniecie zgody usuwa jej klucze (ON DELETE CASCADE); odwolanie
-- usuwa je w aplikacji.
--
-- Wszystko tylko service_role - serwer sam sprawdza tozsamosc (sesja albo
-- kod/token), nigdy nie bierze user_id z zapytania.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.oauth_clients (
    client_id     text        NOT NULL PRIMARY KEY CHECK (char_length(client_id) BETWEEN 1 AND 2000),
    kind          text        NOT NULL CHECK (kind IN ('dcr', 'cimd')),
    client_name   text        NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 100),
    redirect_uris text[]      NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10),
    client_uri    text,
    logo_uri      text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    fetched_at    timestamptz
);

CREATE TABLE IF NOT EXISTS public.oauth_grants (
    id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id     text        NOT NULL REFERENCES public.oauth_clients (client_id) ON DELETE CASCADE,
    user_id       uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    client_name   text        NOT NULL,
    scopes        text[]      NOT NULL,
    resource      text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_used_at  timestamptz,
    revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_oauth_grants_user ON public.oauth_grants (user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_grants_client ON public.oauth_grants (client_id);

CREATE TABLE IF NOT EXISTS public.oauth_codes (
    code_hash      text        NOT NULL PRIMARY KEY,
    grant_id       uuid        NOT NULL REFERENCES public.oauth_grants (id) ON DELETE CASCADE,
    redirect_uri   text        NOT NULL,
    code_challenge text        NOT NULL CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
    expires_at     timestamptz NOT NULL,
    used_at        timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_grant ON public.oauth_codes (grant_id);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON public.oauth_codes (expires_at);

CREATE TABLE IF NOT EXISTS public.oauth_refresh_tokens (
    token_hash  text        NOT NULL PRIMARY KEY,
    grant_id    uuid        NOT NULL REFERENCES public.oauth_grants (id) ON DELETE CASCADE,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_grant ON public.oauth_refresh_tokens (grant_id);


ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS oauth_grant_id uuid REFERENCES public.oauth_grants (id) ON DELETE CASCADE;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_api_keys_oauth_grant ON public.api_keys (oauth_grant_id) WHERE oauth_grant_id IS NOT NULL;


ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.oauth_clients FROM anon, authenticated;
REVOKE ALL ON public.oauth_grants FROM anon, authenticated;
REVOKE ALL ON public.oauth_codes FROM anon, authenticated;
REVOKE ALL ON public.oauth_refresh_tokens FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_clients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_grants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_refresh_tokens TO service_role;


COMMIT;
