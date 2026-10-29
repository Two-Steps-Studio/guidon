-- Read-only diagnostics for task editing. This file is intentionally unnumbered:
-- it must not become migration history and does not repair or backfill anything.
BEGIN READ ONLY;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tasks'
  AND column_name IN ('id', 'revision')
ORDER BY column_name;

SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition
FROM pg_catalog.pg_trigger t
WHERE t.tgrelid = to_regclass('public.tasks')
  AND NOT t.tgisinternal AND t.tgname = 'task_edit_revision';

SELECT to_regnamespace('private') IS NOT NULL AS private_schema_present,
       to_regprocedure('private.bump_task_revision()') IS NOT NULL AS revision_function_present,
       to_regclass('public.guidon_migrations') IS NOT NULL AS migration_registry_present;

ROLLBACK;
