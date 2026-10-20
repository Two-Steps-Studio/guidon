-- ============================================================
-- GUIDON - MIGRACJA 059
-- Konta AI (czlonkowie-boty)
-- ============================================================
--
-- Uruchomic PO 058.
--
-- KONTEKST
-- --------
-- Owner/admin organizacji tworzy konto dla agenta AI (np. "Claude -
-- backend"). To prawdziwy uzytkownik (auth.users + profiles), wiec mozna
-- go dodac do projektow z rola, przypisac mu zadanie, a jego komentarze i
-- aktywnosc sa podpisane jego nazwa. Dziala tylko przez klucze API/MCP:
-- nie ma hasla, a e-mail jest w domenie .invalid (RFC 2606), na ktora nie
-- da sie dostac linku logowania.
--
-- Ta tabela oznacza, ktore profile sa kontami AI, w ktorej organizacji
-- i kto je zalozyl. Zapisuje ja WYLACZNIE serwer (service role), i tylko
-- dla uzytkownika, ktorego sam przed chwila utworzyl: gdyby admin mogl
-- oznaczyc dowolny profil jako konto AI, moglby wygenerowac klucz
-- dzialajacy jako prawdziwy czlowiek. Dlatego authenticated ma tu tylko
-- SELECT (czlonkowie organizacji widza, kto jest botem).
--
-- Wylaczenie konta (disabled_at) zamiast usuwania: usuniecie uzytkownika
-- kasuje kaskadowo jego komentarze i proby (task_comments, task_attempts),
-- a historia pracy agenta ma zostac. Serwer przy wylaczeniu odwoluje
-- klucze i zdejmuje czlonkostwa.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.ai_accounts (
    user_id         uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
    description     text        CHECK (description IS NULL OR char_length(description) <= 500),
    disabled_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_accounts_organization ON public.ai_accounts (organization_id);


ALTER TABLE public.ai_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_accounts_select ON public.ai_accounts;
CREATE POLICY ai_accounts_select
ON public.ai_accounts
FOR SELECT
TO authenticated
USING (private.is_org_member(organization_id));

-- Celowo bez INSERT/UPDATE/DELETE dla authenticated - patrz KONTEKST.
REVOKE ALL ON public.ai_accounts FROM anon, authenticated;
GRANT SELECT ON public.ai_accounts TO authenticated;


-- Profil konta AI zostaje widoczny dla czlonkow jego organizacji takze po
-- wylaczeniu (bez czlonkostwa profiles_select_team juz go nie pokazuje),
-- zeby historia - komentarze, aktywnosc, proby - dalej miala nazwe.
DROP POLICY IF EXISTS profiles_select_ai_accounts ON public.profiles;
CREATE POLICY profiles_select_ai_accounts
ON public.profiles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.ai_accounts a
        WHERE a.user_id = profiles.id
          AND private.is_org_member(a.organization_id)
    )
);


COMMIT;
