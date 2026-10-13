-- ============================================================
-- GUIDON - MIGRACJA 055
-- Wylaczane moduly projektu
-- ============================================================
--
-- Uruchomic PO 054.
--
-- KONTEKST
-- --------
-- Guidon ma pasowac do kazdej branzy, a nie kazdy zespol potrzebuje
-- Pamieci, Grafu czy Moodboardu. Owner/admin projektu wybiera w
-- ustawieniach (albo szablonem przy tworzeniu), ktore moduly widac w
-- nawigacji projektu i na jego stronie glownej.
--
-- To ustawienie WYSWIETLANIA, nie uprawnien: dane modulu zostaja, strony
-- dalej dzialaja pod bezposrednim linkiem (np. z wyszukiwarki czy
-- powiazania z zadaniem), a wlaczenie modulu z powrotem pokazuje wszystko
-- jak bylo. Dlatego przechowywane sa WYLACZONE moduly: pusta lista =
-- wszystko widoczne (stan istniejacych projektow), a modul dodany w
-- przyszlosci jest domyslnie widoczny wszedzie.
--
-- Lista dozwolonych wartosci w CHECK = PROJECT_MODULES w
-- src/lib/work/project-modules.ts (test:db pilnuje zgodnosci).
--
-- WAZNE: jak w 046 - GRANT UPDATE na projects jest zawezony do listy
-- kolumn, wiec nowa kolumna trafia do niej w tej samej migracji.
-- ============================================================

BEGIN;


ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS disabled_modules text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_disabled_modules_check;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_disabled_modules_check
    CHECK (disabled_modules <@ ARRAY[
        'calendar', 'roadmap', 'files', 'knowledge', 'decisions',
        'references', 'technology', 'memory', 'context'
    ]::text[]);


REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (name, description, status, color, allow_ai_auto_complete, avatar_url, project_type, methodology, ai_enabled, disabled_modules)
    ON public.projects
    TO authenticated;


COMMIT;
