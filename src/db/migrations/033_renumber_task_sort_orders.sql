-- ============================================================
-- GUIDON - MIGRACJA 033
-- Wsadowa aktualizacja sort_order na Tablicy zadan (batch renumbering)
-- ============================================================
--
-- KONTEKST
-- --------
--
-- moveTask (src/app/projects/[id]/work/actions.ts) renumeruje CALA kolumne,
-- gdy zaokraglony sort_order przeciaganego zadania koliduje z sasiadem
-- (resolveColumnRenumbering w src/lib/work/task-board.ts - patrz komentarz
-- tam dla pelnego wyjasnienia, dlaczego integer sort_order czasem wymaga
-- pelnego przeliczenia calej kolumny, nie tylko jednego wiersza). Dotad obie
-- galezie (self-hosted przez pg, hosted przez supabase-js) robily to jedna
-- instrukcja UPDATE na wiersz w petli - dla kolumny z np. 50 zadaniami to
-- 50 kolejnych round-tripow do bazy w jednym przeciagnieciu karty, mierzalne
-- opoznienie na dokladnie tej interakcji, ktora musi wydawac sie natychmiastowa.
--
-- Ta funkcja pozwala hostowanej galezi (supabase-js nie ma surowego SQL)
-- zrobic to samo jedna instrukcja przez supabase.rpc(...) z tablicami
-- id/sort_order. Galaz self-hosted (src/lib/db/session.ts's withUser, surowy
-- pg) robi to samo bezposrednio przez UPDATE ... FROM unnest(...) bez
-- posrednictwa tej funkcji - ma juz dostep do surowego SQL, wiec nie
-- potrzebuje wrappera.
--
-- Zwykla (nie SECURITY DEFINER) funkcja SQL: dziala jako wywolujaca rola,
-- wiec istniejaca polityka RLS tasks_update (001, wymaga
-- private.project_role(project_id) IN ('owner','admin','developer')) chroni
-- kazdy wiersz dokladnie tak samo jak bezposredni UPDATE - ta funkcja tylko
-- pozwala PostgRESTowi wykonac wiele wierszy jednym wywolaniem, niczego nie
-- omija. Identyczne bezpieczenstwo, mniej round-tripow.
-- ============================================================

BEGIN;

CREATE FUNCTION public.renumber_task_sort_orders(
    p_ids uuid[],
    p_sort_orders integer[],
    p_project_id uuid
)
    RETURNS void
    LANGUAGE sql
SET search_path = ''
AS $$
UPDATE public.tasks AS t
SET sort_order = v.sort_order
FROM (
    SELECT unnest(p_ids) AS id, unnest(p_sort_orders) AS sort_order
) AS v
WHERE t.id = v.id AND t.project_id = p_project_id;
$$;

REVOKE ALL
    ON FUNCTION public.renumber_task_sort_orders(uuid[], integer[], uuid)
    FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.renumber_task_sort_orders(uuid[], integer[], uuid)
TO authenticated;

COMMIT;
