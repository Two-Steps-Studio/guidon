-- ============================================================
-- GUIDON - MIGRACJA 025
-- Ogranicz bezpośredni SELECT zaszyfrowanych sekretów
-- ============================================================
--
-- Uruchomić PO 024.
--
-- KONTEKST
-- --------
-- github_connections.access_token_encrypted / refresh_token_encrypted (021)
-- i organization_ai_settings.api_key_encrypted (024) mają blankietowy
-- `GRANT SELECT ... TO authenticated`, a polityka SELECT sprawdza wyłącznie
-- członkostwo (project/org), nie rolę - to świadomy wybór udokumentowany w
-- obu migracjach ("widoczność że coś jest skonfigurowane" != "może to
-- zmienić"). Warstwa aplikacji (src/lib/data/github-connection.ts,
-- organization-ai-settings.ts) jest zdyscyplinowana i nigdy nie zwraca tych
-- kolumn do komponentu klienckiego - ale to dyscyplina warstwy JS, nie
-- gwarancja bazy danych. Na hostowanej wersji (Supabase) PostgREST wystawia
-- te tabele bezpośrednio pod /rest/v1/... - dowolny członek projektu/
-- organizacji (nie tylko owner/admin) mógłby zapytać wprost o
-- `?select=api_key_encrypted` czy `?select=access_token_encrypted`,
-- omijając całkowicie server actions aplikacji, i dostać ciphertext.
-- Ryzyko ograniczone szyfrowaniem (AES-256-GCM, klucz pochodny od
-- AUTH_SECRET, nigdy nie opuszcza serwera) - ale to nadal ekspozycja poza
-- granicą kontroli dostępu aplikacji, dokładnie ta klasa luki co 017
-- (audyt GRANT na poziomie kolumny) już raz zamykał, tyle że tam chodziło
-- o UPDATE, nie SELECT.
--
-- Proste zawężenie `GRANT SELECT (bezpieczne_kolumny)` tu nie wystarczy:
-- getOrgAiSettingsWithKey()/getProjectGithubToken() muszą czytać
-- zaszyfrowaną kolumnę jako rola `authenticated` - DOWOLNY członek projektu/
-- organizacji może wyzwolić akcję AI/GitHub, która potrzebuje, żeby serwer
-- użył sekretu w jego imieniu, więc zwężenie GRANT-u złamałoby tę legalną
-- ścieżkę razem z nielegalną.
--
-- Rozwiązanie: dwie funkcje SECURITY DEFINER (dokładnie ten sam wzorzec co
-- private.is_org_member/project_access z 001) - każda sama sprawdza
-- członkostwo w środku i zwraca tylko sekretne kolumny jednego, konkretnego
-- wiersza. Bezpośredni SELECT tych kolumn z tabeli jest odtąd zablokowany
-- (REVOKE), więc jedyna droga do ciphertextu to ta funkcja - PostgREST co
-- prawda wystawia też RPC (/rest/v1/rpc/...), ale to wymusza przejście
-- przez zdefiniowaną, kontrolowaną semantykę (dokładnie jedna zmienna
-- wejściowa - id, żadnego dowolnego wyboru kolumn) zamiast wolnego
-- `select=` na całej tabeli.
--
-- Nic w warstwie aplikacji poza tymi dwiema funkcjami odczytu nie zmienia
-- się w tej migracji - UPDATE/INSERT/DELETE granty i polityki RLS z 021/024
-- zostają nietknięte.
-- ============================================================

BEGIN;


-- ------------------------------------------------------------
-- github_connections
-- ------------------------------------------------------------

CREATE FUNCTION private.get_github_connection_secrets(
    p_project_id uuid
)
    RETURNS TABLE (
        access_token_encrypted   text,
        refresh_token_encrypted  text,
        access_token_expires_at  timestamptz,
        refresh_token_expires_at timestamptz
    )
    LANGUAGE sql
    STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT
    gc.access_token_encrypted,
    gc.refresh_token_encrypted,
    gc.access_token_expires_at,
    gc.refresh_token_expires_at
FROM public.github_connections gc
WHERE gc.project_id = p_project_id
  AND private.project_access(p_project_id);
$$;

REVOKE ALL
    ON FUNCTION private.get_github_connection_secrets(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION private.get_github_connection_secrets(uuid)
TO authenticated;

-- Tylko SELECT jest tu zawężany - INSERT/UPDATE/DELETE i ich polityki RLS
-- (021) zostają jak były.
REVOKE SELECT
    ON public.github_connections
    FROM authenticated;

GRANT SELECT (
    project_id, connected_by, github_login, installation_id,
    repo_owner, repo_name, default_branch, created_at, updated_at
)
ON public.github_connections
TO authenticated;


-- ------------------------------------------------------------
-- organization_ai_settings
-- ------------------------------------------------------------

CREATE FUNCTION private.get_org_ai_settings_with_key(
    p_organization_id uuid
)
    RETURNS TABLE (
        provider          text,
        model             text,
        api_key_encrypted text
    )
    LANGUAGE sql
    STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT
    oas.provider,
    oas.model,
    oas.api_key_encrypted
FROM public.organization_ai_settings oas
WHERE oas.organization_id = p_organization_id
  AND private.is_org_member(p_organization_id);
$$;

REVOKE ALL
    ON FUNCTION private.get_org_ai_settings_with_key(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION private.get_org_ai_settings_with_key(uuid)
TO authenticated;

REVOKE SELECT
    ON public.organization_ai_settings
    FROM authenticated;

GRANT SELECT (organization_id, provider, model, created_by, created_at, updated_at)
ON public.organization_ai_settings
TO authenticated;


COMMIT;
