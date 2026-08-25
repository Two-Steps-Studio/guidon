-- ============================================================
-- GUIDON - MIGRACJA 014
-- Limit projektów per organizacja: organizations.project_limit
-- ============================================================
--
-- Uruchomić PO 013.
--
-- POWÓD
-- -----
-- Guidon Cloud (hosted, brak DATABASE_URL) ogranicza każdą organizację
-- do 1 projektu przez stałą HOSTED_PROJECT_LIMIT_PER_ORG
-- (src/lib/limits.ts). Nie było sposobu podnieść ten limit dla
-- konkretnej organizacji bez zmiany kodu i redeployu. Self-hosted
-- (DATABASE_URL ustawione) nie ma i nadal nie będzie miał żadnego
-- limitu - bez zmian.
--
-- Ta migracja dodaje project_limit jako kolumnę per-organizacja,
-- domyślnie 1 (dzisiejsze zachowanie), edytowalną tylko przez panel
-- admina (src/app/admin/organizations).
--
-- BEZPIECZEŃSTWO: GRANT na poziomie kolumny, nie tylko RLS
-- --------------------------------------------------------
-- Polityka organizations_update (001) pozwala właścicielowi/adminowi
-- organizacji nadpisać DOWOLNĄ kolumnę swojego wiersza:
--
--   USING (private.org_role(id) IN ('owner', 'admin'))
--   WITH CHECK (private.org_role(id) IN ('owner', 'admin'))
--
-- 001 nadaje też GRANT UPDATE ... TO authenticated bez ograniczenia
-- do kolumn. Bez interwencji właściciel organizacji mógłby więc sam
-- podnieść sobie project_limit przez zwykłe wywołanie
-- supabase.from('organizations').update(...) - RLS by tego nie
-- zatrzymało, bo polityka nie patrzy na to, KTÓRE kolumny się zmieniają.
--
-- Rozwiązanie: REVOKE całościowego UPDATE od authenticated i GRANT
-- z powrotem tylko na (name, slug, description) - te trzy kolumny są
-- jedynymi, które kod aplikacji mógłby dziś aktualizować (obecnie
-- żaden kod wcale nie robi UPDATE na organizations, więc to zawężenie
-- niczego dziś nie psuje). service_role ma już GRANT ALL ON ALL TABLES
-- (000_auth_compat.sql), więc panel admina (createServiceClient() /
-- withServiceRole()) zapisuje project_limit bez przeszkód - to jedyna
-- uprawniona ścieżka zapisu tej kolumny.
-- ============================================================

BEGIN;


ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS project_limit integer NOT NULL DEFAULT 1
        CHECK (project_limit >= 1);


REVOKE UPDATE ON public.organizations FROM authenticated;

GRANT UPDATE (name, slug, description)
    ON public.organizations
    TO authenticated;


COMMIT;
