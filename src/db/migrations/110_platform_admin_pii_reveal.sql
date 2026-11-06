-- Serialize disclosures per administrator across app instances. The audit
-- event and profile read commit together before the application gets PII.
CREATE INDEX platform_admin_pii_reveal_recent_idx
  ON public.platform_admin_audit_events (actor_id, created_at DESC)
  WHERE action = 'users.pii.reveal' AND outcome IN ('succeeded', 'failed');

CREATE FUNCTION public.platform_admin_reveal_profile(p_actor uuid, p_target uuid, p_request uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  profile jsonb;
  result text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text, 110));
  IF (
    SELECT count(*) FROM public.platform_admin_audit_events
    WHERE actor_id = p_actor AND action = 'users.pii.reveal' AND outcome IN ('succeeded', 'failed')
      AND created_at > pg_catalog.clock_timestamp() - interval '1 minute'
  ) >= 10 THEN
    RETURN jsonb_build_object('status', 'limited');
  END IF;

  IF p_target IS NOT NULL THEN
    SELECT jsonb_build_object('email', email, 'name', full_name) INTO profile
    FROM public.profiles WHERE id = p_target;
  END IF;
  result := CASE WHEN profile IS NULL THEN 'failed' ELSE 'succeeded' END;
  INSERT INTO public.platform_admin_audit_events (actor_id, action, target_type, target_id, outcome, request_id, created_at)
    VALUES (p_actor, 'users.pii.reveal', 'user', p_target::text, result, p_request, pg_catalog.clock_timestamp());
  RETURN jsonb_build_object('status', result, 'profile', profile);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_reveal_profile(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_admin_reveal_profile(uuid, uuid, uuid) TO service_role;
