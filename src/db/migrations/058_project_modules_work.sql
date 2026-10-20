-- ============================================================
-- GUIDON - MIGRACJA 058
-- Modul zadan (tablica) tez da sie wylaczyc
-- ============================================================
--
-- Uruchomic PO 057.
--
-- KONTEKST
-- --------
-- 055 pozwalala ukryc wszystkie moduly poza tablica zadan. Nie kazdy
-- projekt w Guidonie to praca na zadaniach - zespol moze uzywac go tylko
-- jako bazy wiedzy, decyzji czy moodboardu. Teraz 'work' tez moze byc na
-- liscie disabled_modules.
--
-- Jak w 055 to ustawienie WYSWIETLANIA: zadania zostaja, API/MCP, pluginy,
-- bot i "Moje zadania" dalej je widza, tablica dziala pod bezposrednim
-- linkiem. Przeglad, czlonkowie, aktywnosc i ustawienia dalej sa zawsze
-- widoczne.
--
-- Lista w CHECK = PROJECT_MODULES w src/lib/work/project-modules.ts
-- (test:db sekcja 44 pilnuje zgodnosci).
-- ============================================================

BEGIN;


ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_disabled_modules_check;
ALTER TABLE public.projects
    ADD CONSTRAINT projects_disabled_modules_check
    CHECK (disabled_modules <@ ARRAY[
        'work', 'calendar', 'roadmap', 'files', 'knowledge', 'decisions',
        'references', 'technology', 'memory', 'context'
    ]::text[]);


COMMIT;
