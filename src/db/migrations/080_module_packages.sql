-- Declarative packages are isolated by their owning project. No module SQL,
-- credentials, code or remote resource execution is permitted.
BEGIN;

CREATE TABLE IF NOT EXISTS public.project_module_packages (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_id text NOT NULL CHECK (module_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  manifest jsonb NOT NULL,
  records jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (project_id, module_id),
  CONSTRAINT module_manifest_shape CHECK (
    jsonb_typeof(manifest) = 'object'
    AND manifest->>'id' IS NOT NULL AND manifest->>'id' = module_id
    AND manifest->>'manifestVersion' IS NOT NULL AND manifest->>'manifestVersion' = '1'
    AND octet_length(manifest::text) <= 256000
  ),
  CONSTRAINT module_records_shape CHECK (
    jsonb_typeof(records) = 'array'
    AND jsonb_array_length(records) <= 1000
    AND octet_length(records::text) <= 1100000
  )
);

ALTER TABLE public.project_module_packages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_module_packages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.project_module_packages TO authenticated;
GRANT UPDATE (manifest, records, revision, enabled) ON public.project_module_packages TO authenticated;
GRANT ALL ON public.project_module_packages TO service_role;

DROP POLICY IF EXISTS module_packages_select ON public.project_module_packages;
CREATE POLICY module_packages_select ON public.project_module_packages
  FOR SELECT TO authenticated USING (private.project_access(project_id));
DROP POLICY IF EXISTS module_packages_insert ON public.project_module_packages;
CREATE POLICY module_packages_insert ON public.project_module_packages
  FOR INSERT TO authenticated WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));
DROP POLICY IF EXISTS module_packages_update ON public.project_module_packages;
CREATE POLICY module_packages_update ON public.project_module_packages
  FOR UPDATE TO authenticated
  USING (private.project_role(project_id) IN ('owner', 'admin'))
  WITH CHECK (private.project_role(project_id) IN ('owner', 'admin'));

CREATE OR REPLACE FUNCTION private.enforce_module_package_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  -- Serialize installations in a project; concurrent inserts cannot race the cap.
  PERFORM id FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  IF (SELECT count(*) FROM public.project_module_packages WHERE project_id = NEW.project_id) >= 20 THEN
    RAISE EXCEPTION 'Project module package limit reached' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_module_package_limit() FROM PUBLIC;
DROP TRIGGER IF EXISTS module_package_limit ON public.project_module_packages;
CREATE TRIGGER module_package_limit BEFORE INSERT ON public.project_module_packages
  FOR EACH ROW EXECUTE FUNCTION private.enforce_module_package_limit();

COMMIT;
