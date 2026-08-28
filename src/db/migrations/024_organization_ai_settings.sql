-- ============================================================
-- GUIDON - MIGRACJA 024
-- Ustawienia AI per organizacja (provider + model + klucz)
-- ============================================================
--
-- Uruchomić PO 023.
--
-- Do tej pory jedynym sposobem skonfigurowania providera AI
-- (src/lib/ai/provider.ts) były zmienne środowiskowe instancji
-- (AI_PROVIDER/AI_MODEL/*_API_KEY) - dobre dla self-hostingu, złe dla
-- hostowanej wersji wielodostępnej: każda organizacja dzieliłaby jeden
-- klucz operatora. Ta tabela pozwala organizacji wkleić własny klucz w
-- aplikacji, bez zmiennych środowiskowych i bez redeployu.
--
-- Tylko cztery providery, które potrzebują wyłącznie klucza (bez
-- dodatkowych pól typu endpoint/deployment) są tu konfigurowalne -
-- azure-openai, custom i ollama zostają wyłącznie na poziomie zmiennych
-- środowiskowych instancji.
--
-- api_key_encrypted szyfrowany tak samo jak tokeny GitHuba
-- (src/lib/crypto/secret-box.ts, 021), ale pod osobnym "info" stringiem
-- ("org-ai-key-v1"), więc oba typy sekretów nigdy nie dzielą wyprowadzonego
-- klucza. RLS SELECT jest szerokie (każdy członek organizacji) - to samo
-- podejście co przy github_connections (021): "widoczność że coś jest
-- skonfigurowane" to inne uprawnienie niż "może to zmienić". Warstwa
-- aplikacji (src/lib/data/organization-ai-settings.ts) nigdy nie zwraca
-- api_key_encrypted do komponentu klienckiego - dokładnie ten sam podział
-- bezpiecznych/pełnych kolumn co github-connection.ts.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.organization_ai_settings (
    organization_id     uuid        PRIMARY KEY,
    provider             text        NOT NULL,
    model                text        NOT NULL,
    api_key_encrypted    text        NOT NULL,
    created_by           uuid        NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_ai_settings
DROP CONSTRAINT IF EXISTS organization_ai_settings_organization_id_fkey;

ALTER TABLE public.organization_ai_settings
    ADD CONSTRAINT organization_ai_settings_organization_id_fkey
        FOREIGN KEY (organization_id)
            REFERENCES public.organizations(id)
            ON DELETE CASCADE;

ALTER TABLE public.organization_ai_settings
DROP CONSTRAINT IF EXISTS organization_ai_settings_provider_check;

ALTER TABLE public.organization_ai_settings
    ADD CONSTRAINT organization_ai_settings_provider_check
        CHECK (provider IN ('anthropic', 'openai', 'openrouter', 'groq'));


ALTER TABLE public.organization_ai_settings ENABLE ROW LEVEL SECURITY;


-- Każdy członek organizacji widzi ŻE AI jest skonfigurowane (provider/model) -
-- to samo uprawnienie co widoczność samej organizacji. Klucz nigdy nie
-- opuszcza serwera niezależnie od RLS - patrz komentarz wyżej.
DROP POLICY IF EXISTS organization_ai_settings_select ON public.organization_ai_settings;
CREATE POLICY organization_ai_settings_select
ON public.organization_ai_settings
FOR SELECT
TO authenticated
USING (private.is_org_member(organization_id));

-- Konfiguracja AI to ustawienie organizacji - tylko owner/admin, tak jak
-- reszta ustawień organizacji (014).
DROP POLICY IF EXISTS organization_ai_settings_insert ON public.organization_ai_settings;
CREATE POLICY organization_ai_settings_insert
ON public.organization_ai_settings
FOR INSERT
TO authenticated
WITH CHECK (private.org_role(organization_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS organization_ai_settings_update ON public.organization_ai_settings;
CREATE POLICY organization_ai_settings_update
ON public.organization_ai_settings
FOR UPDATE
TO authenticated
USING (private.org_role(organization_id) IN ('owner', 'admin'))
WITH CHECK (private.org_role(organization_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS organization_ai_settings_delete ON public.organization_ai_settings;
CREATE POLICY organization_ai_settings_delete
ON public.organization_ai_settings
FOR DELETE
TO authenticated
USING (private.org_role(organization_id) IN ('owner', 'admin'));


GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_ai_settings TO authenticated;


COMMIT;
