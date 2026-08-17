BEGIN;

-- ============================================================
-- GUIDON — MIGRACJA 008
-- Kategoria technologii: game_engine
-- ============================================================
--
-- Uruchomić PO 007.
--
-- POWÓD
-- -----
-- Moduł DEV w tss-website obsługuje kategorię `game_engine`
-- (Unity, Unreal, Godot). Guidon jej nie ma — jego CHECK
-- dopuszcza wyłącznie:
--
--     frontend | backend | database | devops | ai | other
--
-- Przy przenoszeniu strony technologii z DEV do Guidona silniki
-- gier wylądowałyby w `backend`, co dla studia gamedev jest
-- realną utratą informacji. TODO.md §13 wprost wymienia gamedev
-- jako pierwszy przypadek użycia, a §23 ostrzega, żeby nie
-- zaszywać produktu wokół gamedevu — ale jedna kategoria to nie
-- zaszywanie, tylko brak regresji wobec DEV.
--
-- BEZPIECZEŃSTWO
-- --------------
-- Zmiana wyłącznie rozszerzająca. Żaden istniejący wiersz nie
-- narusza nowego ograniczenia, więc nie ma migracji danych.
-- ============================================================


DO $$
DECLARE
    r RECORD;
BEGIN

    -- Nazwa ograniczenia bywa różna między środowiskami, więc
    -- jest wyszukiwana, a nie zakładana.
    FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel
             ON rel.oid = con.conrelid
        JOIN pg_namespace nsp
             ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'technologies'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%category%'
    LOOP

        EXECUTE format(
            'ALTER TABLE public.technologies DROP CONSTRAINT %I',
            r.conname
        );

    END LOOP;

END
$$;


ALTER TABLE public.technologies
    ALTER COLUMN category SET DEFAULT 'other';

ALTER TABLE public.technologies
    ALTER COLUMN category SET NOT NULL;

ALTER TABLE public.technologies
    ADD CONSTRAINT technologies_category_check
        CHECK (
            category IN (
                'frontend',
                'backend',
                'game_engine',
                'database',
                'devops',
                'ai',
                'other'
            )
        );


-- Strona technologii grupuje po kategorii w obrębie projektu.
CREATE INDEX IF NOT EXISTS idx_technologies_project_category
    ON public.technologies (project_id, category, sort_order);


COMMIT;
