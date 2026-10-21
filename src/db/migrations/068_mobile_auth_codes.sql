-- ============================================================
-- GUIDON - MIGRACJA 068
-- Logowanie aplikacji mobilnej (jednorazowe kody + PKCE)
-- ============================================================
--
-- Uruchomic PO 067.
--
-- KONTEKST
-- --------
-- Aplikacja mobilna (mobile/, Expo) loguje sie jak wtyczki edytorow -
-- prawdziwa strona logowania Guidona w przegladarce systemowej - ale nie
-- ma lokalnego serwera na localhost, wiec dostaje wynik przez wlasny
-- schemat guidon://auth. Taki adres moze przechwycic inna aplikacja, wiec
-- przez niego idzie tylko JEDNORAZOWY kod, a klucz API wydaje dopiero
-- POST /api/v1/auth/mobile/token za okazaniem code_verifier (PKCE,
-- RFC 7636 S256), ktory zna tylko aplikacja, ktora zaczela logowanie.
--
-- mobile_auth_codes: skrot kodu (sam kod nigdy nie jest zapisany),
-- czyj, code_challenge, waznosc (5 min), kiedy uzyty. Tylko service role.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.mobile_auth_codes (
    code_hash      text PRIMARY KEY,
    user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_challenge text NOT NULL CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
    expires_at     timestamptz NOT NULL,
    used_at        timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mobile_auth_codes_expires ON public.mobile_auth_codes (expires_at);

ALTER TABLE public.mobile_auth_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mobile_auth_codes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobile_auth_codes TO service_role;


COMMIT;
