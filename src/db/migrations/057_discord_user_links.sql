-- ============================================================
-- GUIDON - MIGRACJA 057
-- Osobiste logowanie do bota Discord (konto Discord -> konto Guidon)
-- ============================================================
--
-- Uruchomic PO 055 (056 to Slack na osobnej galezi - kolejnosc miedzy nimi
-- nie ma znaczenia, nie dotykaja tych samych tabel).
--
-- KONTEKST
-- --------
--
-- Do tej pory kazda komenda /task-* na serwerze Discord dzialala kluczem
-- API osoby, ktora podlaczyla serwer (/guidon-link, 035) - wszyscy
-- czlonkowie serwera dzialali "jako admin", dlatego komendy byly ograniczone
-- do Manage Server. Teraz kazdy moze sie zalogowac wlasnym kontem
-- (/guidon-login -> strona /discord/login, jak logowanie pluginow): web
-- tworzy osobisty klucz uzytkownika i zapisuje go tu, zaszyfrowany tym samym
-- kluczem pochodnym co linked_api_key_encrypted (info "discord-bot-key-v1").
-- Bot czyta wiersz bezposrednio (DATABASE_URL / service_role) i wywoluje API
-- tym kluczem, wiec akcja idzie na konto i uprawnienia tej osoby (RLS).
--
-- Jeden wiersz na konto Discord; jedno konto Guidon moze miec kilka kont
-- Discord. Uzytkownik widzi i usuwa tylko swoje wiersze; zaszyfrowany klucz
-- nie ma grantu SELECT dla `authenticated` (jak w 035). Zmiana wlasciciela
-- (konto Discord podpiete do innego konta Guidon) jest zablokowana przez
-- RLS: najpierw /guidon-logout w Discordzie.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.discord_user_links (
    discord_user_id      text        PRIMARY KEY,
    user_id              uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    discord_username     text,
    api_key_id           uuid        REFERENCES public.api_keys(id) ON DELETE SET NULL,
    api_key_encrypted    text        NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discord_user_links_user_id
    ON public.discord_user_links(user_id);

DROP TRIGGER IF EXISTS update_discord_user_links_updated_at ON public.discord_user_links;
CREATE TRIGGER update_discord_user_links_updated_at
    BEFORE UPDATE ON public.discord_user_links
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


ALTER TABLE public.discord_user_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discord_user_links_select ON public.discord_user_links;
CREATE POLICY discord_user_links_select
ON public.discord_user_links
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS discord_user_links_insert ON public.discord_user_links;
CREATE POLICY discord_user_links_insert
ON public.discord_user_links
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS discord_user_links_update ON public.discord_user_links;
CREATE POLICY discord_user_links_update
ON public.discord_user_links
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS discord_user_links_delete ON public.discord_user_links;
CREATE POLICY discord_user_links_delete
ON public.discord_user_links
FOR DELETE
TO authenticated
USING (user_id = auth.uid());


REVOKE ALL ON public.discord_user_links FROM anon, authenticated;

GRANT SELECT (discord_user_id, user_id, discord_username, api_key_id, created_at, updated_at)
ON public.discord_user_links
TO authenticated;

GRANT INSERT (discord_user_id, user_id, discord_username, api_key_id, api_key_encrypted, updated_at)
ON public.discord_user_links
TO authenticated;

GRANT UPDATE (discord_username, api_key_id, api_key_encrypted, updated_at)
ON public.discord_user_links
TO authenticated;

GRANT DELETE ON public.discord_user_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discord_user_links TO service_role;


COMMIT;
