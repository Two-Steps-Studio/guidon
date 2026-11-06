CREATE TABLE public.platform_admin_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('support', 'incident', 'access')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  ended_at timestamptz
);
CREATE INDEX platform_admin_diagnostics_actor_idx ON public.platform_admin_diagnostics (actor_id);
CREATE INDEX platform_admin_diagnostics_target_idx ON public.platform_admin_diagnostics (target_id);

ALTER TABLE public.platform_admin_diagnostics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_diagnostics FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT (actor_id, target_id, reason), UPDATE (ended_at)
  ON public.platform_admin_diagnostics TO service_role;
