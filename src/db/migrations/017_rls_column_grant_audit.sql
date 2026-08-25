-- ============================================================
-- GUIDON - MIGRACJA 017
-- Audyt bezpieczeństwa RLS: braki GRANT na poziomie kolumny
-- ============================================================
--
-- Uruchomić PO 016.
--
-- KONTEKST
-- --------
-- 014 (organizations.project_limit), 015 (subscriptions.plan_id) i 016
-- (api_keys.scopes) udokumentowały ten sam wzorzec: polityka UPDATE
-- sprawdza ROLĘ wywołującego, ale samo RLS nie ogranicza, KTÓRE kolumny
-- wolno zmienić - to robi wyłącznie GRANT. Tabela z blankietowym
-- `GRANT ... UPDATE ... TO authenticated` wystawia więc na zapis każdą
-- kolumnę, także te, których polityka nigdy nie sprawdza.
--
-- Ten sam wzorzec przeszukano systematycznie po całym schemacie (patrz
-- audyt w tej sesji). Cztery kolejne tabele miały tę samą lukę:
--
-- 1) public.projects - KRYTYCZNE. projects_update (001) sprawdza rolę
--    względem NIEZMIENNEGO id wiersza:
--        USING (private.project_role(id) IN ('owner','admin'))
--    Dla porównania tasks_update/roadmap_phases_update sprawdzają rolę
--    względem project_id, więc WITH CHECK re-weryfikuje ją po zmianie -
--    to naturalnie blokuje "przeniesienie" wiersza między projektami.
--    projects nie ma odpowiednika: id się nie zmienia, więc zmiana
--    organization_id NIGDY nie jest re-weryfikowana względem nowej
--    organizacji. Owner/admin projektu mógłby więc przenieść projekt (a
--    z nim taski, pliki, decyzje, memory powiązane przez project_id) do
--    DOWOLNEJ organizacji, także takiej, do której nie należy, i
--    sfałszować created_by. Appka nigdy nie aktualizuje organization_id
--    ani created_by (grep potwierdza: UPDATE dotyka wyłącznie name,
--    description, status, color, allow_ai_auto_complete), więc
--    zawężenie niczego dziś nie psuje.
--
-- 2) public.project_files - GRANT UPDATE od 001 istnieje, ale appka
--    nigdy nie wywołuje UPDATE na tej tabeli (zero `.update(` w
--    kodzie). Odsłania to bez powodu storage_path/file_url/uploaded_by/
--    size_bytes na nadpisanie przez owner/admin projektu. Skoro
--    funkcja nie istnieje, REVOKE całości UPDATE - gdy powstanie np.
--    zmiana nazwy/kategorii pliku, kolejna migracja doda węższy GRANT.
--
-- 3) public.invitations - invitations_manager_update (001) nie
--    odzwierciedla różnicowania ról z INSERT: admin organizacji może
--    utworzyć zaproszenie tylko z rolą admin/member (nigdy owner -
--    invitations_org_admin_insert), ale UPDATE nie ma tego ograniczenia,
--    więc mógłby podnieść role na 'owner' w istniejącym zaproszeniu, albo
--    nadpisać email/token/organization_id/project_id. Appka w ogóle
--    jeszcze nie używa tej tabeli (funkcja zaproszeń niezaimplementowana
--    - grep: zero odwołań poza migracjami), więc najprostsze bezpieczne
--    posunięcie to REVOKE całości UPDATE teraz; przyszła migracja doda
--    GRANT na węższy zestaw kolumn (np. status, expires_at - nigdy role)
--    razem z faktyczną implementacją.
--
-- 4) public.context_sources / public.context_decisions - niższe ryzyko:
--    UPDATE jest tu samoweryfikujący się, bo polityka sprawdza rolę
--    względem project_id, a WITH CHECK re-weryfikuje ją po zmianie (jak
--    tasks/roadmap_phases) - więc "przeniesienie" między projektami jest
--    już zablokowane przez samo RLS. Jedyna nadmiarowa ekspozycja to
--    author / made_by (podszycie się pod autora - appka nigdy tych
--    kolumn nie aktualizuje, grep potwierdza UPDATE dotyka wyłącznie
--    treści: title/content/url/source_type dla sources,
--    title/description/decision_type/status/alternatives/impact dla
--    decisions).
--
-- Celowo POMINIĘTE (przeanalizowane, uznane za bezpieczne albo
-- niepilne): organization_members/project_members - user_id po zmianie
-- jest re-weryfikowany przez WITH CHECK względem tego samego
-- organization_id/project_id, więc nie przekracza uprawnień, jakie
-- wywołujący i tak ma z INSERT. subscriptions, plans, activity_logs,
-- context_relations, task_attempts - już bez luki (sprawdzone).
-- ============================================================

BEGIN;


-- 1) projects - krytyczne: zablokuj przenoszenie projektu między
--    organizacjami i podszywanie się pod twórcę.
REVOKE UPDATE ON public.projects FROM authenticated;

GRANT UPDATE (name, description, status, color, allow_ai_auto_complete)
    ON public.projects
    TO authenticated;


-- 2) project_files - cała powierzchnia UPDATE jest dziś nieużywana.
REVOKE UPDATE ON public.project_files FROM authenticated;


-- 3) invitations - funkcja zaproszeń jeszcze niezaimplementowana w
--    appce; zamknij lukę eskalacji roli teraz, węższy GRANT doda
--    migracja wprowadzająca faktyczną obsługę.
REVOKE UPDATE ON public.invitations FROM authenticated;


-- 4) context_sources / context_decisions - zawęź do kolumn treści,
--    wyklucz author/made_by (podszycie się pod autora).
REVOKE UPDATE ON public.context_sources FROM authenticated;

GRANT UPDATE (source_type, title, content, url)
    ON public.context_sources
    TO authenticated;

REVOKE UPDATE ON public.context_decisions FROM authenticated;

GRANT UPDATE (title, description, decision_type, status, alternatives, impact)
    ON public.context_decisions
    TO authenticated;


COMMIT;
