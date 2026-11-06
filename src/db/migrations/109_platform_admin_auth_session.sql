-- Supabase Auth sessions are not exposed through the Data API. Expose only
-- a boolean to service_role and keep the privileged lookup in its own schema.
-- The direct-Postgres auth compatibility schema has no auth.sessions table.
CREATE SCHEMA platform_admin_private;
REVOKE ALL ON SCHEMA platform_admin_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA platform_admin_private TO service_role;

CREATE FUNCTION platform_admin_private.auth_session_active(p_user_id uuid, p_session_id uuid, p_require_aal2 boolean)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.to_regclass('auth.sessions') IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM auth.sessions
    WHERE id = p_session_id AND user_id = p_user_id
      AND (not_after IS NULL OR not_after > pg_catalog.now())
      AND (NOT p_require_aal2 OR aal = 'aal2')
  );
END;
$$;

CREATE FUNCTION public.platform_admin_auth_session_active(p_user_id uuid, p_session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT platform_admin_private.auth_session_active(p_user_id, p_session_id, false);
$$;

REVOKE ALL ON FUNCTION platform_admin_private.auth_session_active(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.platform_admin_auth_session_active(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform_admin_private.auth_session_active(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_admin_auth_session_active(uuid, uuid) TO service_role;

CREATE FUNCTION public.platform_admin_check_session(
  p_user_id uuid, p_grant_id uuid, p_auth_session_id uuid,
  p_auth_session_digest bytea, p_token_digest bytea, p_touch boolean
)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  checked_at timestamptz := pg_catalog.now();
  matching_id uuid;
BEGIN
  IF NOT platform_admin_private.auth_session_active(p_user_id, p_auth_session_id, true) OR NOT EXISTS (
    SELECT 1 FROM public.platform_admin_grants
    WHERE id = p_grant_id AND user_id = p_user_id AND revoked_at IS NULL
  ) THEN
    RETURN false;
  END IF;

  IF p_touch THEN
    UPDATE public.platform_admin_sessions SET last_seen_at = GREATEST(last_seen_at, checked_at)
    WHERE grant_id = p_grant_id AND token_digest = p_token_digest
      AND auth_session_digest = p_auth_session_digest AND revoked_at IS NULL
      AND last_seen_at > checked_at - interval '30 minutes'
      AND verified_at > checked_at - interval '8 hours'
    RETURNING id INTO matching_id;
  ELSE
    SELECT id INTO matching_id FROM public.platform_admin_sessions
    WHERE grant_id = p_grant_id AND token_digest = p_token_digest
      AND auth_session_digest = p_auth_session_digest AND revoked_at IS NULL
      AND last_seen_at > checked_at - interval '30 minutes'
      AND verified_at > checked_at - interval '8 hours';
  END IF;
  RETURN matching_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_check_session(uuid, uuid, uuid, bytea, bytea, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_admin_check_session(uuid, uuid, uuid, bytea, bytea, boolean) TO service_role;
