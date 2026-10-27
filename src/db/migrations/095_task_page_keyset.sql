-- ============================================================
-- GUIDON - MIGRACJA 095
-- Szybkie stronicowanie GET /api/v1/projects/{id}/tasks
-- ============================================================
--
-- Uruchomic PO 072 (niezalezna od 093/094 - kolejnosc numerow nie ma
-- znaczenia dla scripts/migrate.mjs).
--
-- KONTEKST
-- --------
-- list_project_tasks_page (072) mial jeden warunek z OR dla trzech
-- przypadkow (bez kursora / kursor istnieje / zadanie z kursora usuniete).
-- Planer nie mogl wtedy uzyc zakresu na idx_tasks_project_created_at i
-- filtrowal wszystkie wczesniejsze wiersze (z RLS na kazdym): przy 3000
-- zadaniach glebsza strona trwala ~640 ms zamiast ~25 ms, a przejscie
-- calej listy rosnelo kwadratowo (docs/release/performance-baseline-2026-10-27.md).
--
-- Teraz kotwica jest czytana raz, a kazdy przypadek ma wlasne zapytanie
-- z warunkiem (created_at, id) < (...), ktory idzie po indeksie. Wynik,
-- kolejnosc, limit i SECURITY INVOKER (RLS uzytkownika) bez zmian.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.list_project_tasks_page(
    p_project_id uuid,
    p_limit integer,
    p_after_id uuid DEFAULT NULL,
    p_after_at timestamptz DEFAULT NULL
)
RETURNS SETOF public.tasks
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
    page_size integer := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1001);
    anchor_at timestamptz;
BEGIN
    IF p_after_id IS NULL THEN
        RETURN QUERY
            SELECT t.* FROM public.tasks t
            WHERE t.project_id = p_project_id
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT page_size;
        RETURN;
    END IF;

    SELECT a.created_at INTO anchor_at
    FROM public.tasks a
    WHERE a.id = p_after_id AND a.project_id = p_project_id;

    IF anchor_at IS NOT NULL THEN
        RETURN QUERY
            SELECT t.* FROM public.tasks t
            WHERE t.project_id = p_project_id
              AND (t.created_at, t.id) < (anchor_at, p_after_id)
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT page_size;
    ELSE
        -- The cursor's task is gone: its time from the cursor has
        -- millisecond precision, so compare at that precision. The extra
        -- created_at bound lets the index narrow the range first.
        RETURN QUERY
            SELECT t.* FROM public.tasks t
            WHERE t.project_id = p_project_id
              AND t.created_at < date_trunc('milliseconds', p_after_at) + interval '1 millisecond'
              AND (date_trunc('milliseconds', t.created_at), t.id) < (date_trunc('milliseconds', p_after_at), p_after_id)
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT page_size;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_project_tasks_page(uuid, integer, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_project_tasks_page(uuid, integer, uuid, timestamptz) TO authenticated, service_role;

COMMIT;
