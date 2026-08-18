-- ============================================================
-- GUIDON — MIGRACJA 011
-- context_relations.project_id (denormalizacja)
-- ============================================================
--
-- Uruchomić PO 010.
--
-- POWÓD
-- -----
-- `context_relations` nie ma dziś `project_id` — relacja jest zakotwiczona
-- wyłącznie przez encję źródłową, a RLS liczy to za każdym razem funkcją
-- `private.entity_project_id(source_type, source_id)` (001, §18). Aplikacja
-- nie może więc zapytać `.eq('project_id', ...)` i zamiast tego
-- (src/lib/context/project-relations.ts) najpierw zbiera identyfikatory
-- WSZYSTKICH encji projektu z 6 tabel, a dopiero potem filtruje relacje
-- klauzulą `.in('source_id', [...])` po tej liście. Przy większych
-- projektach to nie skaluje się (audyt, docs/self-hosting-audit.md §D).
--
-- KSZTAŁT
-- -------
-- Kolumna jest wypełniana WYŁĄCZNIE przez trigger BEFORE INSERT z
-- source_type/source_id — nigdy z wejścia klienta, tym samym wzorcem co
-- created_by w 005/006 (klient nie może jej podrobić). Backfill istniejących
-- wierszy tą samą funkcją. Po backfillu kolumna staje się NOT NULL z FK do
-- `projects(id) ON DELETE CASCADE` (usunięcie projektu usuwa jego relacje —
-- wcześniej nie było to wymuszone kluczem obcym w ogóle).
--
-- SIEROTY
-- -------
-- `context_relations` nie ma FK do tabel źródłowych (nie da się — source_type
-- jest polimorficzny), więc usunięcie np. taska nie kasuje relacji, które go
-- dotyczyły. Takie wiersze istnieją fizycznie, ale STARA polityka SELECT już
-- je ukrywała (entity_project_id zwraca NULL dla nieistniejącej encji, więc
-- warunek IS NOT NULL nigdy nie przechodzi) — dla każdego użytkownika
-- aplikacji były już nieosiągalne, dokładnie jak dwa smoke-testowe projekty
-- wyczyszczone w 007. Backfill nie może im nadać sensownego project_id
-- (entity_project_id zwraca NULL), więc są usuwane, żeby NOT NULL było
-- bezpieczne. Zakres: wyłącznie wiersze, których source_type/source_id nie
-- wskazuje już na żadną istniejącą encję — nic, co ktokolwiek mógł zobaczyć.
--
-- SKUTEK UBOCZNY: naprawiony błąd
-- --------------------------------
-- Stara polityka DELETE liczyła `private.project_role(entity_project_id(
-- source_type, source_id))`. Dla sieroty (source już usunięty)
-- entity_project_id zwraca NULL, project_role(NULL) nie jest prawdziwe dla
-- nikogo poza service_role — więc taki wiersz był nieusuwalny przez owner/
-- admin nawet z poziomu SQL-a jako zwykły użytkownik, tylko service_role
-- mógł go ruszyć (BYPASSRLS). Nowa polityka liczy project_role(project_id)
-- z kolumny zamrożonej w momencie insertu, więc przestaje zależeć od tego,
-- czy encja źródłowa nadal istnieje.
--
-- CO ZOSTAJE BEZ ZMIAN
-- ---------------------
-- Polityka SELECT nadal sprawdza entity_project_id(source)/entity_project_id
-- (target) IS NOT NULL — to komu wolno widzieć wiersz nie zmienia się:
-- sierotę nadal da się usunąć (patrz wyżej), ale nadal nie da się jej
-- zobaczyć w UI. To świadomie zachowawcze: ta migracja dokłada kolumnę i
-- naprawia jeden efekt uboczny przy okazji, nie rozwiązuje braku
-- cleanup-triggera przy kasowaniu tasków/decyzji/etc. — to osobny temat.
--
-- BEZPIECZEŃSTWO
-- --------------
-- Backfill i usunięcie sierot są nieodwracalne, ale ograniczone do wierszy,
-- które już były permanentnie niewidoczne dla każdego użytkownika aplikacji
-- pod starą polityką SELECT — usunięcie ich nie zmienia niczego
-- obserwowalnego. Sprawdzone npm run test:db po dopisaniu asercji.
-- ============================================================

BEGIN;


-- ============================================================
-- 1. KOLUMNA + BACKFILL
-- ============================================================

ALTER TABLE public.context_relations
    ADD COLUMN IF NOT EXISTS project_id uuid;

UPDATE public.context_relations
SET project_id = private.entity_project_id(source_type, source_id)
WHERE project_id IS NULL;

-- Patrz sekcja SIEROTY powyżej.
DELETE FROM public.context_relations
WHERE project_id IS NULL;

ALTER TABLE public.context_relations
    ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE public.context_relations
DROP CONSTRAINT IF EXISTS context_relations_project_id_fkey;

ALTER TABLE public.context_relations
    ADD CONSTRAINT context_relations_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_context_relations_project
    ON public.context_relations(project_id);


-- ============================================================
-- 2. TRIGGER — project_id jest zawsze pochodną source_type/source_id,
--    nigdy wejściem klienta (ten sam wzorzec co created_by w 005/006).
-- ============================================================

CREATE FUNCTION private.set_context_relation_project_id()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
AS $$
BEGIN
    NEW.project_id := private.entity_project_id(NEW.source_type, NEW.source_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_context_relation_project_id ON public.context_relations;

CREATE TRIGGER set_context_relation_project_id
    BEFORE INSERT ON public.context_relations
    FOR EACH ROW
    EXECUTE FUNCTION private.set_context_relation_project_id();


-- ============================================================
-- 3. RLS — project_id zastępuje powtórne wywołania entity_project_id(source)
--    tam, gdzie to bezpieczne; SELECT zachowuje dotychczasowe maskowanie
--    sierot (patrz komentarz na górze pliku).
-- ============================================================

DROP POLICY IF EXISTS context_relations_select ON public.context_relations;

CREATE POLICY context_relations_select
ON public.context_relations
FOR SELECT
TO authenticated
USING (
    private.project_access(project_id)
    AND private.entity_project_id(source_type, source_id) IS NOT NULL
    AND private.entity_project_id(source_type, source_id)
        = private.entity_project_id(target_type, target_id)
);


DROP POLICY IF EXISTS context_relations_insert ON public.context_relations;

CREATE POLICY context_relations_insert
ON public.context_relations
FOR INSERT
TO authenticated
WITH CHECK (
    created_by = (SELECT auth.uid())
    -- project_id jest już ustawione przez trigger BEFORE INSERT w tym
    -- momencie; ten warunek pilnuje, że target rozwiązuje się do TEGO
    -- SAMEGO projektu co source (relacja nie może przecinać projektów).
    AND private.entity_project_id(target_type, target_id) = project_id
    AND private.project_role(project_id) IN (
        'owner',
        'admin',
        'developer'
    )
);


DROP POLICY IF EXISTS context_relations_delete ON public.context_relations;

CREATE POLICY context_relations_delete
ON public.context_relations
FOR DELETE
TO authenticated
USING (
    private.project_role(project_id) IN (
        'owner',
        'admin'
    )
);


COMMIT;
