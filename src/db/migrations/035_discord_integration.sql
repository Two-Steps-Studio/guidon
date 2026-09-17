-- ============================================================
-- GUIDON - MIGRACJA 035
-- Integracja z Discordem (powiadomienia + bot komend)
-- ============================================================
--
-- Uruchomic PO 034.
--
-- KONTEKST
-- --------
--
-- Jeden wiersz na projekt (project_id jako PRIMARY KEY, ten sam ksztalt co
-- github_connections z 021). Dwa niezalezne mechanizmy dziela ten sam
-- wiersz:
--
-- 1) webhook_url_encrypted - URL webhooka kanalu Discord (funkcja natywna
--    Discorda, zwykly HTTPS POST, bez logowania bota). Aplikacja
--    (src/lib/discord/notify.ts) POST-uje tam bezposrednio przy zmianach
--    zadan. Ustawiane z poziomu strony ustawien projektu, przez zwykla
--    polityke RLS ponizej (owner/admin, jak w github_connections).
--
-- 2) linked_api_key_encrypted + guild_id/guild_name - uzywane WYLACZNIE
--    przez proces bota (discord-bot/), nie przez ta aplikacje webowa. Bot
--    to zaufana usluga pierwszej strony we wlasnym procesie (ten sam
--    poziom zaufania co scripts/migrate.mjs), laczy sie z ta sama baza
--    bezposrednio (DATABASE_URL / klucz service_role Supabase) i zapisuje
--    ten wiersz z pominieciem RLS przy obsludze komendy `/guidon link` -
--    stad brak polityki INSERT/UPDATE dla `authenticated` obejmujacej te
--    dwie kolumny: zwykli uzytkownicy nigdy nie pisza do nich przez appke
--    webowa w ogole, wiec nie ma czego tam ograniczac per-kolumnowo (w
--    odroznieniu od webhook_url_encrypted, ktory appka webowa faktycznie
--    zapisuje).
--
-- Oba szyfrowane sekretami tym samym mechanizmem co github_connections/
-- organization_ai_settings (src/lib/crypto/secret-box.ts, AES-256-GCM
-- pochodny od AUTH_SECRET) - discord-bot/ potrzebuje wlasnej kopii tego
-- ~50-liniowego modulu (osobny pakiet npm, osobny proces), tak samo jak
-- desktop/ nie dzieli node_modules z glowna appka.
--
-- Bezposredni SELECT szyfrowanych kolumn jest zablokowany identycznie jak
-- w 025 - funkcja SECURITY DEFINER zdefiniowana OD RAZU w `public`, nie w
-- `private` - migracja 030 znalazla i naprawila dokladnie ten blad dla
-- github/org-ai (supabase-js .rpc() celuje w `public` domyslnie, PostgREST
-- nie widzi funkcji w `private`), wiec tu robimy to poprawnie od poczatku.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.discord_integrations (
    project_id                 uuid        PRIMARY KEY,
    guild_id                   text        UNIQUE,
    guild_name                 text,
    webhook_url_encrypted      text,
    linked_api_key_encrypted   text,
    linked_by                  uuid,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_integrations
DROP CONSTRAINT IF EXISTS discord_integrations_project_id_fkey;

ALTER TABLE public.discord_integrations
    ADD CONSTRAINT discord_integrations_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;

ALTER TABLE public.discord_integrations
DROP CONSTRAINT IF EXISTS discord_integrations_linked_by_fkey;

ALTER TABLE public.discord_integrations
    ADD CONSTRAINT discord_integrations_linked_by_fkey
        FOREIGN KEY (linked_by)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_discord_integrations_linked_by
    ON public.discord_integrations(linked_by);

CREATE TRIGGER update_discord_integrations_updated_at
    BEFORE UPDATE ON public.discord_integrations
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


ALTER TABLE public.discord_integrations ENABLE ROW LEVEL SECURITY;


-- Kazdy czlonek projektu widzi ZE integracja istnieje (guild_name,
-- kiedy podlaczono) - to samo uprawnienie co widocznosc samego projektu.
-- Szyfrowane kolumny sa zablokowane ponizej (REVOKE + kolumnowy GRANT).
DROP POLICY IF EXISTS discord_integrations_select ON public.discord_integrations;
CREATE POLICY discord_integrations_select
ON public.discord_integrations
FOR SELECT
TO authenticated
USING (private.project_access(project_id));

-- Tylko webhook_url_encrypted jest zapisywany z poziomu appki webowej
-- (strona ustawien projektu) - guild_id/linked_api_key_encrypted pisze
-- wylacznie proces bota, z pominieciem RLS (patrz komentarz na gorze).
DROP POLICY IF EXISTS discord_integrations_insert ON public.discord_integrations;
CREATE POLICY discord_integrations_insert
ON public.discord_integrations
FOR INSERT
TO authenticated
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS discord_integrations_update ON public.discord_integrations;
CREATE POLICY discord_integrations_update
ON public.discord_integrations
FOR UPDATE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'))
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS discord_integrations_delete ON public.discord_integrations;
CREATE POLICY discord_integrations_delete
ON public.discord_integrations
FOR DELETE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'));


-- Sekrety: zablokuj bezposredni SELECT, wystaw tylko przez funkcje
-- SECURITY DEFINER (ten sam wzorzec co 025, zdefiniowana w `public` od razu).
REVOKE SELECT
    ON public.discord_integrations
    FROM authenticated;

GRANT SELECT (
    project_id, guild_id, guild_name, linked_by, created_at, updated_at
)
ON public.discord_integrations
TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.discord_integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discord_integrations TO service_role;


CREATE FUNCTION public.get_discord_webhook_url(
    p_project_id uuid
)
    RETURNS TABLE (
        webhook_url_encrypted text
    )
    LANGUAGE sql
    STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT di.webhook_url_encrypted
FROM public.discord_integrations di
WHERE di.project_id = p_project_id
  AND private.project_access(p_project_id);
$$;

REVOKE ALL
    ON FUNCTION public.get_discord_webhook_url(uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.get_discord_webhook_url(uuid)
TO authenticated;


COMMIT;
