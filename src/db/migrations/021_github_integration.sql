-- ============================================================
-- GUIDON - MIGRACJA 021
-- Połączenie projektu z repozytorium GitHub (edycja kodu w aplikacji)
-- ============================================================
--
-- Uruchomić PO 020.
--
-- Jedno repo na projekt. Osoba, która łączy repo (owner/admin - patrz
-- polityki niżej) autoryzuje się przez GitHub OAuth ze scope'em "repo";
-- jej token trafia tu zaszyfrowany (src/lib/crypto/secret-box.ts) i jest
-- używany do wszystkich odczytów/zapisów repo w tym projekcie - commity
-- idą jako ten użytkownik, nie jako ten, kto akurat edytuje plik. To
-- świadome uproszczenie względem modelu "token per user" (ustalone z
-- użytkownikiem przy planowaniu tej funkcji).
--
-- access_token_encrypted NIGDY nie powinien trafić do zapytania, którego
-- wynik dociera do klienta - to jest egzekwowane w warstwie aplikacji
-- (src/lib/data/github-connection.ts rozdziela bezpieczny podzbiór kolumn
-- od pełnego wiersza z tokenem), RLS tutaj chroni tylko na poziomie wiersza.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.github_connections (
    project_id              uuid        PRIMARY KEY,
    connected_by            uuid        NOT NULL,
    github_login            text        NOT NULL,
    repo_owner              text        NOT NULL,
    repo_name               text        NOT NULL,
    default_branch          text        NOT NULL,
    access_token_encrypted  text        NOT NULL,
    token_scope             text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.github_connections
DROP CONSTRAINT IF EXISTS github_connections_project_id_fkey;

ALTER TABLE public.github_connections
    ADD CONSTRAINT github_connections_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;


ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;


-- Każdy członek projektu widzi ŻE repo jest podpięte (owner/repo/branch) -
-- to samo uprawnienie co widoczność samego projektu.
DROP POLICY IF EXISTS github_connections_select ON public.github_connections;
CREATE POLICY github_connections_select
ON public.github_connections
FOR SELECT
TO authenticated
USING (private.project_access(project_id));

-- Podpięcie/zmiana/odpięcie repo to konfiguracja projektu - tylko
-- owner/admin, tak jak project_board_columns (020) i roadmap_phases (001).
DROP POLICY IF EXISTS github_connections_insert ON public.github_connections;
CREATE POLICY github_connections_insert
ON public.github_connections
FOR INSERT
TO authenticated
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS github_connections_update ON public.github_connections;
CREATE POLICY github_connections_update
ON public.github_connections
FOR UPDATE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'))
WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS github_connections_delete ON public.github_connections;
CREATE POLICY github_connections_delete
ON public.github_connections
FOR DELETE
TO authenticated
USING (private.project_role(project_id) IN ('owner', 'admin'));


GRANT SELECT, INSERT, UPDATE, DELETE ON public.github_connections TO authenticated;


COMMIT;
