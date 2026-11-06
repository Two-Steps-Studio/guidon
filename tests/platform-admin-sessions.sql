-- Run only on disposable direct PostgreSQL after migrations 108 and 109.
BEGIN;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.platform_admin_auth_session_active(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.platform_admin_check_session(uuid,uuid,uuid,bytea,bytea,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Session verification is reachable by a public role';
  END IF;
  IF public.platform_admin_auth_session_active(gen_random_uuid(), gen_random_uuid()) THEN
    RAISE EXCEPTION 'Direct PostgreSQL cannot attest SAML sessions';
  END IF;
END $$;

-- A minimal Auth-owned table in this isolated fixture. Production Auth
-- maintains its own schema and is never modified by this test.
CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid, not_after timestamptz, aal text);
INSERT INTO auth.users (id, email) VALUES ('22222222-2222-4222-8222-222222222222', 'session-test@guidon.example.test');
INSERT INTO auth.sessions VALUES ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', NULL, 'aal2');
INSERT INTO public.platform_admin_grants (id, user_id, role)
VALUES ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'super_admin');
INSERT INTO public.platform_admin_sessions (grant_id, token_digest, auth_session_digest, verified_at, last_seen_at)
VALUES ('44444444-4444-4444-8444-444444444444', decode(repeat('aa',32),'hex'), decode(repeat('bb',32),'hex'), now() - interval '1 hour', now() - interval '10 minutes');

CREATE FUNCTION pg_temp.check_fixture(p_touch boolean, p_auth_digest bytea DEFAULT decode(repeat('bb',32),'hex'))
RETURNS boolean LANGUAGE sql AS $$
  SELECT public.platform_admin_check_session('22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
    p_auth_digest, decode(repeat('aa',32),'hex'), p_touch);
$$;

SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF NOT pg_temp.check_fixture(false) OR pg_temp.check_fixture(true, decode(repeat('cc',32),'hex')) THEN
    RAISE EXCEPTION 'Session binding failed';
  END IF;
  IF (SELECT last_seen_at FROM public.platform_admin_sessions) <> now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'A prefetch renewed the session';
  END IF;
  IF NOT pg_temp.check_fixture(true) THEN
    RAISE EXCEPTION 'Valid session rejected';
  END IF;
  IF (SELECT last_seen_at FROM public.platform_admin_sessions) <> now() THEN
    RAISE EXCEPTION 'A valid request did not renew activity';
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  UPDATE public.platform_admin_sessions SET last_seen_at = now() - interval '30 minutes';
  IF pg_temp.check_fixture(true) THEN RAISE EXCEPTION 'Idle session accepted'; END IF;
  UPDATE public.platform_admin_sessions SET verified_at = now() - interval '8 hours', last_seen_at = now();
  IF pg_temp.check_fixture(true) THEN RAISE EXCEPTION 'Absolute expiry ignored'; END IF;
  UPDATE public.platform_admin_sessions SET verified_at = now() - interval '1 hour', revoked_at = now();
  IF pg_temp.check_fixture(true) THEN RAISE EXCEPTION 'Revoked admin session accepted'; END IF;
  UPDATE public.platform_admin_sessions SET revoked_at = NULL;
  UPDATE auth.sessions SET aal = 'aal1';
  IF pg_temp.check_fixture(true) THEN RAISE EXCEPTION 'Downgraded Auth session accepted'; END IF;
  UPDATE auth.sessions SET aal = 'aal2', not_after = now();
  IF pg_temp.check_fixture(true) THEN RAISE EXCEPTION 'Expired Auth session accepted'; END IF;
  UPDATE auth.sessions SET not_after = NULL;
  UPDATE public.platform_admin_grants SET revoked_at = now();
  IF pg_temp.check_fixture(true) THEN RAISE EXCEPTION 'Revoked grant accepted'; END IF;
  UPDATE public.platform_admin_grants SET revoked_at = NULL;
  DELETE FROM auth.sessions;
  IF pg_temp.check_fixture(true) THEN RAISE EXCEPTION 'Revoked Auth session accepted'; END IF;
END $$;

ROLLBACK;
