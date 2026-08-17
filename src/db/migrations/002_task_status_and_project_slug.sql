BEGIN;

-- ============================================================
-- GUIDON — MIGRATION 002
-- Task status vocabulary + project slug
-- ============================================================
--
-- Run AFTER 001_initial_schema.sql.
--
-- DOES:
--   - normalise tasks.status to the Guidon vocabulary
--       backlog | todo | in_progress | review | done
--     remapping legacy values (testing -> review, completed -> done)
--   - add projects.slug, unique per organization, backfilled from name
--
-- SAFE TO RE-RUN: every step is guarded.
--
-- NOTE: the application tolerates BOTH the legacy and the new
-- vocabulary at read time, so the UI keeps working before and
-- after this migration is applied.
-- ============================================================


-- ============================================================
-- 1. TASKS — STATUS VOCABULARY
-- ============================================================

-- 1a. Drop whatever CHECK constraint currently guards tasks.status.
--     The constraint name differs between environments, so it is
--     discovered rather than assumed.

DO $$
DECLARE
    r RECORD;
BEGIN

    FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel
             ON rel.oid = con.conrelid
        JOIN pg_namespace nsp
             ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'tasks'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%status%'
    LOOP

        EXECUTE format(
            'ALTER TABLE public.tasks DROP CONSTRAINT %I',
            r.conname
        );

    END LOOP;

END
$$;


-- 1b. Remap legacy values onto the new vocabulary.

UPDATE public.tasks
SET status = 'review'
WHERE status = 'testing';

UPDATE public.tasks
SET status = 'done'
WHERE status IN ('completed', 'complete');

UPDATE public.tasks
SET status = 'in_progress'
WHERE status IN ('in-progress', 'inprogress', 'doing');

-- Anything still unrecognised is parked in backlog rather than
-- blocking the constraint below.

UPDATE public.tasks
SET status = 'backlog'
WHERE status IS NULL
   OR status NOT IN (
        'backlog',
        'todo',
        'in_progress',
        'review',
        'done'
   );


-- 1c. Re-apply the constraint over the new vocabulary.

ALTER TABLE public.tasks
    ALTER COLUMN status SET DEFAULT 'todo';

ALTER TABLE public.tasks
    ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_status_check
        CHECK (
            status IN (
                'backlog',
                'todo',
                'in_progress',
                'review',
                'done'
            )
        );


-- 1d. Priority vocabulary — align the same way, defensively.

DO $$
DECLARE
    r RECORD;
BEGIN

    FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel
             ON rel.oid = con.conrelid
        JOIN pg_namespace nsp
             ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'tasks'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%priority%'
    LOOP

        EXECUTE format(
            'ALTER TABLE public.tasks DROP CONSTRAINT %I',
            r.conname
        );

    END LOOP;

END
$$;


UPDATE public.tasks
SET priority = 'medium'
WHERE priority IS NULL
   OR priority NOT IN (
        'low',
        'medium',
        'high',
        'critical'
   );


ALTER TABLE public.tasks
    ALTER COLUMN priority SET DEFAULT 'medium';

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_priority_check
        CHECK (
            priority IN (
                'low',
                'medium',
                'high',
                'critical'
            )
        );


-- 1e. The board orders by (status, sort_order); index accordingly.

CREATE INDEX IF NOT EXISTS idx_tasks_project_status_sort
    ON public.tasks (project_id, status, sort_order);


-- ============================================================
-- 2. PROJECTS — SLUG
-- ============================================================

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS slug text;


-- 2a. Backfill from name: lowercase, non-alphanumerics collapsed
--     to single hyphens, trimmed. Collisions inside the same
--     organization get a numeric suffix.

WITH normalised AS (
    SELECT
        p.id,
        p.organization_id,
        COALESCE(
            NULLIF(
                trim(
                    BOTH '-' FROM
                    regexp_replace(
                        lower(p.name),
                        '[^a-z0-9]+',
                        '-',
                        'g'
                    )
                ),
                ''
            ),
            'project'
        ) AS base
    FROM public.projects p
    WHERE p.slug IS NULL
       OR p.slug = ''
),
ranked AS (
    SELECT
        n.id,
        n.base,
        ROW_NUMBER() OVER (
            PARTITION BY n.organization_id, n.base
            ORDER BY n.id
        ) AS rn
    FROM normalised n
)
UPDATE public.projects p
SET slug = CASE
               WHEN r.rn = 1 THEN r.base
               ELSE r.base || '-' || r.rn::text
           END
FROM ranked r
WHERE p.id = r.id;


-- 2b. Shape constraints.

ALTER TABLE public.projects
    ALTER COLUMN slug SET NOT NULL;


DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_slug_format'
    ) THEN

        ALTER TABLE public.projects
            ADD CONSTRAINT projects_slug_format
                CHECK (
                    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                    AND length(slug) BETWEEN 1 AND 64
                );

    END IF;

END
$$;


-- 2c. Unique per organization (not globally — two organizations
--     may both have a project called "website").

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_org_slug
    ON public.projects (organization_id, slug);


COMMIT;
