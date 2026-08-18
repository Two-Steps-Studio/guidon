-- ============================================================
-- GUIDON — MIGRACJA 012
-- context_relations — sprzątanie sierot po usunięciu encji źródłowej
-- ============================================================
--
-- Uruchomić PO 011.
--
-- POWÓD
-- -----
-- `context_relations` nie może mieć klucza obcego do tabel źródłowych —
-- source_type/source_id (i target_type/target_id) są polimorficzne, a
-- PostgreSQL nie ma FK warunkowego "wskazuj na tabelę zależną od wartości
-- innej kolumny". Migracja 011 (sekcja SIEROTY) opisała ten stan wprost:
-- usunięcie np. taska nie kasuje relacji, które go dotyczyły — takie
-- wiersze fizycznie zostają w tabeli na zawsze, tylko RLS je maskuje
-- (`entity_project_id()` zwraca NULL dla nieistniejącej encji, więc
-- warunek `IS NOT NULL` w polityce SELECT nigdy nie przechodzi).
--
-- To "wygląda nieszkodliwie" wyłącznie z perspektywy UI. Wiersze rosną
-- bez ograniczenia przy każdym usunięciu taska/decyzji/pliku/źródła/
-- wpisu pamięci/fazy roadmapy — 011 świadomie zostawiło to jako osobny
-- temat, żeby nie mieszać denormalizacji kolumny z cleanup-triggerem.
-- To jest ten drugi temat.
--
-- ROZWIĄZANIE
-- -----------
-- Sześć triggerów AFTER DELETE, po jednym na każdą tabelę źródłową
-- (dokładnie te sześć typów, które `private.entity_project_id()` z 001
-- rozpoznaje — 'project' celowo pominięte: usunięcie projektu i tak
-- kasuje wszystkie jego relacje przez `project_id ... ON DELETE CASCADE`
-- dodane w 011, więc osobny trigger na `projects` byłby martwym kodem).
-- Każdy usuwa wiersze `context_relations`, w których skasowany rekord
-- występował jako source ALBO jako target — relacja jest symetryczna
-- w tym sensie, że obie strony muszą dalej istnieć, żeby wiersz miał
-- sens.
--
-- Jedna funkcja, nie sześć prawie identycznych — typ encji przychodzi
-- przez `TG_ARGV[0]`, standardowy mechanizm PostgreSQL do parametryzacji
-- funkcji triggera. Pierwszy taki przypadek w tym repo (sprawdzone:
-- `grep TG_ARGV src/db/migrations/*.sql` nic nie zwracał przed tą
-- migracją) — wybrane świadomie zamiast sześciu kopii tej samej logiki
-- DELETE z inną literą w środku, żeby literówka w jednej kopii nie
-- została nienotowana.
--
-- DLACZEGO AFTER, NIE BEFORE
-- --------------------------
-- Wiersz w tabeli źródłowej (task, decyzja, ...) musi już nie istnieć,
-- zanim `context_relations` zostanie oczyszczone — w przeciwnym razie
-- nie ma czego czyścić. BEFORE DELETE uruchomiłby się, gdy `OLD` wciąż
-- jest aktualny, ale nic w tej logice tego nie wymaga; AFTER jest
-- właściwym momentem i jest zgodne z resztą triggerów w tym repo
-- reagujących na już-zaszły fakt (np. `on_project_created` w 001).
--
-- BEZPIECZEŃSTWO / SECURITY DEFINER
-- ----------------------------------
-- Funkcja jest SECURITY DEFINER, bo DELETE na tabeli źródłowej może
-- wykonać ktoś bez uprawnień DELETE na `context_relations` bezpośrednio
-- (np. deleteTask() w aplikacji wymaga tylko project_role owner/admin
-- na PROJEKCIE taska — to już autoryzowało usunięcie taska, więc
-- posprzątanie relacji po nim nie powinno wymagać osobnego uprawnienia).
-- Sama funkcja nie przyjmuje żadnego wejścia od klienta — `OLD.id` i
-- `TG_ARGV[0]` pochodzą wyłącznie z silnika triggerów.
--
-- WERYFIKACJA
-- -----------
-- tests/db/compat.test.mjs, sekcja 9: tworzy relację, kasuje source,
-- sprawdza że wiersz zniknął; to samo dla target. Uruchomione na
-- PostgreSQL 18 (PGlite) przez `npm run test:db` — bez Dockera i bez
-- Supabase, jak reszta tego pliku.
-- ============================================================

BEGIN;


-- ============================================================
-- 1. FUNKCJA TRIGGERA (parametryzowana przez TG_ARGV[0])
-- ============================================================

CREATE FUNCTION private.cleanup_context_relations_on_delete()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
AS $$
DECLARE
    v_entity_type text := TG_ARGV[0];
BEGIN

    DELETE FROM public.context_relations
    WHERE (source_type = v_entity_type AND source_id = OLD.id)
       OR (target_type = v_entity_type AND target_id = OLD.id);

    RETURN OLD;

END;
$$;


-- ============================================================
-- 2. TRIGGERY — jeden na tabelę, ten sam entity_type co
--    private.entity_project_id() w 001 rozpoznaje dla tej tabeli.
-- ============================================================

DROP TRIGGER IF EXISTS cleanup_context_relations_on_task_delete ON public.tasks;

CREATE TRIGGER cleanup_context_relations_on_task_delete
    AFTER DELETE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION private.cleanup_context_relations_on_delete('task');


DROP TRIGGER IF EXISTS cleanup_context_relations_on_phase_delete ON public.roadmap_phases;

CREATE TRIGGER cleanup_context_relations_on_phase_delete
    AFTER DELETE ON public.roadmap_phases
    FOR EACH ROW
    EXECUTE FUNCTION private.cleanup_context_relations_on_delete('phase');


DROP TRIGGER IF EXISTS cleanup_context_relations_on_decision_delete ON public.context_decisions;

CREATE TRIGGER cleanup_context_relations_on_decision_delete
    AFTER DELETE ON public.context_decisions
    FOR EACH ROW
    EXECUTE FUNCTION private.cleanup_context_relations_on_delete('decision');


DROP TRIGGER IF EXISTS cleanup_context_relations_on_file_delete ON public.project_files;

CREATE TRIGGER cleanup_context_relations_on_file_delete
    AFTER DELETE ON public.project_files
    FOR EACH ROW
    EXECUTE FUNCTION private.cleanup_context_relations_on_delete('file');


DROP TRIGGER IF EXISTS cleanup_context_relations_on_source_delete ON public.context_sources;

CREATE TRIGGER cleanup_context_relations_on_source_delete
    AFTER DELETE ON public.context_sources
    FOR EACH ROW
    EXECUTE FUNCTION private.cleanup_context_relations_on_delete('source');


DROP TRIGGER IF EXISTS cleanup_context_relations_on_memory_delete ON public.project_memory;

CREATE TRIGGER cleanup_context_relations_on_memory_delete
    AFTER DELETE ON public.project_memory
    FOR EACH ROW
    EXECUTE FUNCTION private.cleanup_context_relations_on_delete('memory');


-- ============================================================
-- 3. BACKFILL — sieroty utworzone przed tą migracją
-- ============================================================
--
-- Wiersze, których source LUB target nie wskazuje już na istniejącą
-- encję. Ten sam bezpieczny zakres co "SIEROTY" w 011: takie wiersze
-- były już permanentnie niewidoczne pod polityką SELECT (entity_project_id
-- zwraca NULL, warunek IS NOT NULL nigdy nie przechodzi), więc usunięcie
-- ich teraz nie zmienia niczego, co jakikolwiek użytkownik mógł zobaczyć.
-- ============================================================

DELETE FROM public.context_relations cr
WHERE private.entity_project_id(cr.source_type, cr.source_id) IS NULL
   OR private.entity_project_id(cr.target_type, cr.target_id) IS NULL;


COMMIT;
