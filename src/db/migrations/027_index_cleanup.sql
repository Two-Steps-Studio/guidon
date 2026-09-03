-- ============================================================
-- GUIDON - MIGRACJA 027
-- Porzadki indeksowe: brakujacy indeks, zduplikowane indeksy,
-- zbedny pojedynczy indeks przy istniejacym zlozonym
-- ============================================================
--
-- KONTEKST
-- --------
--
-- 1) api_keys.user_id nie ma zadnego indeksu, mimo ze to jedyna kolumna, po
--    ktorej filtruje kazdy odczyt (listApiKeys, src/app/profile/api-keys-
--    actions.ts) i kazda polityka RLS na tej tabeli (api_keys_select/
--    api_keys_revoke, oba USING (user_id = auth.uid())), a takze kaskadowe
--    DELETE z profiles (ON DELETE CASCADE, 016) - bez indeksu to sekwencyjny
--    skan przy kazdym dostepie i przy kazdym usunieciu konta.
--
-- 2) Migracja 026 dodala UNIQUE (organization_id, user_id) na
--    organization_members i UNIQUE (project_id, user_id) na project_members
--    w przekonaniu, ze zadne takie ograniczenie nie istnialo. W
--    miedzyczasie 001_initial_schema.sql zostal scalony na nowo (commit
--    9268728, sekcja "11. UNIQUE MEMBERSHIP INDEXES") i juz zawiera
--    dokladnie te same unikalne indeksy (uq_organization_members_org_user,
--    uq_project_members_project_user) - 026 wciaz jest bezpieczna (ten sam
--    warunek, po prostu wyegzekwowany dwa razy), ale od tego momentu obie
--    tabele niosa dwa funkcjonalnie identyczne indeksy unique zamiast
--    jednego. Kazdy INSERT/UPDATE/DELETE na wierszach czlonkostwa - a
--    private.org_role()/private.project_role() odpytuja te tabele przy
--    niemal kazdym zadaniu objetym RLS - utrzymuje teraz dwa btree zamiast
--    jednego bez zadnej korzysci przy planowaniu zapytan. Zostaje indeks z
--    001 (starszy, uzywany w istniejacych planach zapytan); usuwany jest
--    ten dodany przez 026. app-owe uzycia (isUniqueViolation() w obu
--    actions.ts) sprawdzaja tylko error.code === '23505', nie nazwe
--    ograniczenia, wiec nie zalezy im na tym, ktory indeks faktycznie
--    odrzuci duplikat.
--
-- 3) idx_technologies_project (project_id) z 001 jest zbedny odkad 008
--    dodal idx_technologies_project_category (project_id, category,
--    sort_order) - project_id jako wiodaca kolumna zlozonego indeksu juz
--    obsluguje kazdy wzorzec zapytania uzywany w tym repo (technology/
--    page.tsx filtruje zawsze samym project_id lub project_id + category).
--
-- 4) activity_logs ma tylko pojedyncze indeksy (project_id) i (created_at) z
--    001. Jedyny odczyt filtrowany po project_id (src/lib/data/activity.ts)
--    zawsze tez sortuje po created_at DESC - bez zlozonego indeksu Postgres
--    musi posortowac pasujace wiersze osobno zamiast przejsc juz
--    posortowany indeks i zatrzymac sie po LIMIT. Nowy indeks zlozony
--    obsluguje ten sam wzorzec co idx_activity_project (ktora kolumna jest
--    jego wiodaca), wiec ten drugi staje sie zbedny i tez jest usuwany;
--    idx_activity_created zostaje (uzywany osobno przez
--    listRecentActivityForAdmin, admin.ts, ktora nie filtruje po
--    project_id).
-- ============================================================

BEGIN;


-- ------------------------------------------------------------
-- 1) api_keys.user_id
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_api_keys_user
    ON public.api_keys(user_id);


-- ------------------------------------------------------------
-- 2) zduplikowane unikalne indeksy czlonkostwa (026 vs 001)
-- ------------------------------------------------------------

ALTER TABLE public.organization_members
DROP CONSTRAINT IF EXISTS organization_members_org_user_unique;

ALTER TABLE public.project_members
DROP CONSTRAINT IF EXISTS project_members_project_user_unique;


-- ------------------------------------------------------------
-- 3) technologies: pojedynczy indeks zbedny przy zlozonym (008)
-- ------------------------------------------------------------

DROP INDEX IF EXISTS public.idx_technologies_project;


-- ------------------------------------------------------------
-- 4) activity_logs: zlozony indeks (project_id, created_at DESC)
--    zastepujacy pojedynczy idx_activity_project
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_activity_project_created
    ON public.activity_logs(project_id, created_at DESC);

DROP INDEX IF EXISTS public.idx_activity_project;


COMMIT;
