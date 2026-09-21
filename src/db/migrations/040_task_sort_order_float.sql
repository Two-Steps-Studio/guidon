-- ============================================================
-- GUIDON - MIGRACJA 040
-- tasks.sort_order: integer -> double precision
-- ============================================================
--
-- Uruchomic PO 039.
--
-- Wstawianie karty "w srodek" kolumny liczy sort_order jako srodek miedzy
-- sasiadami (sortOrderForPosition w src/lib/work/task-board.ts oraz jej port
-- w wtyczce Unity, GuidonSortOrder.cs) - wynik bywa ulamkiem (np. 1062.5).
-- Aplikacja webowa zaokragla go i w razie kolizji przenumerowuje kolumne po
-- stronie serwera (moveTask), ale wtyczka Unity wysyla surowy ulamek do
-- PATCH /api/v1/tasks/{id}, a kolumna typu integer odrzucala go bledem
--   invalid input syntax for type integer: "1062.5"
-- wiec przeciagniecie karty miedzy dwie inne konczylo sie 400.
--
-- double precision (a nie numeric: sterownik pg zwraca numeric jako string)
-- przechowuje ulamki bez zmian dla istniejacych, calkowitych wartosci.
-- Indeksy po sort_order (002, 037) sa przebudowywane automatycznie.
-- ============================================================

BEGIN;


ALTER TABLE public.tasks
    ALTER COLUMN sort_order TYPE double precision;


COMMIT;
