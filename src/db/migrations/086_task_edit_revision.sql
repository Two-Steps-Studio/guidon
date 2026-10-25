BEGIN;

-- Integer CAS avoids timestamp precision differences between pg and PostgREST.
-- Expansion only: existing clients can keep making authorized partial patches.
ALTER TABLE public.tasks ADD COLUMN revision integer NOT NULL DEFAULT 0
  CHECK (revision >= 0);

CREATE FUNCTION private.bump_task_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 0;
  ELSE
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.bump_task_revision() FROM PUBLIC;

CREATE TRIGGER task_edit_revision
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.bump_task_revision();

COMMIT;
