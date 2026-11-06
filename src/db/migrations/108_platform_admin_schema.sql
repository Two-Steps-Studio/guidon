-- Platform administration foundation. Organization roles remain independent.
-- Grant the first platform role by verified auth.users.id as a database owner.
-- An ADMIN_EMAILS entry never creates a grant automatically.

CREATE TABLE public.platform_admin_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin', 'support', 'finance', 'engineering', 'read_only')),
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE UNIQUE INDEX platform_admin_grants_active_user_idx
  ON public.platform_admin_grants (user_id) WHERE revoked_at IS NULL;
CREATE INDEX platform_admin_grants_user_idx ON public.platform_admin_grants (user_id);

CREATE TABLE public.platform_admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES public.platform_admin_grants(id) ON DELETE CASCADE,
  token_digest bytea NOT NULL UNIQUE CHECK (octet_length(token_digest) = 32),
  auth_session_digest bytea NOT NULL CHECK (octet_length(auth_session_digest) = 32),
  verified_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (last_seen_at >= verified_at),
  CHECK (revoked_at IS NULL OR revoked_at >= verified_at)
);

CREATE INDEX platform_admin_sessions_grant_idx ON public.platform_admin_sessions (grant_id);
CREATE INDEX platform_admin_sessions_idle_idx
  ON public.platform_admin_sessions (last_seen_at) WHERE revoked_at IS NULL;

CREATE TABLE public.platform_admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Preserve historical actor and target references across account deletion.
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 100),
  target_type text NOT NULL CHECK (char_length(target_type) BETWEEN 1 AND 64),
  target_id text CHECK (target_id IS NULL OR char_length(target_id) BETWEEN 1 AND 200),
  outcome text NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'denied')),
  request_id uuid NOT NULL,
  before_state jsonb CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object'),
  after_state jsonb CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object'),
  ip_address inet,
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 512),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_admin_audit_time_idx ON public.platform_admin_audit_events (created_at DESC, id DESC);
CREATE INDEX platform_admin_audit_actor_idx ON public.platform_admin_audit_events (actor_id, created_at DESC, id DESC);
CREATE INDEX platform_admin_audit_action_idx ON public.platform_admin_audit_events (action, created_at DESC, id DESC);
CREATE INDEX platform_admin_audit_target_idx ON public.platform_admin_audit_events (target_type, target_id, created_at DESC, id DESC);

ALTER TABLE public.platform_admin_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_admin_grants, public.platform_admin_sessions, public.platform_admin_audit_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.platform_admin_grants TO service_role;
GRANT SELECT, INSERT ON public.platform_admin_sessions TO service_role;
GRANT UPDATE (last_seen_at, revoked_at) ON public.platform_admin_sessions TO service_role;
GRANT SELECT, INSERT ON public.platform_admin_audit_events TO service_role;
