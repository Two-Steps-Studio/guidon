-- Initial read-only registry. Publishing is restricted to the service role;
-- a published listing never grants access to an organization's private listing.
BEGIN;
CREATE TABLE IF NOT EXISTS public.module_catalog_entries (
  module_id text NOT NULL CHECK (module_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  version text NOT NULL CHECK (length(version) BETWEEN 1 AND 128),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('planning','research','operations')),
  description text NOT NULL CHECK (length(description) <= 2000),
  changelog text NOT NULL DEFAULT '' CHECK (length(changelog) <= 4000),
  screenshots text[] NOT NULL DEFAULT '{}' CHECK (cardinality(screenshots) <= 8),
  manifest jsonb NOT NULL,
  demo_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  published boolean NOT NULL DEFAULT false,
  PRIMARY KEY (module_id, version),
  CHECK (jsonb_typeof(manifest)='object' AND manifest->>'id' IS NOT NULL AND manifest->>'id'=module_id AND manifest->>'version' IS NOT NULL AND manifest->>'version'=version AND octet_length(manifest::text)<=256000),
  CHECK (jsonb_typeof(demo_records)='array' AND jsonb_array_length(demo_records)<=1000 AND octet_length(demo_records::text)<=1100000)
);
CREATE INDEX IF NOT EXISTS module_catalog_organization_idx ON public.module_catalog_entries(organization_id);
ALTER TABLE public.module_catalog_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.module_catalog_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.module_catalog_entries TO authenticated;
GRANT ALL ON public.module_catalog_entries TO service_role;
DROP POLICY IF EXISTS module_catalog_read ON public.module_catalog_entries;
CREATE POLICY module_catalog_read ON public.module_catalog_entries FOR SELECT TO authenticated
  USING (published AND (organization_id IS NULL OR private.is_org_member(organization_id)));

-- A real first-party registry entry with demo data, no fictional installation counts.
INSERT INTO public.module_catalog_entries(module_id,version,category,description,manifest,demo_records,published,changelog,screenshots)
VALUES ('release-planning','1.0.0','planning','Plan releases with a table, status board, form, count chart and calendar agenda.',
  '{"manifestVersion":1,"id":"release-planning","name":"Release planning","version":"1.0.0","author":{"name":"Guidon"},"engine":{"minVersion":"1.0.0","maxVersionExclusive":"2.0.0"},"permissions":["module-data:read","module-data:write"],"entities":[{"id":"release","name":"Release","fields":[{"id":"name","name":"Name","type":"text","required":true,"maxLength":120},{"id":"status","name":"Status","type":"select","required":true,"options":[{"value":"planned","label":"Planned"},{"value":"ready","label":"Ready"},{"value":"shipped","label":"Shipped"}]},{"id":"due","name":"Release date","type":"date"}]}],"views":[{"id":"releases","name":"Releases","type":"table","entity":"release","fields":["name","status","due"]},{"id":"new-release","name":"New release","type":"form","entity":"release","fields":["name","status","due"]},{"id":"release-board","name":"Release board","type":"board","entity":"release","fields":["name","status","due"],"groupBy":"status"},{"id":"release-chart","name":"Release status","type":"chart","entity":"release","fields":["status"],"groupBy":"status"},{"id":"release-calendar","name":"Release calendar","type":"calendar","entity":"release","fields":["name","due"],"dateField":"due"}]}',
  '[{"id":"10000000-0000-4000-8000-000000000001","entity":"release","values":{"name":"Example release","status":"planned","due":"2026-11-02"}}]', true,
  'Initial release with five declarative views and project-scoped data.', ARRAY['/module-media/release-planning.png'])
ON CONFLICT (module_id,version) DO NOTHING;
COMMIT;
