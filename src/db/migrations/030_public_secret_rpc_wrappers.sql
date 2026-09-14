-- ============================================================
-- GUIDON - MIGRACJA 030
-- Publiczne wrappery dla private.get_github_connection_secrets /
-- private.get_org_ai_settings_with_key
-- ============================================================
--
-- Uruchomić PO 029.
--
-- BUG
-- ---
-- 025 dodała private.get_github_connection_secrets(uuid) i
-- private.get_org_ai_settings_with_key(uuid) jako SECURITY DEFINER, celowo
-- w schemacie `private` (nie `public`), żeby zamknąć bezpośrednią ścieżkę
-- PostgREST do zaszyfrowanych kolumn. github-connection.ts i
-- organization-ai-settings.ts wołają je w trybie hostowanym przez zwykłe
-- `supabase.rpc("get_github_connection_secrets", ...)` /
-- `supabase.rpc("get_org_ai_settings_with_key", ...)` - bez `.schema(...)`
-- klient supabase-js szuka funkcji w domyślnym eksponowanym schemacie
-- (`public`), więc PostgREST nigdy nie widzi funkcji faktycznie leżącej w
-- `private` i zwraca "Could not find the function public.... in the schema
-- cache". W trybie self-hosted (surowe SQL przez withUser) błędu nie było -
-- tam wołanie idzie wprost `private.get_..._secrets($1)`, z pominięciem
-- PostgREST-a - dlatego test:db (który gada z Postgresem bezpośrednio przez
-- PGlite, też z pominięciem PostgREST-a) nigdy tego nie złapał.
--
-- NAPRAWA
-- -------
-- Zamiast poszerzać listę eksponowanych schematów PostgREST-a o `private`
-- (co odsłoniłoby też wszystkie inne funkcje pomocnicze RLS w tym
-- schemacie - private.project_role(), private.is_org_member() itd. - dla
-- każdego zalogowanego klienta, znacznie szerzej niż potrzeba), dodajemy
-- wąskie wrappery w `public`, każdy po prostu wołający swój odpowiednik w
-- `private`. Ten sam SECURITY DEFINER + REVOKE/GRANT co w 025 - jawna
-- kontrola dostępu jest we `private` funkcji (private.project_access /
-- private.is_org_member), wrapper niczego nie zmienia w logice, tylko
-- robi funkcję widoczną tam, gdzie PostgREST jej szuka. Zero zmian w
-- kodzie aplikacji - `supabase.rpc("get_github_connection_secrets", ...)`
-- już celuje w `public` domyślnie.
-- ============================================================

BEGIN;


CREATE FUNCTION public.get_github_connection_secrets(
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
SELECT * FROM private.get_github_connection_secrets(p_project_id);
$$;

REVOKE ALL
    ON FUNCTION public.get_github_connection_secrets(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.get_github_connection_secrets(uuid)
TO authenticated;


CREATE FUNCTION public.get_org_ai_settings_with_key(
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
SELECT * FROM private.get_org_ai_settings_with_key(p_organization_id);
$$;

REVOKE ALL
    ON FUNCTION public.get_org_ai_settings_with_key(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.get_org_ai_settings_with_key(uuid)
TO authenticated;


COMMIT;
