-- Uninstall archives data. It does not grant DELETE or drop record documents.
BEGIN;
ALTER TABLE public.project_module_packages
  ADD COLUMN IF NOT EXISTS installed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.project_module_packages DROP CONSTRAINT IF EXISTS module_lifecycle_shape;
ALTER TABLE public.project_module_packages ADD CONSTRAINT module_lifecycle_shape CHECK (installed OR NOT enabled);
ALTER TABLE public.project_module_packages DROP CONSTRAINT IF EXISTS module_settings_shape;
ALTER TABLE public.project_module_packages ADD CONSTRAINT module_settings_shape CHECK (
  jsonb_typeof(settings)='object' AND settings - 'defaultView' = '{}'::jsonb
  AND (NOT settings ? 'defaultView' OR (jsonb_typeof(settings->'defaultView')='string' AND settings->>'defaultView' ~ '^[a-z][a-z0-9-]{0,63}$'))
  AND octet_length(settings::text) <= 1024
);
GRANT UPDATE (installed,settings) ON public.project_module_packages TO authenticated;
COMMIT;
