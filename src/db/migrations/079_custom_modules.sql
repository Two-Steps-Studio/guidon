BEGIN;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS custom_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_modules_revision integer NOT NULL DEFAULT 0;

ALTER TABLE public.projects ADD CONSTRAINT projects_custom_modules_shape CHECK (
  jsonb_typeof(custom_modules) = 'array'
  AND jsonb_array_length(custom_modules) <= 20
  AND octet_length(custom_modules::text) <= 100000
);
ALTER TABLE public.projects ADD CONSTRAINT projects_custom_modules_revision_check
  CHECK (custom_modules_revision >= 0);

-- Existing projects_update RLS still limits updates to project owners/admins.
GRANT UPDATE (custom_modules, custom_modules_revision) ON public.projects TO authenticated;

COMMIT;
