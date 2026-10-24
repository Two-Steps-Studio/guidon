BEGIN;
CREATE TABLE IF NOT EXISTS public.project_module_drafts (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id,user_id),
  CONSTRAINT module_draft_shape CHECK (
    jsonb_typeof(state)='object' AND state->>'version'='1'
    AND jsonb_typeof(state->'present')='object'
    AND jsonb_typeof(state->'past')='array' AND jsonb_array_length(state->'past') <= 20
    AND jsonb_typeof(state->'future')='array' AND jsonb_array_length(state->'future') <= 20
    AND octet_length(state::text) <= 1100000
    AND state ?& ARRAY['version','present','past','future']
  )
);
CREATE INDEX IF NOT EXISTS module_drafts_user_idx ON public.project_module_drafts(user_id);
ALTER TABLE public.project_module_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_module_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.project_module_drafts TO authenticated;
GRANT UPDATE(state,revision,updated_at) ON public.project_module_drafts TO authenticated;
GRANT ALL ON public.project_module_drafts TO service_role;
DROP POLICY IF EXISTS module_drafts_select ON public.project_module_drafts;
CREATE POLICY module_drafts_select ON public.project_module_drafts FOR SELECT TO authenticated
  USING (user_id=(SELECT auth.uid()) AND private.project_role(project_id) IN ('owner','admin'));
DROP POLICY IF EXISTS module_drafts_insert ON public.project_module_drafts;
CREATE POLICY module_drafts_insert ON public.project_module_drafts FOR INSERT TO authenticated
  WITH CHECK (user_id=(SELECT auth.uid()) AND private.project_role(project_id) IN ('owner','admin'));
DROP POLICY IF EXISTS module_drafts_update ON public.project_module_drafts;
CREATE POLICY module_drafts_update ON public.project_module_drafts FOR UPDATE TO authenticated
  USING (user_id=(SELECT auth.uid()) AND private.project_role(project_id) IN ('owner','admin'))
  WITH CHECK (user_id=(SELECT auth.uid()) AND private.project_role(project_id) IN ('owner','admin'));
COMMIT;
