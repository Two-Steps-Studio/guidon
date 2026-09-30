-- ============================================================
-- GUIDON - MIGRACJA 050
-- Webhooki organizacji (organization_webhooks)
-- ============================================================
--
-- Uruchomic PO 049.
--
-- KONTEKST
-- --------
-- Owner/admin organizacji dodaje w Ustawieniach organizacji adres URL, na
-- ktory Guidon wysyla POST przy zdarzeniach zadan (task.created,
-- task.status_changed, task.completed) we wszystkich projektach
-- organizacji. Kazde zadanie jest podpisane HMAC-SHA256 sekretem
-- generowanym przez serwer (docs/webhooks.md).
--
-- SEKRET
-- ------
-- secret_encrypted (encryptSecret, src/lib/crypto/secret-box.ts) jest
-- pokazywany uzytkownikowi raz, przy tworzeniu. authenticated ma GRANT
-- SELECT tylko na pozostale kolumny, wiec zadne zapytanie z sesji
-- uzytkownika go nie odczyta. Czyta go wylacznie wysylka
-- (src/lib/webhooks/dispatch.ts) przez service_role - zdarzenie wywoluje
-- dowolny czlonek projektu z prawem zapisu, nie tylko admin organizacji,
-- a on RLS-em tych wierszy nie widzi.
--
-- RLS: SELECT/INSERT/UPDATE/DELETE - owner/admin organizacji (jak
-- organization_ai_settings, 024), INSERT dodatkowo created_by = auth.uid().
-- UPDATE ograniczony GRANT-em kolumnowym do url/description/events/
-- enabled - last_* zapisuje tylko service_role.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.organization_webhooks (
    id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id   uuid        NOT NULL,
    url               text        NOT NULL CHECK (url ~ '^https?://' AND length(url) <= 2048),
    description       text        CHECK (description IS NULL OR length(description) <= 200),
    events            text[]      NOT NULL
                                  CHECK (
                                      cardinality(events) > 0
                                      AND events <@ ARRAY['task.created', 'task.status_changed', 'task.completed']::text[]
                                  ),
    secret_encrypted  text        NOT NULL,
    enabled           boolean     NOT NULL DEFAULT true,
    created_by        uuid,
    last_delivery_at  timestamptz,
    last_status       integer,
    last_error        text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_webhooks
    DROP CONSTRAINT IF EXISTS organization_webhooks_organization_id_fkey;
ALTER TABLE public.organization_webhooks
    ADD CONSTRAINT organization_webhooks_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.organization_webhooks
    DROP CONSTRAINT IF EXISTS organization_webhooks_created_by_fkey;
ALTER TABLE public.organization_webhooks
    ADD CONSTRAINT organization_webhooks_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organization_webhooks_org ON public.organization_webhooks (organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_webhooks_created_by ON public.organization_webhooks (created_by);

CREATE TRIGGER update_organization_webhooks_updated_at
    BEFORE UPDATE ON public.organization_webhooks
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


ALTER TABLE public.organization_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_webhooks_select ON public.organization_webhooks;
CREATE POLICY organization_webhooks_select
ON public.organization_webhooks
FOR SELECT
TO authenticated
USING (private.org_role(organization_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS organization_webhooks_insert ON public.organization_webhooks;
CREATE POLICY organization_webhooks_insert
ON public.organization_webhooks
FOR INSERT
TO authenticated
WITH CHECK (
    private.org_role(organization_id) IN ('owner', 'admin')
    AND created_by = (SELECT auth.uid())
);

DROP POLICY IF EXISTS organization_webhooks_update ON public.organization_webhooks;
CREATE POLICY organization_webhooks_update
ON public.organization_webhooks
FOR UPDATE
TO authenticated
USING (private.org_role(organization_id) IN ('owner', 'admin'))
WITH CHECK (private.org_role(organization_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS organization_webhooks_delete ON public.organization_webhooks;
CREATE POLICY organization_webhooks_delete
ON public.organization_webhooks
FOR DELETE
TO authenticated
USING (private.org_role(organization_id) IN ('owner', 'admin'));


REVOKE ALL ON public.organization_webhooks FROM anon;
REVOKE ALL ON public.organization_webhooks FROM authenticated;
GRANT SELECT (id, organization_id, url, description, events, enabled, created_by,
              last_delivery_at, last_status, last_error, created_at, updated_at)
    ON public.organization_webhooks TO authenticated;
GRANT INSERT (organization_id, url, description, events, secret_encrypted, enabled, created_by)
    ON public.organization_webhooks TO authenticated;
GRANT UPDATE (url, description, events, enabled) ON public.organization_webhooks TO authenticated;
GRANT DELETE ON public.organization_webhooks TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_webhooks TO service_role;


COMMIT;
