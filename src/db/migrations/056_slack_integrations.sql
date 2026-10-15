-- ============================================================
-- GUIDON - MIGRACJA 056
-- Integracja ze Slackiem: kanal Slacka -> projekt (komenda /guidon)
-- ============================================================
--
-- Uruchomic PO 055.
--
-- KONTEKST
-- --------
-- Odpowiednik bota Discord (035), ale bez osobnego procesu: Slack wysyla
-- komendy slash zwyklym HTTPS POST-em, wiec obsluguje je sama aplikacja
-- (src/app/api/integrations/slack/commands/route.ts, podpis Slacka
-- weryfikowany SLACK_SIGNING_SECRET). Dlatego nie ma tu zaszyfrowanego
-- klucza API: komenda wykonuje sie jako `linked_by` (withUser / klient
-- uzytkownika), z actor_label "Slack bot" - RLS tej osoby decyduje jak w
-- przegladarce. Odebranie jej roli w projekcie (albo usuniecie konta)
-- odcina kanal sam z siebie.
--
-- Jeden wiersz na KANAL (team_id + channel_id), nie na workspace: firma ma
-- zwykle wiele projektow w jednym workspace i osobny kanal na kazdy.
-- Projekt moze miec kilka kanalow.
--
-- Zapis (polaczenie / rozlaczenie) robi strona /slack/link i ustawienia
-- projektu jako zalogowany owner/admin, pod RLS ponizej. Odczyt po
-- (team_id, channel_id) przy obsludze komendy idzie przez service role -
-- Slack nie ma sesji Guidona; trasa ufa tylko zweryfikowanemu podpisowi.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.slack_integrations (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    team_id       text        NOT NULL CHECK (char_length(team_id) BETWEEN 1 AND 32),
    team_name     text,
    channel_id    text        NOT NULL CHECK (char_length(channel_id) BETWEEN 1 AND 32),
    channel_name  text,
    linked_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT slack_integrations_channel_unique UNIQUE (team_id, channel_id)
);

-- Per-project list in settings, and the FK lookup on project delete.
CREATE INDEX IF NOT EXISTS idx_slack_integrations_project ON public.slack_integrations (project_id);
CREATE INDEX IF NOT EXISTS idx_slack_integrations_linked_by ON public.slack_integrations (linked_by);


ALTER TABLE public.slack_integrations ENABLE ROW LEVEL SECURITY;


-- Every project member sees which channels are connected (as with 035).
DROP POLICY IF EXISTS slack_integrations_select ON public.slack_integrations;
CREATE POLICY slack_integrations_select
ON public.slack_integrations
FOR SELECT
TO authenticated
USING (private.project_access(project_id));

-- Connecting a channel is project configuration: owner/admin, and the row
-- must name the caller as linked_by - the commands then run as them, so
-- nobody can connect a channel that acts as someone else.
DROP POLICY IF EXISTS slack_integrations_insert ON public.slack_integrations;
CREATE POLICY slack_integrations_insert
ON public.slack_integrations
FOR INSERT
TO authenticated
WITH CHECK (
    private.project_role(project_id) IN ('owner', 'admin')
    AND linked_by = (SELECT auth.uid())
);

DROP POLICY IF EXISTS slack_integrations_delete ON public.slack_integrations;
CREATE POLICY slack_integrations_delete
ON public.slack_integrations
FOR DELETE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'));

-- No UPDATE: moving a channel to another project is disconnect + connect,
-- so linked_by always names whoever made the current link.
GRANT SELECT, INSERT, DELETE ON public.slack_integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slack_integrations TO service_role;


COMMIT;
