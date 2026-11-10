-- ============================================================
-- GUIDON - MIGRACJA 123
-- Raport projektu: ukończone zadania tydzień po tygodniu i obciążenie osób
-- ============================================================
--
-- Uruchomić PO 122. Kod, który wywołuje funkcję (strona przeglądu projektu),
-- pokazuje bez niej pusty raport, więc kolejność wdrożenia nie jest krytyczna.
--
-- project_report(project_id, weeks) liczy w bazie to, co strona pokazuje:
--   - open / overdue / unassigned: otwarte zadania, po terminie, bez osoby,
--   - finished_per_week: ukończone zadania w ostatnich `weeks` tygodniach
--     (tydzień od poniedziałku, UTC), także tygodnie z zerem,
--   - workload: na osobę - otwarte, po terminie, ukończone w 30 dni.
-- Tylko zadania główne (bez podzadań), jak licznik na tej samej stronie
-- (lib/data/project-stats.ts). "Ukończone" = is_done (migracja 060),
-- "kiedy" = done_at (061).
--
-- SECURITY INVOKER: działa z uprawnieniami wywołującego, więc RLS na tasks i
-- profiles decyduje, co widać - ktoś spoza projektu dostaje same zera. Tylko
-- funkcja, bez nowych tabel i polityk. Idempotentna.
-- ============================================================

CREATE OR REPLACE FUNCTION public.project_report(p_project_id uuid, p_weeks integer DEFAULT 8)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH t AS (
    SELECT assignee_id, is_done, done_at, due_date
    FROM public.tasks
    WHERE project_id = p_project_id AND parent_task_id IS NULL
),
weeks AS (
    SELECT generate_series(
        date_trunc('week', now()) - make_interval(weeks => LEAST(GREATEST(p_weeks, 1), 26) - 1),
        date_trunc('week', now()),
        interval '1 week'
    ) AS week_start
),
people AS (
    SELECT t.assignee_id,
           count(*) FILTER (WHERE NOT t.is_done) AS open,
           count(*) FILTER (WHERE NOT t.is_done AND t.due_date < now()) AS overdue,
           count(*) FILTER (WHERE t.is_done AND t.done_at >= now() - interval '30 days') AS finished_30d
    FROM t
    WHERE t.assignee_id IS NOT NULL
    GROUP BY t.assignee_id
)
SELECT jsonb_build_object(
    'open', (SELECT count(*) FROM t WHERE NOT is_done),
    'overdue', (SELECT count(*) FROM t WHERE NOT is_done AND due_date < now()),
    'unassigned', (SELECT count(*) FROM t WHERE NOT is_done AND assignee_id IS NULL),
    'finished_per_week', (
        SELECT jsonb_agg(jsonb_build_object(
                   'week_start', w.week_start::date,
                   'finished', (SELECT count(*) FROM t
                                WHERE t.is_done AND t.done_at >= w.week_start
                                  AND t.done_at < w.week_start + interval '1 week'))
               ORDER BY w.week_start)
        FROM weeks w
    ),
    'workload', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'assignee_id', p.assignee_id,
                   'name', COALESCE(pr.full_name, pr.email),
                   'avatar_url', pr.avatar_url,
                   'open', p.open,
                   'overdue', p.overdue,
                   'finished_30d', p.finished_30d)
               ORDER BY p.open DESC, p.finished_30d DESC)
        FROM people p
        LEFT JOIN public.profiles pr ON pr.id = p.assignee_id
        WHERE p.open > 0 OR p.finished_30d > 0
    ), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.project_report(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_report(uuid, integer) TO authenticated;
